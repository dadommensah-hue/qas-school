const bcrypt = require('bcryptjs');
const { query, run, get } = require('../database');

function safeStr(v) { return (v === undefined || v === null) ? '' : String(v); }
function safePhoto(v) {
  if (!v || typeof v !== 'string' || v.length < 10) return null;
  if (v.length > 500000) return null;
  return v;
}

async function nextTeacherId() {
  const r = await get("SELECT teacher_id FROM teachers ORDER BY id DESC LIMIT 1");
  let num = 0;
  if (r && r.teacher_id) {
    const parts = String(r.teacher_id).split('-');
    num = parseInt(parts[parts.length - 1]) || 0;
  }
  num++;
  return `QAS-TCH-${String(num).padStart(3,'0')}`;
}

exports.list = async (req, res) => {
  try {
    const teachers = await query(`SELECT t.id,t.teacher_id,t.full_name,t.gender,t.phone,t.email,t.subject_specialization,t.qualification,t.status,t.username,t.profile_photo,
      GROUP_CONCAT(DISTINCT ts.subject) as assigned_subjects
      FROM teachers t LEFT JOIN teacher_subjects ts ON t.id=ts.teacher_id
      GROUP BY t.id ORDER BY t.full_name`);
    res.json(teachers);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.create = async (req, res) => {
  try {
    const { full_name, gender, phone, email, subject_specialization, qualification, profile_photo } = req.body;
    if (!full_name) return res.status(400).json({ error: 'Full name is required' });
    const teacher_id = await nextTeacherId();
    // Generate unique username - add timestamp suffix if needed
    let username = teacher_id.toLowerCase().replace(/-/g,'');
    const existing = await get("SELECT id FROM teachers WHERE username=?", [username]);
    if (existing) username = username + Date.now().toString().slice(-4);
    const password = await bcrypt.hash('teacher123', 10);
    const photo = safePhoto(profile_photo);
    await run(`INSERT INTO teachers (teacher_id,full_name,gender,phone,email,subject_specialization,qualification,profile_photo,username,password,status) VALUES (?,?,?,?,?,?,?,?,?,?,'active')`,
      [teacher_id, full_name, safeStr(gender)||'Male', safeStr(phone), safeStr(email),
       safeStr(subject_specialization), safeStr(qualification), photo, username, password]);
    res.json({ message: 'Teacher registered', teacher_id, username, default_password: 'teacher123' });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.get = async (req, res) => {
  try {
    const t = await get("SELECT * FROM teachers WHERE id=?", [req.params.id]);
    if (!t) return res.status(404).json({ error: 'Teacher not found' });
    const subjects = await query("SELECT id,subject,class FROM teacher_subjects WHERE teacher_id=?", [req.params.id]);
    const assignedClasses = await query("SELECT assigned_class FROM teacher_class_assignments WHERE teacher_id=?", [req.params.id]);
    res.json({ ...t, subjects, assignedClasses: assignedClasses.map(r=>r.assigned_class) });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.update = async (req, res) => {
  try {
    const { full_name, gender, phone, email, subject_specialization, qualification, status, profile_photo } = req.body;
    const photo = safePhoto(profile_photo);
    if (photo) {
      await run(`UPDATE teachers SET full_name=?,gender=?,phone=?,email=?,subject_specialization=?,qualification=?,status=?,profile_photo=? WHERE id=?`,
        [safeStr(full_name), safeStr(gender), safeStr(phone), safeStr(email), safeStr(subject_specialization), safeStr(qualification), status||'active', photo, req.params.id]);
    } else {
      await run(`UPDATE teachers SET full_name=?,gender=?,phone=?,email=?,subject_specialization=?,qualification=?,status=? WHERE id=?`,
        [safeStr(full_name), safeStr(gender), safeStr(phone), safeStr(email), safeStr(subject_specialization), safeStr(qualification), status||'active', req.params.id]);
    }
    res.json({ message: 'Teacher updated' });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.delete = async (req, res) => {
  try {
    await run("DELETE FROM teacher_subjects WHERE teacher_id=?", [req.params.id]);
    await run("DELETE FROM teacher_class_assignments WHERE teacher_id=?", [req.params.id]);
    await run("DELETE FROM teachers WHERE id=?", [req.params.id]);
    res.json({ message: 'Teacher deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.assignSubjects = async (req, res) => {
  try {
    const { subjects } = req.body;
    await run("DELETE FROM teacher_subjects WHERE teacher_id=?", [req.params.id]);
    for (const s of (subjects||[])) {
      await run("INSERT INTO teacher_subjects (teacher_id,subject,class) VALUES (?,?,?)", [req.params.id, s.subject, s.class||'all']);
    }
    res.json({ message: 'Subjects assigned' });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.assignClasses = async (req, res) => {
  try {
    const { classes } = req.body;
    await run("DELETE FROM teacher_class_assignments WHERE teacher_id=?", [req.params.id]);
    for (const cls of (classes||[])) {
      await run("INSERT OR IGNORE INTO teacher_class_assignments (teacher_id,assigned_class) VALUES (?,?)", [req.params.id, cls]);
    }
    res.json({ message: 'Classes assigned' });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.resetPassword = async (req, res) => {
  try {
    const pw = req.body.new_password || 'teacher123';
    const hash = await bcrypt.hash(pw, 10);
    await run("UPDATE teachers SET password=? WHERE id=?", [hash, req.params.id]);
    res.json({ message: `Password reset to: ${pw}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
};
