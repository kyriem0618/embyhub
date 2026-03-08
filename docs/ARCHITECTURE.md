# EmbyHub 架构文档

## 技术栈选型

### 后端
- **运行时**: Node.js 18+
- **框架**: Express.js
- **数据库**: 
  - 开发环境：SQLite (零配置，快速原型)
  - 生产环境：MySQL 8.0+ (可扩展，多用户并发)
- **认证**: JWT + Bcrypt

### 前端
- **框架**: React 19
- **UI**: TailwindCSS
- **构建**: Vite

### Bot 集成
- **平台**: Telegram Bot API
- **库**: node-telegram-bot-api

## 数据库选型说明

| 环境 | 数据库 | 理由 |
|------|--------|------|
| 开发/测试 | SQLite | 零配置、单文件、无需额外服务 |
| 生产环境 | MySQL | 高并发、数据持久化、备份恢复、多实例部署 |

## 目录结构

```
embyhub/
├── src/
│   ├── api/           # Emby API 封装
│   ├── bot/           # Telegram Bot
│   ├── web/           # Web 界面
│   ├── db/            # 数据库层
│   │   ├── sqlite/    # SQLite 实现
│   │   └── mysql/     # MySQL 实现
│   └── utils/         # 工具函数
├── config/            # 配置文件
├── docs/              # 文档
├── tests/             # 测试
└── deploy/            # 部署脚本
    ├── docker/        # Docker 配置
    └── systemd/       # Systemd 服务
```

## 核心模块

### 1. EmbyClient
封装 Emby Server REST API，提供用户管理、会话控制等功能。

### 2. Database
抽象数据库层，支持 SQLite/MySQL 切换。

### 3. TelegramBot
集成 Telegram Bot，支持：
- 用户注册/登录
- 账号管理（激活、改密、删除）
- 会话查看
- 通知推送

### 4. WebServer
提供 REST API 和 Web 界面。

## 部署架构

```
                    ┌─────────────┐
                    │   Nginx     │
                    │ (反向代理)   │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
       ┌──────▼──────┐ ┌──▼────────┐ ┌─▼──────────┐
       │  EmbyHub    │ │  EmbyHub  │ │  Telegram  │
       │  Web Server │ │   Bot     │ │    Bot     │
       │  (Port 3000)│ │(Webhook)  │ │  (Polling) │
       └──────┬──────┘ └─────┬─────┘ └────────────┘
              │              │
              └──────┬───────┘
                     │
              ┌──────▼──────┐
              │   MySQL     │
              │  Database   │
              └─────────────┘
```

## 安全考虑

1. **API Key 管理**: 每个集成服务使用独立 API Key
2. **JWT 认证**: Web 接口使用 JWT Token
3. **Bot 权限**: Telegram Bot 限制管理员操作
4. **HTTPS**: 生产环境强制 HTTPS
5. **速率限制**: 防止暴力破解和 API 滥用
