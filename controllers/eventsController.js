const { query, run, get } = require('../database');

exports.list = async (req, res) => {
  try {
    const { month, year, class: cls } = req.query;
    let sql = "SELECT * FROM events WHERE 1=1";
    const params = [];
    if (month && year) {
      sql += " AND strftime('%Y-%m', event_date) = ?";
      params.push(`${year}-${String(month).padStart(2, '0')}`);
    }
    if (cls && cls !== 'all') { sql += " AND (class=? OR class='all')"; params.push(cls); }
    sql += " ORDER BY event_date";
    res.json(await query(sql, params));
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.create = async (req, res) => {
  try {
    const { title, description, event_date, end_date, event_type, class: cls } = req.body;
    const result = await run("INSERT INTO events (title, description, event_date, end_date, event_type, class, created_by) VALUES (?,?,?,?,?,?,?)",
      [title, description, event_date, end_date, event_type || 'general', cls || 'all', req.user?.id]);
    res.status(201).json({ id: result.lastID, message: 'Event created' });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.update = async (req, res) => {
  try {
    const { title, description, event_date, end_date, event_type, class: cls } = req.body;
    await run("UPDATE events SET title=?, description=?, event_date=?, end_date=?, event_type=?, class=? WHERE id=?",
      [title, description, event_date, end_date, event_type, cls, req.params.id]);
    res.json({ message: 'Event updated' });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.delete = async (req, res) => {
  try {
    await run("DELETE FROM events WHERE id=?", [req.params.id]);
    res.json({ message: 'Event deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.upcoming = async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const events = await query("SELECT * FROM events WHERE event_date >= ? ORDER BY event_date LIMIT 10", [today]);
    res.json(events);
  } catch (e) { res.status(500).json({ error: e.message }); }
};