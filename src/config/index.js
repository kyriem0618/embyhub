require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3000,
  emby: {
    url: process.env.EMBY_URL || 'http://localhost:8096',
    apiKey: process.env.EMBY_API_KEY || ''
  },
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'embyhub'
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'embyhub-secret-key-change-in-production',
    expiresIn: '7d'
  },
  bcryptRounds: 12,
  rateLimit: {
    auth: { windowMs: 15*60*1000, max: 10 },
    api: { windowMs: 60*1000, max: 100 }
  }
};
