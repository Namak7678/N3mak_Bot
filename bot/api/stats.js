const { pool } = require('../src/db');
const { ensureDbReady } = require('./_init');

module.exports = async (_req, res) => {
  try {
    await ensureDbReady();
    const usersResult = await pool.query('SELECT COUNT(*)::int AS count FROM users');
    res.status(200).json({ users: usersResult.rows[0].count, markets: 6 });
  } catch (err) {
    res.status(200).json({ users: 0, markets: 6 });
  }
};
