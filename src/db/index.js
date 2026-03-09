/**
 * 数据库抽象层 - MySQL Only
 */

const MySQLAdapter = require('./mysql');

let dbInstance = null;

/**
 * 初始化数据库
 */
async function initDatabase() {
  if (!dbInstance) {
    dbInstance = new MySQLAdapter();
    await dbInstance.connect();
    await dbInstance.initialize();
  }
  return dbInstance;
}

module.exports = {
  initDatabase,
  MySQLAdapter
};
