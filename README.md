# EmbyHub - Emby 用户管理系统

> 通过 Web 界面管理 Emby 用户、控制 Emby 服务器的现代化解决方案

## ✨ 特性

- **用户管理** - 创建、编辑、删除 Emby 用户，批量操作
- **权限控制** - 细粒度的库访问权限、播放限制
- **会话监控** - 实时查看活跃会话，远程下架
- **统计分析** - 用户活动、播放历史、存储使用
- **API 优先** - RESTful API，易于集成和扩展
- **现代化 UI** - 响应式设计，支持深色模式

## 🏗️ 技术栈

- **后端**: Node.js + Express
- **前端**: React + TailwindCSS
- **数据库**: SQLite (开发) / PostgreSQL (生产)
- **认证**: JWT + Emby API Key

## 🚀 快速开始

### 环境要求

- Node.js 18+
- Emby Server 4.7+

### 安装

```bash
# 克隆项目
git clone https://github.com/kyriem0618/embyhub.git
cd embyhub

# 安装依赖
npm install

# 配置环境变量
cp .env.example .env
# 编辑 .env 文件，填入 Emby 服务器地址和 API Key

# 启动开发服务器
npm run dev
```

## 📁 项目结构

```
embyhub/
├── src/
│   ├── api/          # Emby API 封装
│   ├── web/          # Web 界面
│   ├── db/           # 数据库模型
│   └── utils/        # 工具函数
├── config/           # 配置文件
├── docs/             # 文档
└── tests/            # 测试
```

## 🔌 Emby API 集成

核心 API 端点：

| 端点 | 说明 |
|------|------|
| `GET /Users` | 获取用户列表 |
| `POST /Users` | 创建新用户 |
| `PUT /Users/{id}` | 更新用户 |
| `DELETE /Users/{id}` | 删除用户 |
| `GET /Sessions` | 获取活跃会话 |
| `POST /Sessions/{id}/Playing` | 控制播放 |

## 📝 许可证

Apache 2.0

## 🙏 致谢

参考项目：
- [Sakura_embyboss](https://github.com/berry8838/Sakura_embyboss)
- [EmbyController](https://github.com/RandallAnjie/EmbyController)
