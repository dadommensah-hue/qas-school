const { query, run, get } = require('../database');
const { generateReceiptNumber } = require('../helpers');

exports.list = async (req, res) => {
  try {
    const { term, status, class: cls, student_id } = req.query;
    let sql = "SELECT f.*, s.full_name, s.class, s.student_id as sid FROM fees f JOIN students s ON f.student_id=s.id WHERE 1=1";
    const params = [];
    if (term) { sql += " AND f.term=?"; params.push(term); }
    if (status) { sql += " AND f.status=?"; params.push(status); }
    if (cls) { sql += " AND s.class=?"; params.push(cls); }
    if (student_id) { sql += " AND f.student_id=?"; params.push(student_id); }
    sql += " ORDER BY f.created_at DESC";
    res.json(await query(sql, params));
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.create = async (req, res) => {
  try {
    const { student_id, fee_type, amount, term, due_date, academic_year } = req.body;
    const result = await run("INSERT INTO fees (student_id, fee_type, amount, term, due_date, academic_year) VALUES (?,?,?,?,?,?)",
      [student_id, fee_type, amount, term, due_date, academic_year || '2024/2025']);
    res.status(201).json({ id: result.lastID, message: 'Fee record created' });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.recordPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount_paid, payment_method, paid_date } = req.body;
    const fee = await get("SELECT * FROM fees WHERE id=?", [id]);
    if (!fee) return res.status(404).json({ error: 'Fee record not found' });
    const newPaid = parseFloat(fee.amount_paid || 0) + parseFloat(amount_paid);
    const status = newPaid >= parseFloat(fee.amount) ? 'paid' : 'partial';
    const receipt = generateReceiptNumber();
    await run("UPDATE fees SET amount_paid=?, status=?, payment_method=?, paid_date=?, receipt_number=? WHERE id=?",
      [newPaid, status, payment_method, paid_date || new Date().toISOString().split('T')[0], receipt, id]);
    res.json({ message: 'Payment recorded', receipt_number: receipt, status });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.summary = async (req, res) => {
  try {
    const { term, academic_year } = req.query;
    const term_ = term || 'Term 1';
    const year_ = academic_year || '2024/2025';
    const totals = await get("SELECT SUM(amount) as expected, SUM(amount_paid) as collected, SUM(amount - amount_paid) as outstanding FROM fees WHERE term=? AND academic_year=?", [term_, year_]);
    const byClass = await query(`SELECT s.class, SUM(f.amount) as expected, SUM(f.amount_paid) as collected
      FROM fees f JOIN students s ON f.student_id=s.id WHERE f.term=? AND f.academic_year=?
      GROUP BY s.class ORDER BY s.class`, [term_, year_]);
    const defaulters = await query(`SELECT s.full_name, s.class, s.student_id as sid, s.guardian_phone,
      f.amount, f.amount_paid, f.amount-f.amount_paid as balance, f.status
      FROM fees f JOIN students s ON f.student_id=s.id
      WHERE f.term=? AND f.status!='paid' AND f.academic_year=?
      ORDER BY balance DESC`, [term_, year_]);
    res.json({ totals, byClass, defaulters });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.bulkCreate = async (req, res) => {
  try {
    const { class: cls, fee_type, amount, term, due_date, academic_year } = req.body;
    const students = await query("SELECT id FROM students WHERE class=? AND status='active'", [cls]);
    for (const s of students) {
      const existing = await get("SELECT id FROM fees WHERE student_id=? AND fee_type=? AND term=?", [s.id, fee_type, term]);
      if (!existing) {
        await run("INSERT INTO fees (student_id, fee_type, amount, term, due_date, academic_year) VALUES (?,?,?,?,?,?)",
          [s.id, fee_type, amount, term, due_date, academic_year || '2024/2025']);
      }
    }
    res.json({ message: `Fee records created for ${students.length} students in ${cls}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
};