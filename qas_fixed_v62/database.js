require('dotenv').config();
const { createClient } = require('@libsql/client');

let client = null;

function getClient() {
  if (client) return client;

  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url) throw new Error('TURSO_DATABASE_URL is not set in environment variables');

  client = createClient({ url, authToken });
  return client;
}

// Sync-style query — returns rows array (awaited internally by async controllers)
async function query(sql, params = []) {
  const db = getClient();
  const result = await db.execute({ sql, args: params });
  return result.rows;
}

// Sync-style run — returns { lastID }
async function run(sql, params = []) {
  const db = getClient();
  const result = await db.execute({ sql, args: params });
  return { lastID: Number(result.lastInsertRowid) };
}

// Sync-style get — returns first row or null
async function get(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

// Kept for compatibility with setup.js
async function getDB() {
  getClient(); // ensures client is initialised
}

module.exports = { getDB, query, run, get };
