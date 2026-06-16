# Cloudflare-Email-Worker
在Cloudflare的worker上搭建可收发邮件的网站  
   
## 部署流程：   
1.创建worker，上传index.js、index.html到worker   
可点击一键部署  [![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/YXC-Lhy/Cloudflare-Email-Worker)  
修改index.js里的username password token domain，绑定你用于邮箱的域名  
2.绑定一个D1数据库，命名为DB，在数据库控制台执行D1.txt里的初始化代码  
3.绑定电子邮件服务命名为EMAIL  
4.在email-service/routing里开通域名邮箱服务，设定路由规则为全收，发送到worker  
