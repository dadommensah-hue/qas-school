const { query, run, get } = require('../database');

exports.mark = (req, res) => {
  try {
    const { class: cls, date, attendance, term } = req.body;
    // attendance: [{student_id, status}]
    for (const a of attendance) {
      const existing = get("SELECT id FROM attendance WHERE student_id=? AND date=?", [a.student_id, date]);
      if (existing) {
        run("UPDATE attendance SET status=? WHERE student_id=? AND date=?", [a.status, a.student_id, date]);
      } else {
        run("INSERT INTO attendance (student_id, class, date, status, term, recorded_by) VALUES (?,?,?,?,?,?)",
          [a.student_id, cls, date, a.status, term || 'Term 1', req.user?.id]);
      }
    }
    res.json({ message: 'Attendance recorded successfully' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.getByClass = (req, res) => {
  const { class: cls } = req.params;
  const { date, term } = req.query;
  let sql = "SELECT a.*, s.full_name, s.student_id as sid FROM attendance a JOIN students s ON a.student_id=s.id WHERE a.class=?";
  const params = [cls];
  if (date) { sql += " AND a.date=?"; params.push(date); }
  if (term) { sql += " AND a.term=?"; params.push(term); }
  sql += " ORDER BY a.date DESC, s.full_name";
  const records = query(sql, params);
  res.json(records);
};

exports.summary = (req, res) => {
  const { term, academic_year } = req.query;
  let sql = `SELECT s.id, s.full_name, s.class, s.student_id as sid,
    COUNT(CASE WHEN a.status='present' THEN 1 END) as present_days,
    COUNT(CASE WHEN a.status='absent' THEN 1 END) as absent_days,
    COUNT(a.id) as total_days
    FROM students s LEFT JOIN attendance a ON s.id=a.student_id AND a.term=?
    WHERE s.status='active' GROUP BY s.id ORDER BY s.class, s.full_name`;
  const records = query(sql, [term || 'Term 1']);
  res.json(records);
};

exports.classSummary = (req, res) => {
  const { date } = req.query;
  const targetDate = date || new Date().toISOString().split('T')[0];
  const summary = query(`SELECT class, 
    COUNT(CASE WHEN status='present' THEN 1 END) as present,
    COUNT(CASE WHEN status='absent' THEN 1 END) as absent,
    COUNT(*) as total
    FROM attendance WHERE date=? GROUP BY class`, [targetDate]);
  res.json(summary);
};

exports.studentAttendance = (req, res) => {
  const { id } = req.params;
  const { term } = req.query;
  const records = query("SELECT * FROM attendance WHERE student_id=? AND term=? ORDER BY date DESC",
    [id, term || 'Term 1']);
  const total = records.length;
  const present = records.filter(r => r.status === 'present').length;
  res.json({ records, total, present, absent: total - present, percentage: total ? ((present / total) * 100).toFixed(1) : 0 });
};
