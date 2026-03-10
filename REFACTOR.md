# EmbyHub 重构计划

## 目标
1. 简化代码结构
2. 修复登录问题
3. 保持所有现有功能

## 功能清单
- ✅ 用户注册/登录
- ✅ 签到系统 (金币奖励)
- ✅ 商城系统 (会员卡兑换)
- ✅ 邀请码系统
- ✅ 会员卡系统
- ✅ 工单系统
- ✅ 管理后台

## 项目结构
```
src/
├── app.js          # Express 应用
├── server.js       # 服务器入口
├── config/
│   └── index.js    # 配置文件
├── db/
│   └── mysql.js    # 数据库操作
├── routes/
│   ├── auth.js     # 认证路由
│   ├── user.js     # 用户路由
│   ├── admin.js    # 管理路由
│   └── shop.js     # 商城路由
└── middleware/
    └── auth.js     # 认证中间件
```
