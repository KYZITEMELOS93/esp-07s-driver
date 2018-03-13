'use strict'

//var serial = require('ruff-async').series;
//var cmdCommunication = require('event');

var async = require('./yjasync.js');
var EventEmitter = require('events');
var util = require('util');
var Connection = require('./connection');
var SerialPort = require("serialport"); //引入模块

var MAX_CONNECTION_NUM = 4;
MAX_CONNECTION_NUM = Math.min(5, MAX_CONNECTION_NUM);

//var async = require('async');

//program process status
var Status = {
    IDLE: 0,
    WAITING_RESPONSE: 1
};


//create a class to diapa cmd
function CmdController(options) {
    var that = this;

    //设置键盘监听事件
    EventEmitter.call(this);

    this._allConnections = [];
    this._connectionList = [];

    this._commandlist = [];
    this._parserlist = [];
    this._cblist = [];

    this._getFulldata = true;

    //设置连接号的数组定义为undefined
    for (var i = 0; i < MAX_CONNECTION_NUM; i++) {
        this._allConnections.push(false);
    }

    //超时选项
    this._TIMEOUT = options.timeout || 10000;

    //新建串口
    this._port = new SerialPort(options.port, {
        baudRate: 38400,
        dataBits: 8,
        parity: 'none',
        stopBits: 1,
        flowControl: false
    });

    //数据缓冲区
    this._dataBuffer = ''; //new Buffer(0);
    //运行状态
    this._status = Status.IDLE;

    this.timer = null;

    this._waitingParser = function () {};

    this._port.on('data', function (data) {
        //console.log('>>>' + data.toString("hex") + '<<<');

        that._dataBuffer += data;
        //that._dataBuffer = Buffer.concat([that._dataBuffer,data]);
        //console.log("--> dataBuffer:" + that._dataBuffer.toString("hex") + "<--");
        //console.log('status:' + that._status);

        //var getFulldata = true;

        while (true) {
            if (that._status == Status.IDLE) {
                that._getFulldata = that._idleParser(data);

            } else if (that._status == Status.WAITING_RESPONSE) {
                that._getFulldata = that._waitingParser(data);
            }
            if (that._dataBuffer == '' || that._getFulldata == false) {
                break;
            }
        }
    });
}

util.inherits(CmdController, EventEmitter);

CmdController.prototype._createDone = true;

//获取未使用的连接号
CmdController.prototype.getUnusedConnections = function () {
    for (var i = 0; i < MAX_CONNECTION_NUM; i++) {
        if (this._allConnections[i] !== true) {
            return i;
        }
    }
    return -1;
};

//返回空闲状态
CmdController.prototype.returnToIdle = function () {
    var that = this;
    //this._dataBuffer = '';

    this._status = Status.IDLE;
    clearTimeout(this._timer); //每次返回空闲状态，则说明命令执行完成，此时需清除定时器，防止超时

    //若是返回值中有OK，将OK后面的值放入缓冲区留待下次操作，以防数据还未接受完就清空缓冲区，造成信息丢失
    var index = that._dataBuffer.indexOf("OK");
    if (index >= 0) {
        that._dataBuffer = that._dataBuffer.slice(index + 4, that._dataBuffer.length);
    }
    //console.log("<<+>>" + that._dataBuffer + "<<+>>");
    if (that._dataBuffer !== '') {
        return false;
    }

    
};

