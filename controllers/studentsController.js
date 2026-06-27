const bcrypt = require('bcryptjs');
const { query, run, get } = require('../database');

async function nextId() {
  const r = await get("SELECT student_id FROM students ORDER BY id DESC LIMIT 1");
  let num = 0;
  if (r && r.student_id) {
    const parts = String(r.student_id).split('-');
    num = parseInt(parts[parts.length - 1]) || 0;
  }
  num++;
  const year = new Date().getFullYear();
  return `QAS-${year}-${String(num).padStart(3,'0')}`;
}

function safeStr(v) { return (v === undefined || v === null) ? '' : String(v); }
function safePhoto(v) {
  // Turso cannot store huge base64 blobs - store only if reasonable size
  if (!v || typeof v !== 'string' || v.length < 10) return null;
  if (v.length > 500000) return null; // skip if over 500KB
  return v;
}

exports.list = async (req, res) => {
  try {
    const { status, class: cls, search, type } = req.query;
    let sql = "SELECT id,student_id,full_name,class,gender,student_type,status,guardian_name,guardian_phone,username,profile_photo FROM students WHERE 1=1";
    const params = [];
    if (status) { sql += " AND status=?"; params.push(status); }
    if (cls) { sql += " AND class=?"; params.push(cls); }
    if (type) { sql += " AND student_type=?"; params.push(type); }
    if (search) { sql += " AND full_name LIKE ?"; params.push(`%${search}%`); }
    sql += " ORDER BY full_name";
    const students = await query(sql, params);
    res.json(students);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.create = async (req, res) => {
  try {
    const { full_name, class: cls, date_of_birth, gender, student_type,
      guardian_name, guardian_phone, guardian_email, address, academic_year, profile_photo } = req.body;
    if (!full_name || !cls) return res.status(400).json({ error: 'Full name and class are required' });
    const student_id = await nextId();
    const username = student_id.toLowerCase().replace(/-/g,'');
    const password = await bcrypt.hash('student123', 10);
    const photo = safePhoto(profile_photo);
    await run(`INSERT INTO students (student_id,full_name,class,date_of_birth,gender,student_type,guardian_name,guardian_phone,guardian_email,address,academic_year,username,password,profile_photo,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,'active')`,
      [student_id, full_name, cls, safeStr(date_of_birth), safeStr(gender), student_type||'day',
       safeStr(guardian_name), safeStr(guardian_phone), safeStr(guardian_email), safeStr(address),
       academic_year||'2024/2025', username, password, photo]);
    res.json({ message: 'Student registered', student_id, username, default_password: 'student123' });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.get = async (req, res) => {
  try {
    const s = await get("SELECT * FROM students WHERE id=?", [req.params.id]);
    if (!s) return res.status(404).json({ error: 'Student not found' });
    res.json(s);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.update = async (req, res) => {
  try {
    const { full_name, class: cls, date_of_birth, gender, student_type,
      guardian_name, guardian_phone, guardian_email, address, status, profile_photo } = req.body;
    const photo = safePhoto(profile_photo);
    if (photo) {
      await run(`UPDATE students SET full_name=?,class=?,date_of_birth=?,gender=?,student_type=?,guardian_name=?,guardian_phone=?,guardian_email=?,address=?,status=?,profile_photo=? WHERE id=?`,
        [safeStr(full_name), safeStr(cls), safeStr(date_of_birth), safeStr(gender), student_type||'day',
         safeStr(guardian_name), safeStr(guardian_phone), safeStr(guardian_email), safeStr(address), status||'active', photo, req.params.id]);
    } else {
      await run(`UPDATE students SET full_name=?,class=?,date_of_birth=?,gender=?,student_type=?,guardian_name=?,guardian_phone=?,guardian_email=?,address=?,status=? WHERE id=?`,
        [safeStr(full_name), safeStr(cls), safeStr(date_of_birth), safeStr(gender), student_type||'day',
         safeStr(guardian_name), safeStr(guardian_phone), safeStr(guardian_email), safeStr(address), status||'active', req.params.id]);
    }
    res.json({ message: 'Student updated successfully' });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.delete = async (req, res) => {
  try {
    await run("DELETE FROM attendance WHERE student_id=?", [req.params.id]);
    await run("DELETE FROM grades WHERE student_id=?", [req.params.id]);
    await run("DELETE FROM mock_exam WHERE student_id=?", [req.params.id]);
    await run("DELETE FROM report_conduct WHERE student_id=?", [req.params.id]);
    await run("DELETE FROM fees WHERE student_id=?", [req.params.id]);
    await run("DELETE FROM students WHERE id=?", [req.params.id]);
    res.json({ message: 'Student deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.resetPassword = async (req, res) => {
  try {
    const { new_password } = req.body;
    const pw = safeStr(new_password) || 'student123';
    const hash = await bcrypt.hash(pw, 10);
    await run("UPDATE students SET password=? WHERE id=?", [hash, req.params.id]);
    res.json({ message: `Password reset to: ${pw}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.uploadPhoto = async (req, res) => {
  try {
    const { photo } = req.body;
    const safe = safePhoto(photo);
    if (!safe) return res.status(400).json({ error: 'Photo too large or invalid. Please use a smaller image.' });
    await run("UPDATE students SET profile_photo=? WHERE id=?", [safe, req.params.id]);
    res.json({ message: 'Photo updated' });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.getByClass = async (req, res) => {
  try {
    const students = await query("SELECT id,student_id,full_name,class,gender,student_type,status FROM students WHERE class=? AND status='active' ORDER BY full_name", [req.params.class]);
    res.json(students);
  } catch (e) { res.status(500).json({ error: e.message }); }
};
