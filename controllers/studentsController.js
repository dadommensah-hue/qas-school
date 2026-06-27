const bcrypt = require('bcryptjs');
const { query, run, get } = require('../database');

let counter = { val: null };
async function nextId() {
  if (!counter.val) {
    const r = await get("SELECT student_id FROM students ORDER BY id DESC LIMIT 1");
    if (r) {
      const n = parseInt(r.student_id.split('-')[2] || '0');
      counter.val = n;
    } else counter.val = 0;
  }
  counter.val++;
  const year = new Date().getFullYear();
  return `QAS-${year}-${String(counter.val).padStart(3,'0')}`;
}

exports.list = async (req, res) => {
  try {
    const { status, class: cls, search, type } = req.query;
    let sql = "SELECT * FROM students WHERE 1=1";
    const params = [];
    if (status) { sql += " AND status=?"; params.push(status); }
    if (cls) { sql += " AND class=?"; params.push(cls); }
    if (type) { sql += " AND student_type=?"; params.push(type); }
    if (search) { sql += " AND (full_name LIKE ? OR student_id LIKE ?)"; params.push(`%${search}%`,`%${search}%`); }
    sql += " ORDER BY class, full_name";
    res.json(await query(sql, params));
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.create = async (req, res) => {
  try {
    const { full_name, class: cls, date_of_birth, gender, student_type, guardian_name,
      guardian_phone, guardian_email, address, profile_photo } = req.body;
    if (!full_name || !cls) return res.status(400).json({ error: 'Name and class required' });
    const student_id = nextId();
    const username = student_id.toLowerCase().replace(/-/g,'');
    const password = await bcrypt.hash('student123', 10);
    await run(`INSERT INTO students (student_id,full_name,date_of_birth,gender,class,student_type,
      guardian_name,guardian_phone,guardian_email,address,profile_photo,username,password)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [student_id, full_name, date_of_birth||null, gender||'Male', cls, student_type||'day',
       guardian_name||'', guardian_phone||'', guardian_email||'', address||'', profile_photo||null, username, password]);
    res.json({ message: 'Student enrolled', student_id, username, default_password: 'student123' });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.get = async (req, res) => {
  try {
    const s = await get("SELECT * FROM students WHERE id=?", [req.params.id]);
    if (!s) return res.status(404).json({ error: 'Not found' });
    res.json(s);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.update = async (req, res) => {
  try {
    const { full_name, class: cls, date_of_birth, gender, student_type,
      guardian_name, guardian_phone, guardian_email, address, status, profile_photo } = req.body;
    const photo = (profile_photo && profile_photo.length > 10) ? profile_photo : null;
    if (photo) {
      await run(`UPDATE students SET full_name=?,class=?,date_of_birth=?,gender=?,student_type=?,
        guardian_name=?,guardian_phone=?,guardian_email=?,address=?,status=?,profile_photo=? WHERE id=?`,
        [full_name, cls, date_of_birth, gender, student_type||'day',
         guardian_name, guardian_phone, guardian_email, address, status||'active', photo, req.params.id]);
    } else {
      await run(`UPDATE students SET full_name=?,class=?,date_of_birth=?,gender=?,student_type=?,
        guardian_name=?,guardian_phone=?,guardian_email=?,address=?,status=? WHERE id=?`,
        [full_name, cls, date_of_birth, gender, student_type||'day',
         guardian_name, guardian_phone, guardian_email, address, status||'active', req.params.id]);
    }
    res.json({ message: 'Updated' });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.delete = async (req, res) => {
  try {
    await run("DELETE FROM attendance WHERE student_id=?", [req.params.id]);
    await run("DELETE FROM grades WHERE student_id=?", [req.params.id]);
    await run("DELETE FROM mock_exam WHERE student_id=?", [req.params.id]);
    await run("DELETE FROM fees WHERE student_id=?", [req.params.id]);
    await run("DELETE FROM students WHERE id=?", [req.params.id]);
    res.json({ message: 'Student deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.byClass = async (req, res) => {
  try {
    res.json(await query("SELECT * FROM students WHERE class=? AND status='active' ORDER BY full_name", [req.params.class]));
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.stats = async (req, res) => {
  try {
    const total = await get("SELECT COUNT(*) as count FROM students WHERE status='active'").count;
    const boarding = await get("SELECT COUNT(*) as count FROM students WHERE status='active' AND student_type='boarding'").count;
    const day = await get("SELECT COUNT(*) as count FROM students WHERE status='active' AND student_type='day'").count;
    const byClass = await query("SELECT class,COUNT(*) as count FROM students WHERE status='active' GROUP BY class ORDER BY class");
    res.json({ total, boarding, day, byClass });
  } catch (e) { res.status(500).json({ error: e.message }); }
};