//空闲状态接收到数据时的处理函数
CmdController.prototype._idleParser = function (data) {

    var that = this;
    var begin = that._dataBuffer.indexOf("+IPD,");
    var end = that._dataBuffer.indexOf(":");
    var close = that._dataBuffer.indexOf("CLOSE");

    if (close >= 0) { //若返回close，则说明要建立连接的服务器端时关闭的，或者连接成功之后，服务器端突然关闭
        var linkIndex = Number(that._dataBuffer.slice(close - 2, close - 1));
        console.log("idle parser link:" + linkIndex + " has closed!");
        that._connectionList[linkIndex] = null;     //客户端对象置空
        that._allConnections[linkIndex] = false;    //分配空的连接号的数组
        that.emit('serverClose', linkIndex);
        that._dataBuffer = '';
    }
    if (begin >= 0) { //若接受到数据头，则说明有数据传入，等待数据接收完成
        if (end >= 0) {
            var recv = that._dataBuffer.slice(end + 1, that._dataBuffer.length); //此时获取接收到的数据
            var linkID = Number(that._dataBuffer.slice(begin + 5, begin + 6)); //获得接收到数据时通过哪个连接发送过来的
            var len = Number(that._dataBuffer.slice(begin + 7, end)); //接收到数据的长度
            if (recv.length >= len) { //获取到完整数据后将数据发送到对应的客户端
                //var recv = that._dataBuffer.slice(index + 1, that._dataBuffer.length);
                console.log("\n\nREC:" + recv + "\n\n");
                //that.emit('msg', linkID, recv);
                var client = that._connectionList[linkID];
                client.emit('msg',recv);
                // that._createDone = false;
                that.processCmd();
                that._dataBuffer = that._dataBuffer.slice(end + len, that._dataBuffer.length);
                if (that._dataBuffer !== '') {
                    return false;
                }
            } else { //否则则说明还未接收到完整数据，返回false继续接收
                return false;
            }
        } else { //若未接收到报头，也返回false继续接收数据
            return false;
        }
    } else { //若无数据报头+IPD，则说明无数据传来，继续执行之后的命令
        return false;
        // console.log("process!");
        // that._createDone = false;
        //that.processCmd();
    }


};

/* 
    解析命令的函数，是一个函数数组
    数组的成员函数可以对不同期待值进行不同的解析处理
    AT: 期待返回值 'OK',可处理大部分AT指令的返回值
    CONNECT: 建立TCP连接，对其返回值进行处理解析
    SEND: 发送数据时，对其返回值进行处理解析
    STATUS: 获取模块连接状态时，通过此函数对返回值进行处理解析
    CLOSE: 关闭TCP连接时，对返回值进行处理解析
*/
CmdController.prototype.parser = {
    AT: function (cb, that) {
        return function (data) {
            var ok = that._dataBuffer.match("OK");
            var close = that._dataBuffer.indexOf("CLOSE");
            var error = that._dataBuffer.match("ERROR");
            var busy = that._dataBuffer.match("busy p..");
            var fail = that._dataBuffer.indexOf("FAIL")

            if (ok) { //若返回OK则说明AT指令执行成功
                cb(null, "" + ok);
                that.returnToIdle();

            } else if (fail >= 0) { //若返回FAIL，则说明连接无线WIFI时出现问题，会返回相应的错误代码，对其进行处理
                var errindex = that._dataBuffer.indexOf("+CWJAP:");
                var errcode = Number(that._dataBuffer.slice(errindex + 7, errindex + 8));
                console.log("connect wifi has some error : " + errcode);
                that.emit("fail",errcode);
                cb(null, "FAIL");
                that.returnToIdle();
            } /* else if (close >= 0) { //若返回
                var linkIndex = Number(that._dataBuffer.slice(close - 2, close - 1));
                console.log("link:" + linkIndex + " has closed!");
                that.emit('serverClose', linkIndex);
                cb(null, "" + close);
                that.returnToIdle();
            } */ else if (error) {
                cb(null, "" + error);
                console.log("there has a error");
                that.returnToIdle();
            } else if (busy) {
                cb(null, "" + busy);
                console.log("busy now...");
                that.returnToIdle();
            } else {
                return false;
            }
        };
    },
    CONNECT: function (cb, that) {
        return function (data) {

            var result = that._dataBuffer.match("OK");
            var close = that._dataBuffer.indexOf("CLOSE");

            console.log("now data = " + data);

            if (result) {
                cb(null, "" + that._dataBuffer, that);
                that.returnToIdle();
            } else if (close >= 0) { //若返回
                var linkIndex = Number(that._dataBuffer.slice(close - 2, close - 1));
                console.log("link:" + linkIndex + " has closed!");
                that.emit('serverClose', linkIndex);
                cb(null, "" + close);
                that.returnToIdle();
                that.processCmd();  //继续执行程序
            } else {
                console.log("return false!");
                return false;
                //console.log("connect fail!");
            }
        };
    },
    SEND: function (cb, that) {
        return function (data) {
            var sendReady = that._dataBuffer.match("OK");
            var sendOK = that._dataBuffer.match('SEND OK');
            if (sendReady) {
                cb(null, "" + sendReady);
                that.returnToIdle();
                //that.processCmd();               
            } else if (sendOK) {
                cb(null, "" + OK);
                that.returnToIdle();
            } else {
                return false;
            }
        };
    },
    STATUS:function(cb, that){
        return function(){
            var ok = that._dataBuffer.match("OK");
            var index = that._dataBuffer.indexOf("STATUS");
            var error = that._dataBuffer.match("ERROR");
            if(ok){
                var status = Number(that._dataBuffer.slice(index + 7,index + 8));
                var res = that._dataBuffer;
                console.log("STATUS : " + status);
                cb(null,status,res);
                //that.emit('close',status);
                that.returnToIdle();
                that.processCmd();
            }else{
                return false;
            }
        }
    },
    CLOSE: function(cb, that){
        return function(data){
            var ok = that._dataBuffer.match("OK");
            var close = that._dataBuffer.indexOf("CLOSE");
            var error = that._dataBuffer.match("ERROR");
            if(ok){
                var linkID = Number(that._dataBuffer.slice(close - 2,close -1));
                console.log("close link : " + linkID);
                that._connectionList[linkID] = null;     //客户端对象置空
                that._allConnections[linkID] = false;    //分配空的连接号的数组
                
                //that.emit('close',linkID);
                that.returnToIdle();
                that.processCmd();
            }else if(error){
                that.emit('error',"CLOSE has some error : \"UNLINK to close\"");
                that.returnToIdle();
                that.processCmd();
            }else {
                return false;
            }
        }
    }
};

