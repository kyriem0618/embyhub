const app = require('./app');
const config = require('./config');
const db = require('./db');
const EmbyClient = require('./api/emby');

const PORT = config.port;

async function initializeApp() {
  try {
    const database = await db.initDatabase();
    const emby = new EmbyClient(config.emby.url, config.emby.apiKey);
    
    console.log('[App] Database initialized');
    
    // 创建默认管理员
    const adminExists = await database.getUserByUsername('admin');
    if (!adminExists) {
      const bcrypt = require('bcryptjs');
      const passwordHash = await bcrypt.hash('admin123', config.bcryptRounds);
      await database.createUser({
        username: 'admin',
        passwordHash,
        isAdmin: true,
        isActive: true
      });
      console.log('[App] Default admin created: admin / admin123');
    }
    
    return { database, emby };
  } catch (error) {
    console.error('[App] Database init failed:', error.message);
    process.exit(1);
  }
}

initializeApp().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔═══════════════════════════════════════════╗
║   🎬 EmbyHub v2.0.0 (Refactored)          ║
║   📍 Port: ${PORT}                             ║
║   🔐 Auth: Enabled                        ║
║   🗄️  DB: MySQL                           ║
╚═══════════════════════════════════════════╝
    `);
  });
});
