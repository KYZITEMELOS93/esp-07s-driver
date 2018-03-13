/*
    WIFI驱动模块测试Demo
*/
var wifi = require('../src/esp8266-driver.js');

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
        client1.write("\0\0\0");
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