CmdController.prototype.getNetStatus = function(cb){
    var that = this;
    var cmd = Buffer.from('AT+CIPSTATUS\r\n');

    that.pushCmd(cmd, that.parser['STATUS'],function(err, data, res){
        if(err){
            console.log(err);
            return ;
        }
        console.log("push STATUS > " + data);
        console.log("result : " + res);
        cb(null, data , res);
    })
}

CmdController.prototype.pushCmd = function (cmd, parser, cb) {
    var that = this;
    if (cmd) {
        that._commandlist.push(cmd);
        that._parserlist.push(parser);
        that._cblist.push(cb);
        console.log("push: " + cmd);
    }
    return;
}
CmdController.prototype.processCmd = function () {
    var that = this;
    /*     if (that._status == Status.WAITING_RESPONSE) {
            console.log("now return!");
            return;
        } */
    that._createDone = false;
    var cmd = that._commandlist.shift();
    var parser = that._parserlist.shift();
    var cb = that._cblist.shift();

    if (cmd) {
        console.log("cmd: " + cmd);
        that.writeRaw(cmd, parser, cb);
    } else {
        console.log("No commands!");
        return;
    }
}
// Must a response
CmdController.prototype.writeRaw = function (cmd, parser, cb) {
    var that = this;
    that._dataBuffer = '';

    function wait() {
        //console.log("in wait()");
        console.log(typeof parser);

        if (parser !== undefined) {
            that._waitingParser = parser(cb, that);
        } else {
            console.log("parser undefined");
        }
        that._status = Status.WAITING_RESPONSE;


        //设置超时处理函数
        that._timer = setTimeout(function () {
            console.log('Timeout triggered');
            that._status = Status.IDLE;
            that._dataBuffer = '';
            cb("Write timeout");
        }, that._TIMEOUT);
        console.log('start to wait...');
    }

    //通过串口向模块写入命令
    this._port.write(cmd, function (error) {
        if (error) {
            cb && cb(error);
            return;
        }
        //onsole.log("Goto wait()");
        wait();
    });
};

