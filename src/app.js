const express = require('express');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const config = require('./config');

const app = express();

// 安全中间件
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// 静态文件
app.use(express.static(path.join(__dirname, '../web'), {
  etag: false,
  lastModified: false,
  setHeaders: (res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
  }
}));

// Rate limiting
const authLimiter = rateLimit(config.rateLimit.auth);
const apiLimiter = rateLimit(config.rateLimit.api);
app.use('/api/auth', authLimiter);
app.use('/api', apiLimiter);

// 路由
app.use('/api/auth', require('./routes/auth'));
app.use('/api/user', require('./routes/user'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api', require('./routes/shop'));

// 页面路由
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '../web/login.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, '../web/dashboard.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, '../web/admin.html')));

// Emby 测试
app.get('/api/emby/test', async (req, res) => {
  try {
    const EmbyClient = require('./api/emby');
    const emby = new EmbyClient(config.emby.url, config.emby.apiKey);
    const info = await emby.getSystemInfo();
    res.json({ success: true, serverName: info.ServerName, version: info.Version });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// 错误处理
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: '服务器内部错误' });
});

module.exports = app;
