const { query, run, get } = require('../database');

exports.mark = async (req, res) => {
  try {
    const { class: cls, date, attendance, term } = req.body;
    for (const a of attendance) {
      const existing = await get("SELECT id FROM attendance WHERE student_id=? AND date=?", [a.student_id, date]);
      if (existing) {
        await run("UPDATE attendance SET status=? WHERE student_id=? AND date=?", [a.status, a.student_id, date]);
      } else {
        await run("INSERT INTO attendance (student_id, class, date, status, term, recorded_by) VALUES (?,?,?,?,?,?)",
          [a.student_id, cls, date, a.status, term || 'Term 1', req.user?.id]);
      }
    }
    res.json({ message: 'Attendance recorded successfully' });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.getByClass = async (req, res) => {
  try {
    const { class: cls } = req.params;
    const { date, term } = req.query;
    let sql = "SELECT a.*, s.full_name, s.student_id as sid FROM attendance a JOIN students s ON a.student_id=s.id WHERE a.class=?";
    const params = [cls];
    if (date) { sql += " AND a.date=?"; params.push(date); }
    if (term) { sql += " AND a.term=?"; params.push(term); }
    sql += " ORDER BY a.date DESC, s.full_name";
    res.json(await query(sql, params));
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.summary = async (req, res) => {
  try {
    const { term } = req.query;
    const sql = `SELECT s.id, s.full_name, s.class, s.student_id as sid,
      COUNT(CASE WHEN a.status='present' THEN 1 END) as present_days,
      COUNT(CASE WHEN a.status='absent' THEN 1 END) as absent_days,
      COUNT(a.id) as total_days
      FROM students s LEFT JOIN attendance a ON s.id=a.student_id AND a.term=?
      WHERE s.status='active' GROUP BY s.id ORDER BY s.class, s.full_name`;
    res.json(await query(sql, [term || 'Term 1']));
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.classSummary = async (req, res) => {
  try {
    const { date } = req.query;
    const targetDate = date || new Date().toISOString().split('T')[0];
    const summary = await query(`SELECT class,
      COUNT(CASE WHEN status='present' THEN 1 END) as present,
      COUNT(CASE WHEN status='absent' THEN 1 END) as absent,
      COUNT(*) as total
      FROM attendance WHERE date=? GROUP BY class`, [targetDate]);
    res.json(summary);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.studentAttendance = async (req, res) => {
  try {
    const { id } = req.params;
    const { term } = req.query;
    const records = await query("SELECT * FROM attendance WHERE student_id=? AND term=? ORDER BY date DESC",
      [id, term || 'Term 1']);
    const total = records.length;
    const present = records.filter(r => r.status === 'present').length;
    res.json({ records, total, present, absent: total - present,
      percentage: total ? ((present / total) * 100).toFixed(1) : 0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
};