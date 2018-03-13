'use strict';

var EventEmitter = require('events');
var util = require('util');

var async = require('./yjasync');

function Connection(CmdController, index, host, port) {

    var that = this;
    EventEmitter.call(this);

    this._linkID = index;
    this._cmd = CmdController;
    this._host = host;
    this._port = port;

    this.creatConnection(this._linkID, this._host, this._port);
/*     this._cmd.on('msg', function (index, data) {
        if (index === that._linkID) {
            that.emit('msg', data);
        }
    }) */
}

util.inherits(Connection, EventEmitter);

Connection.prototype.creatConnection = function (linkID, host, port) {
    var that = this;

    var cmd = Buffer.from('AT+CIPSTART=' + linkID + ',"TCP","' + host + '",' + port + '\r\n');

    console.log("into push!");
    that._cmd.pushCmd(cmd, that._cmd.parser['CONNECT'], function (err, data, ob) {
        console.log("in push...");
        var that = ob;
        if (err) {
            console.log("error......");
            console.log(err.message);
            return;
        } else {
            var index = data.indexOf("CONNECT");
            console.log("index: " + index);
            //console.log("==>Connection.createDone = " + that._cmd._createDone);
            if (index >= 0) {
                console.log("in judge");
                console.log("data: " + data);
                var linkIndex = data.slice(index - 2, index - 1);
                console.log("linkIndex: " + linkIndex + "," + index);
                that._connectionList[linkIndex].emit('connect');
                that._createDone = true;
                //that._cmd.run(that._cmd);
                console.log("send connection emit.");
                console.log(data);
                //that.processCmd();
            }
        }
    });
    if (that._cmd._createDone == true) {
        console.log("now process!");
        that._cmd.processCmd();
    }
}

//向服务器发送数据
Connection.prototype.write = function (str) {
    var that = this;

    var cmd = Buffer.from('AT+CIPSENDEX=' + that._linkID + "," + str.length + '\r\n');
    that._cmd.pushCmd(cmd, that._cmd.parser['SEND'], function (err, data) {
        if (err) {
            console.log("SEND ERROR:" + err.message);
            return;
        }
        that._cmd.processCmd();
        console.log("--------------------= Send !=---------------------------");
    });
    str = Buffer.from(str + "\0");
    console.log("send data: " + str);
    that._cmd.pushCmd(str, that._cmd.parser['SEND'], function (err, data) {
        if (err) {
            console.log('Error on write: ', err.message);
            return;
        }
        //that._cmd.processCmd();
        console.log("=====================" + str.toString() + "=======================");
    });
};

//关闭当前连接
Connection.prototype.close = function () {
    var that = this;

    var cmd = Buffer.from("AT+CIPCLOSE=" + that._linkID + "\r\n");
    that._cmd.pushCmd(cmd, that._cmd.parser['CLOSE'], function (err, data) {
        if (err) {
            console.log(err.message);
            return;
        }
        console.log("---CLOSE SUCCESS!---");
        //cb(null, data);
    });
}

module.exports = Connection;