//初始化函数，包括测试，设置模式
CmdController.prototype.init = function () {
    var that = this;

    //that.closeAllconnection();
    //串行执行
    var init_arr = [

        //关闭回显
        function (cb) {
            console.log('ATE0');
            that.writeRaw('ATE0\r\n', that.parser['AT'], function (err, result) {
                if (err) {
                    cb(err);
                    return;
                }
                console.log(result);
                cb(null, result);
            });
        },

        //关闭多连接模式
        function (cb) {
            var cmd = Buffer.from("AT+CIPMUX=0\r\n");
            console.log('AT+CIPMUX=0');
            that.writeRaw(cmd, that.parser['AT'], function (err, result) {
                if (err) {
                    cb(err);
                    return;
                }
                console.log(result);
                cb(null, result);
            });
        },
        //测试模块是否有回应
        function (cb) {
            console.log('AT');
            that.writeRaw('AT\r\n', that.parser['AT'], function (err, result) {
                if (err) {
                    cb(err);
                    return;
                }
                console.log(result);
                cb(null, result);
            });
        },

        //设置模块模式为station，此模式下可连接无线网络
        function (cb) {
            console.log('AT+CWMODE');
            that.writeRaw('AT+CWMODE=1\r\n', that.parser['AT'], function (err, result) {
                if (err) {
                    cb(err);
                    return;
                }
                console.log(result);
                cb(null, result);
            });


        },

        //设置发送模式为普通模式
        function (cb) {
            console.log('AT+CIPMODE');
            that.writeRaw('AT+CIPMODE=0\r\n', that.parser['AT'], function (err, result) {
                if (err) {
                    cb(err);
                    return;
                }
                console.log(result);
                cb(null, result);
                //that.emit('ready');
            });
        }
    ];
    //init_arr = close_arr.concat(init_arr);
    async.series(init_arr, function (err, data) {
        if (err)
            console.log(err.message);
        else{
            console.log(data);
            if(data.toString().match("ERROR")){
                that.emit('error',"init error!");
            }else{
                that.emit('ready');
            }
        }
            
    });

};

CmdController.prototype.connectWifi = function (ssid, pwd) {
    var that = this;

    var connect_arr = [

        //设置为多连接模式
        function (cb) {
            console.log('AT+CIPMUX=1');
            that.writeRaw('AT+CIPMUX=1\r\n', that.parser['AT'], function (err, result) {
                if (err) {
                    cb(err);
                    return;
                }
                console.log("SetMux" + result);
                cb(null, result);
                //that.emit('up');
                //console.log(data);


            });
        },

        //连接无线网络
        function (cb) {
            var cmd = Buffer.from('AT+CWJAP_CUR="' + ssid + '","' + pwd + '"\r\n');
            console.log(cmd.toString());

            that.writeRaw(cmd, that.parser['AT'], function (err, data) {
                if (err) {
                    console.log(err.message);
                    return;
                }
                console.log("ConnectWifi" + data);
                cb(null, data);
                if (data !== 'FAIL') {
                    that.emit('up');
                }
            });
        }
    ];

    async.series(connect_arr, function (err, data) {
        if (err)
            console.log(err.message);
        else
            console.log(data);
    });
};

CmdController.prototype.createConnection = function (host, port) {
    var that = this;

    console.log("Cmd.createDone = " + that._createDone);

    var linkID = that.getUnusedConnections();
    that._allConnections[linkID] = true;

    if (linkID !== -1) {
        var conn = new Connection(that, linkID, host, port);
        that._connectionList[linkID] = conn;
        return conn;
    } else {
        console.log("No linkID！");
    }



};
CmdController.prototype.closeAllconnections = function () {
    var that = this;
    var close_arr = [];
    var connectedID = [];
    var count = 0;
    //for(var i = 0;i < )

    for (var j = 0; j < 5; j++) {
        //console.log("push");
        if (that._allConnections[j] == true) {
            var close = (function (i) {
                //console.log("j is:" + i);

                return function (cb) {
                    var cmd = Buffer.from("AT+CIPCLOSE=" + i + "\r\n");
                    console.log('CLOSE: ' + i);
                    that.writeRaw(cmd, that.parser['AT'], function (err, result) {
                        if (err) {
                            cb(null, err);
                            return;
                        }
                        console.log(result);
                        cb(null, result);
                    });
                    //close_arr.push(close);
                }

            })(j);
            close_arr.push(close);
            console.log(">push<");
        }
    }

    console.log(close_arr.length);
    //return close_arr;
    async.series(close_arr, function (err, data) {
        if (err)
            console.log(err.message);
        else{
            console.log(data);
        }           
    });
}

module.exports = CmdController;