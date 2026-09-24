const mysql = require('mysql2/promise');
require('dotenv').config();

/* Create one shared MySQL connection pool for all API routes. */
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: true
});

/* Run a lightweight connection check during startup or health checks. */
async function testConnection() {
  const connection = await pool.getConnection();
  await connection.ping();
  connection.release();
  return true;
}

module.exports = { pool, testConnection };
