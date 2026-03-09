# EmbyHub 修改日志 (CHANGELOG)

## [1.1.0] - 2026-03-09

### ✨ 新增功能

#### 邀请码系统
- 🎁 用户可创建邀请码
- 🏆 邀请奖励机制：被邀请人注册后，邀请人获得其有效期 5% 的奖励天数
- 📊 邀请统计：查看邀请人数和累计奖励天数
- 🔗 注册时可选填写邀请码

#### Docker 部署
- 🐳 Dockerfile 支持
- 📦 docker-compose.yml 一键部署
- 💾 数据持久化（SQLite volume）

#### UI 优化
- 🎨 Lucide 图标替代 emoji
- 🪟 玻璃态卡片设计（Glassmorphism）
- 🌈 动态渐变背景
- 🔔 Toast 通知系统
- ⏳ 骨架屏 Loading
- 🌙 深色模式完善

#### 管理功能增强
- ✅ 批量操作（批量续期、批量禁用）
- 🎫 邀请码管理（查看、禁用、删除）

### 🗂️ 数据库变更

#### 新增表
- `invitation_codes` - 邀请码表
- `invitations` - 邀请记录表

#### 字段变更
- `users` 表添加 `invited_by` 字段

### 🔌 API 新增

#### 邀请码相关
- `POST /api/auth/register` - 支持邀请码参数
- `GET /api/user/invitation-codes` - 获取用户的邀请码
- `POST /api/user/invitation-codes` - 创建邀请码
- `GET /api/user/invitation-stats` - 获取邀请统计
- `GET /api/admin/invitation-codes` - 管理员获取所有邀请码
- `PUT /api/admin/invitation-codes/:id` - 禁用邀请码
- `DELETE /api/admin/invitation-codes/:id` - 删除邀请码
- `POST /api/validate-invite-code` - 验证邀请码（公开）

### 📁 文件变更

```
embyhub/
├── Dockerfile           # 新增 - Docker 构建文件
├── docker-compose.yml   # 新增 - Docker Compose 配置
├── src/
│   ├── index.js         # 更新 - 添加邀请码 API
│   └── db/
│       └── sqlite.js    # 更新 - 添加邀请码数据操作
├── web/
│   ├── login.html       # 更新 - 添加邀请码输入
│   ├── admin.html       # 更新 - UI 全面升级
│   └── dashboard.html   # 更新 - UI 升级
└── CHANGELOG.md         # 更新 - 本文件
```

### 🚀 部署方式

#### Docker 部署（推荐）
```bash
# 克隆项目
git clone https://github.com/kyriem0618/embyhub.git
cd embyhub

# 配置环境变量
cp .env.example .env
# 编辑 .env 文件

# 启动
docker-compose up -d
```

#### 手动部署
```bash
npm install
npm start
```

---

## [1.0.0] - 2026-03-09

### ✨ 新增功能

#### 认证系统
- 🔐 完整的登录/注册系统
- 🎫 续期码注册机制
- 🔑 JWT Token 认证
- 👥 管理员/普通用户权限分离

#### 管理员功能
- 📊 仪表盘统计（用户数、会话数、过期用户）
- 👥 用户管理（创建、删除、启用/禁用）
- ⏰ 用户到期时间管理
- 🔐 重置用户密码
- 🎫 续期码生成和管理
- 📝 续期日志查看
- 🔍 用户搜索功能
- 📺 会话监控和停止

#### 用户功能
- 📋 查看账号信息（Emby ID、到期时间）
- 🔐 修改密码
- 🎫 使用续期码续期
- 📊 观影统计（播放次数、时长、活跃天数）
- 📽️ 观影历史记录
- 📝 续期记录查看
- 🔄 同步 Emby 播放记录

#### Telegram Bot
- 🤖 基础 Bot 集成
- /start - 欢迎菜单
- /status - 服务器状态
- /users - 用户列表（管理员）
- /createuser - 创建用户（管理员）
- /sessions - 活跃会话（管理员）

### 🗂️ 数据库变更

