var bleno = require('bleno');
var fs = require('fs');
const vioPath = "vioData.json";
const devicePath = "deviceLocation.json";


// Writing json Asynchronously into file
function writeFile(path, json) {
    fs.appendFile(path, json + '\n', (err) => {
        if (err) {
            console.log('writeFile got an error:' + err);
        }
    });
}

function serializeFile(devicePath) {
    var text = fs.readFileSync(devicePath);
    return text;
}

var Descriptor = bleno.Descriptor;
var descriptor = new Descriptor({
    uuid: '2901',
    value: 'write vio data & read location'
});

var Characteristic = bleno.Characteristic;
const { exec } = require("child_process");

var characteristic = new Characteristic({
    uuid: '0000fff100001000800000805f9b34fb',
    properties: ['read', 'write', 'writeWithoutResponse', 'notify'],
    descriptors: [descriptor],
    onSubscribe: function(maxValueSize, updateValueCallback) {
        console.log('Notification subscribed!');
        this.flag = false;
        this.counter = 0;
        this._updateValueCallback = updateValueCallback;

        // 开启文件监听，变化后改变flag
        console.log("listening in: " + devicePath);
        fs.watchFile(devicePath, {"persistent":true, "interval":600}, (event, filename) => {
            if (filename) {
                this.flag = true;
                this.counter += 1;
                // console.log("文件发生更新");
            }
        })

        // 检查flag
        this.changeInterval = setInterval(function() {
            if(this.flag) {
                var data = Buffer.from("更新次数：" + this.counter);
                console.log("deviceLocation has changed!");
                updateValueCallback(data);
            }   
            this.flag = 0;
        }.bind(this), 2000);
    },
    onUnsubscribe: function() {
        this.maxValueSize = null;
        this.updateValueCallback = null;
        // 免得关掉notification之后，上面interval还在不停打印
        clearInterval(this.changeInterval);
    },
    onReadRequest: function(offset, callback) {
        console.log('read request at offset: ' + offset);
        var data = serializeFile(devicePath);
        if (!data) {
            callback(this.RESULT_UNLIKELY_ERROR); // 如果获取数据失败，返回错误
        } else {
            console.log((data.slice(offset)).toString('utf8'));
            callback(this.RESULT_SUCCESS, data.slice(offset)); // 如果获取数据成功，则返回数据片段（从offset开始）
        }
    },
    onWriteRequest: function(newData, offset, withoutResponse, callback) {
        var res = newData.toString('utf8')

        if(res.includes("moStart")) {
            var subprocess = exec("sudo python3 test.py", (error, stdout, stderr) => {
                if(error) {
                     console.log(error.message);
                     return;
                }
                if(stderr) {
                     console.log('stderr: ${stderr}');
                }
                console.log(stdout);
            });
        }
        else if(res.includes("moEnd")) {
            exec("sudo pkill -f python3", (error, stdout, stderr) => {
                if(error) {
                     console.log(error.message);
                     return;
                }
                if(stderr) {
                     console.log('stderr: ${stderr}');
                }
                console.log(stdout);
            });
        }
        else {
            // 手机vio信息传给派
            var str = newData.toString('utf8');
            console.log('got newData: \n' + str);
            callback(bleno.Characteristic.RESULT_SUCCESS);
            writeFile(vioPath, str);
        }
    },
});

var PrimaryService = bleno.PrimaryService;
var primaryService = new PrimaryService({
    uuid: 'fffffffffffffffffffffffffffffff0',
    characteristics: [characteristic]
});

bleno.on('advertisingStart', function(error) {
    bleno.setServices([primaryService]);
});
bleno.on('stateChange', function(state) {
    console.log('BLE stateChanged to: ' + state);
    if (state === 'poweredOn') {
        bleno.startAdvertising('Raspberrypi77', [primaryService.uuid], (err) => {
            if (err) {
                console.log(err);
            }
        });
    } else {
        bleno.stopAdvertising();
    }
});
