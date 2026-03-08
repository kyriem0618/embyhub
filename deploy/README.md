# EmbyHub 部署指南

## 快速部署

### 1. 准备工作

```bash
# 克隆项目
git clone https://github.com/kyriem0618/embyhub.git
cd embyhub

# 安装依赖
npm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
nano .env  # 编辑配置
```

**必须配置:**
- `EMBY_URL` - Emby 服务器地址
- `EMBY_API_KEY` - Emby API Key
- `TELEGRAM_BOT_TOKEN` - Telegram Bot Token (从 @BotFather 获取)
- `TELEGRAM_ADMIN_IDS` - 管理员 Telegram ID

### 3. 启动服务

```bash
# 开发环境
npm run dev          # Web 服务
npm run dev:bot      # Telegram Bot

# 生产环境
npm start            # Web 服务
npm run start:bot    # Telegram Bot

# 或同时启动
npm run start:all
```

## Docker 部署 (推荐)

### docker-compose.yml

```yaml
version: '3.8'

services:
  embyhub:
    build: .
    ports:
      - "3000:3000"
    environment:
      - EMBY_URL=http://emby:8096
      - EMBY_API_KEY=your-api-key
      - TELEGRAM_BOT_TOKEN=your-bot-token
      - TELEGRAM_ADMIN_IDS=your-telegram-id
      - DB_TYPE=mysql
      - DB_HOST=mysql
      - DB_USER=embyhub
      - DB_PASSWORD=your-password
      - DB_NAME=embyhub
      - JWT_SECRET=change-this-secret
    depends_on:
      - mysql
    restart: unless-stopped

  mysql:
    image: mysql:8.0
    environment:
      - MYSQL_ROOT_PASSWORD=root-password
      - MYSQL_DATABASE=embyhub
      - MYSQL_USER=embyhub
      - MYSQL_PASSWORD=your-password
    volumes:
      - mysql_data:/var/lib/mysql
    restart: unless-stopped

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - embyhub
    restart: unless-stopped

volumes:
  mysql_data:
```

### 启动

```bash
docker-compose up -d
```

## Systemd 服务部署

### 创建服务文件

```bash
sudo nano /etc/systemd/system/embyhub.service
```

```ini
[Unit]
Description=EmbyHub Web Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/embyhub
ExecStart=/usr/bin/node src/index.js
Restart=always
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

### 启动服务

```bash
sudo systemctl daemon-reload
sudo systemctl enable embyhub
sudo systemctl start embyhub
sudo systemctl status embyhub
```

## 获取 Emby API Key

1. 登录 Emby 控制台
2. 进入 **高级** → **API Key**
3. 点击 **+** 创建新 Key
4. 命名 (如 "EmbyHub")
5. 复制 Key 到 `.env` 文件

## 获取 Telegram Bot Token

1. 在 Telegram 搜索 @BotFather
2. 发送 `/newbot`
3. 按提示设置 Bot 名称和用户名
4. 获取 Token (格式：`123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11`)
5. 获取你的 Telegram ID: 发送消息给 @userinfobot

## Nginx 反向代理配置

```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/nginx/ssl/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /bot/webhook {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Host $host;
    }
}
```

## 故障排查

### 查看日志

```bash
# Systemd
journalctl -u embyhub -f

# Docker
docker-compose logs -f embyhub

# 直接运行
npm run dev
```

### 常见问题

**Bot 无法启动:**
- 检查 `TELEGRAM_BOT_TOKEN` 是否正确
- 确认网络能访问 Telegram API

**数据库连接失败:**
- 检查 MySQL 服务是否运行
- 确认数据库凭据正确
- 检查防火墙设置

**Emby 连接失败:**
- 确认 `EMBY_URL` 可访问
- 检查 API Key 权限
- 确认 Emby 服务运行正常

## 安全建议

1. **修改默认密钥** - 更改 `JWT_SECRET`
2. **使用 HTTPS** - 生产环境强制 HTTPS
3. **限制 API Key 权限** - 为 EmbyHub 创建专用 API Key
4. **定期备份数据库** - 特别是 MySQL 数据
5. **更新依赖** - 定期运行 `npm update`
