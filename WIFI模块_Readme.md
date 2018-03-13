# WIFI Driver for ESP8266

This driver is used to connect  AP and create TCP clients.

## Device Model

- [ESP8266](http://wiki.ai-thinker.com/esp8266)

## Install

```sh
> rap device add --model esp8266 --id <device-id>
```

## Demo

Supposed \<device-id\> is `wifi` in the following demos.

```js

/*
    WIFI驱动模块测试Demo
*/
var wifi = require('../CmdController.js');

var ssid = "nanchao-1";
var pwd = "nanchao.org";
var host_1 = "192.168.31.126";
var host_2 = "192.168.31.159";
var port = 3000; //定义串口名

var client1;
var client2;
var options = {

    port: "\\\\.\\COM3",
    timeout: 100000

};

var www = new wifi(options);

www.init();

/*
    监听到ready事件，表示模块没有问题，可以开始进行后续操作
*/
www.on('ready', function (error) {
    console.log("driver ready!");

    www.connectWifi(ssid, pwd);   //连接wifi网络
    /*
        监听到down事件，说明连接完成，获取到IP地址
        一定要先连接到网络，才能建立TCP连接，否则会失败
        从建立连接到获取IP地址，需要一段时间
    */
    

});
www.on("up", function (error) {
    console.log("Wifi connect!");

    /*
            建立TCP连接
            参数为服务器的IP地址和端口号
    */
    client1 = www.createConnection(host_1, port);
    client2 = www.createConnection(host_2, port);

    /*
        连接成功后会发送connect事件
    */
    client1.on('connect', function (error) {
        console.log('connect successly');

        //通过write函数像服务器发送数据
        client1.write("123");
        client1.write("+++");
        client1.write("456");

        //若客户端接收到服务器端发来的数据会触发msg事件
        client1.on('msg', function (data) {
            console.log("now client1 has a msg:" + data);
        });
    });

    client2.on('connect', function (error) {
        console.log('connect2 successly');
        client2.write("hello I'm client2");
        client2.on('msg', function (data) {
            console.log("now client2 has a msg:" + data);

            //通过getNetStatus获取模块现在的连接状态
            www.getNetStatus(function(err, data, res){
                console.log("STATUS : " + data);
                console.log("result >>> " + res);
            });          
            //www.closeAllconnections();

            //通过此函数关闭已建立的连接
            client2.close();
        });
    });

});
www.on('serverClose', function (data) {
    console.log("link to " + data + " is failed,server is close");
});
www.on('fail', function (data) {
    switch (data) {
        case 1:
            console.log("连接超时！");
            break;
        case 2:
            console.log("密码错误！");
            www.connectWifi(ssid, "nanchao.org");
            break;
        case 3:
            console.log("找不到目标AP！");
            break;
        case 4:
            console.log("连接失败！");
            break;
    }
});
www.on('close',function(data){
    console.log("close link " + data + " success!");
})
www.on('error', function (error) {
    if (error)
        console.log(error);
});

```

---


## API References

### WIFI Methods

- #### `init()`

测试模块是否对AT命令有响应，若无问题，则对模块执行一些初始化操作，成功则会发送ready事件，表明可以进行后续操作


- #### `connectWifi(ssid,pwd)`

通过此函数链接到指定的无线网络，参数分别为无线网络名称和密码。

若连接成功会发送 `up` 事件。


- #### `createConnection([options][, connectionListener])`

`options`有两个默认参数：

```
{
    host："nanchao-1"
    port："nanchao.org"
}
```
通过此参数来建立一个TCP连接.

connectListener参数`connect`将作为连接事件的侦听器

TCP连接建立成功后会发送出`connect`事件。

并且创建完成后会返回一个客户端对象。客户端对象会在下面继续介绍


#### `getNetStatus(callback)`

获取模块的连接状态.

`callback` 的参数是 `error` , `status` .

查询网络连接信息：AT+CIPSTATUS  响应：<stat>: 2-5

```
参数说明：<2-5>
2：ESP8266 station 已连接AP，获得IP地址
3：ESP8266 station 已建立TCP或UDP传输
4：ESP8266 station 断开网络连接
5：ESP8266 station 未连接AP`
```

#### `writeRaw(command, parser, callback)`

向模块esp-07s中写入AT命令。

`command` 表示要写入的AT命令

`parser` 是对此AT命令的返回值进行解析，然后进行相应操作

`callback` 的参数是 `error` , `data`, `ob`

`data`  是一个包含数据回应的数组.
`ob` 是一个对象，在有需要时可以传入相应的对象，对其进行操作

---


- ### Events

#### 'ready'

当模块测试没问题时会发送此事件。

#### 'up'

当用户成功连接上无线WIFI时，发送此事件。

#### 'fail'

当用户连接无线WIFI失败时，会发送此事件。

参数 `data` 是连接失败时返回的错误代码


```
1：连接超时
2：密码错误
3：找不到目标AP
4：连接失败

```


#### 'serverClose'

当服务器断开TCP连接时发送此事件。

#### 'close'

当用户主动关闭TCP连接时，会发送此事件。

#### 'error'

- `Error`

当模块有异常发生时，会产生此事件。

---


###  TCP_Connect 

### Methods

#### `write(data[, callback])`

通过WIFI模块向服务器发送数据

需要建立连接后才能发送数据。


`data` 需要是 String 或者 Buffer.

#### `close()`

关闭连接，关闭后会发送 `close` 事件

---


### Events

#### 'connect'

当 `createConnection` 方法被调用并且成功建立TCP连接后会发送此事件。


#### 'msg'

当模块收到信息时会触发此事件，对应客户端可监听此事件可接收到相应的信息。


#### 'error'

- `Error`

当连接中出现某些错误时

---



## Note

- 一定要先连接上无线WIFI，才能够建立TCP连接，否则会出错

- 连接无线WIFI时，需要一段时间，需要等待

- 连接中使用的传输模式默认为普通模式

- 要在监听到已建立TCP连接后，才能对客户端进行相应的操作

- 默认开启的多连接模式 

- 连接无线WIFI时，若SSID或者password中含有特殊符号，例如 ‘ , ’ 或者 ‘ " ’ 或者‘ \ ’ 时，需要进行转义，其他字符转义无效

