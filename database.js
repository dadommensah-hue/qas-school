const { createClient } = require('@libsql/client');

const client = createClient({
  url: process.env.TURSO_URL,
  authToken: process.env.TURSO_TOKEN,
});

async function getDB() {
  return client;
}

// Converts Turso row format to plain objects
function toPlainObjects(result) {
  if (!result || !result.rows) return [];
  return result.rows.map(row => {
    const obj = {};
    result.columns.forEach((col, i) => {
      obj[col] = row[i];
    });
    return obj;
  });
}

async function query(sql, params = []) {
  const result = await client.execute({ sql, args: params });
  return toPlainObjects(result);
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