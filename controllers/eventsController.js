const { query, run, get } = require('../database');

exports.list = (req, res) => {
  const { month, year, class: cls } = req.query;
  let sql = "SELECT * FROM events WHERE 1=1";
  const params = [];
  if (month && year) {
    sql += " AND strftime('%Y-%m', event_date) = ?";
    params.push(`${year}-${String(month).padStart(2, '0')}`);
  }
  if (cls && cls !== 'all') { sql += " AND (class=? OR class='all')"; params.push(cls); }
  sql += " ORDER BY event_date";
  const events = query(sql, params);
  res.json(events);
};

exports.create = (req, res) => {
  try {
    const { title, description, event_date, end_date, event_type, class: cls } = req.body;
    const result = run("INSERT INTO events (title, description, event_date, end_date, event_type, class, created_by) VALUES (?,?,?,?,?,?,?)",
      [title, description, event_date, end_date, event_type || 'general', cls || 'all', req.user?.id]);
    res.status(201).json({ id: result.lastID, message: 'Event created' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.update = (req, res) => {
  const { title, description, event_date, end_date, event_type, class: cls } = req.body;
  run("UPDATE events SET title=?, description=?, event_date=?, end_date=?, event_type=?, class=? WHERE id=?",
    [title, description, event_date, end_date, event_type, cls, req.params.id]);
  res.json({ message: 'Event updated' });
};

exports.delete = (req, res) => {
  run("DELETE FROM events WHERE id=?", [req.params.id]);
  res.json({ message: 'Event deleted' });
};

exports.upcoming = (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const events = query("SELECT * FROM events WHERE event_date >= ? ORDER BY event_date LIMIT 10", [today]);
  res.json(events);
};