#### 新增表
- `users` - 用户表（添加 expires_at 字段）
- `redemption_codes` - 续期码表
- `redemption_logs` - 续期日志表
- `play_history` - 观影记录表

#### 新增索引
- `idx_users_username` - 用户名搜索
- `idx_codes_code` - 续期码查询
- `idx_codes_used` - 续期码状态
- `idx_play_history_user` - 用户观影记录

### 📁 文件结构

```
embyhub/
├── src/
│   ├── api/
│   │   └── emby.js          # Emby API 封装
│   ├── middleware/
│   │   └── auth.js          # JWT 认证中间件 [新增]
│   ├── db/
│   │   ├── index.js         # 数据库入口
│   │   ├── adapter.js       # 数据库适配器 [更新]
│   │   ├── sqlite.js        # SQLite 实现 [更新]
│   │   └── mysql.js         # MySQL 实现
│   ├── web/                 # Web 界面 [新增]
│   │   ├── login.html       # 登录页面
│   │   ├── register.html    # 注册页面
│   │   ├── dashboard.html   # 用户面板
│   │   ├── admin.html       # 管理面板
│   │   ├── users.html       # 用户管理
│   │   └── sessions.html    # 会话监控
│   └── index.js             # 主入口 [更新]
├── web/                     # 旧版 Web 文件 [已删除]
├── docs/
│   ├── API.md               # API 文档
│   └── ARCHITECTURE.md      # 架构文档
├── deploy/
│   └── README.md            # 部署指南
├── .env.example             # 环境配置示例 [更新]
├── package.json             # 依赖配置
└── README.md                # 项目说明
```

### 🔧 技术栈

- **后端**: Node.js + Express
- **数据库**: SQLite (开发) / MySQL (生产)
- **前端**: HTML + TailwindCSS + Vanilla JS
- **认证**: JWT + Bcrypt
- **Bot**: node-telegram-bot-api

### 📝 API 端点

#### 认证
- `POST /api/auth/login` - 登录
- `POST /api/auth/register` - 注册（使用续期码）
- `GET /api/auth/me` - 获取当前用户信息

#### 管理员
- `GET /api/admin/users` - 获取用户列表
- `POST /api/admin/users` - 创建用户
- `PUT /api/admin/users/:id` - 更新用户
- `DELETE /api/admin/users/:id` - 删除用户
- `POST /api/admin/users/:id/reset-password` - 重置密码
- `GET /api/admin/users/search` - 搜索用户
- `GET /api/admin/codes` - 获取续期码
- `POST /api/admin/codes` - 生成续期码
- `GET /api/admin/redemption-logs` - 获取续期日志
- `GET /api/admin/stats` - 获取统计信息
- `GET /api/sessions` - 获取活跃会话
- `POST /api/sessions/:id/stop` - 停止会话

#### 用户
- `GET /api/user/me` - 获取自己的信息
- `POST /api/user/change-password` - 修改密码
- `POST /api/user/redeem` - 使用续期码
- `GET /api/user/play-history` - 获取观影记录
- `POST /api/user/sync-playback` - 同步播放记录
- `GET /api/user/redemption-logs` - 获取续期记录

### 🐛 Bug 修复

- 修复静态文件路由优先级问题
- 修复登录验证逻辑
- 修复数据库字段命名不一致问题

### 📌 注意事项

1. **默认管理员账号**: `admin` / `admin123`（首次启动自动创建）
2. **数据库迁移**: 旧版数据库需要手动迁移
3. **环境变量**: 参考 `.env.example` 配置
4. **端口**: 默认 3000，可通过 `PORT` 环境变量修改

### 🚀 部署

```bash
# 安装依赖
npm install

# 配置环境
cp .env.example .env
# 编辑 .env 文件

# 启动服务
npm start
```

### 📚 参考项目

- [Sakura_embyboss](https://github.com/berry8838/Sakura_embyboss)
- [EmbyController](https://github.com/RandallAnjie/EmbyController)

---

## [0.1.0] - 2026-03-08

### 初始版本

- 基础 Emby API 封装
- 简单 Web 界面
- 基础用户管理
