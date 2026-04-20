const { createClient } = require('@libsql/client');

const client = createClient({
  url: process.env.TURSO_URL,
  authToken: process.env.TURSO_TOKEN,
});

async function getDB() {
  return client;
}

async function query(sql, params = []) {
  const result = await client.execute({ sql, args: params });
  return result.rows;
}

async function run(sql, params = []) {
  const result = await client.execute({ sql, args: params });
  return { lastID: result.lastInsertRowid };
}

async function get(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

function saveDB() {
  // Not needed with Turso - data is saved automatically
}

module.exports = { getDB, saveDB, query, run, get };