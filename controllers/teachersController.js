const bcrypt = require('bcryptjs');
const { query, run, get } = require('../database');

exports.list = async (req, res) => {
  try {
    const teachers = await query(`SELECT t.*, GROUP_CONCAT(DISTINCT ts.subject) as assigned_subjects
      FROM teachers t LEFT JOIN teacher_subjects ts ON t.id=ts.teacher_id
      GROUP BY t.id ORDER BY t.full_name`);
    res.json(teachers);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.create = async (req, res) => {
  try {
    const { full_name, gender, phone, email, subject_specialization, qualification, profile_photo } = req.body;
    if (!full_name) return res.status(400).json({ error: 'Full name required' });
    const cRow = await get("SELECT COUNT(*) as c FROM teachers");
    const c = cRow?.c || 0;
    const teacherId = `QAS-TCH-${String(c+1).padStart(3,'0')}`;
    const username = teacherId.toLowerCase().replace(/-/g,'');
    const password = await bcrypt.hash('teacher123', 10);
    await run(`INSERT INTO teachers (teacher_id,full_name,gender,phone,email,subject_specialization,qualification,profile_photo,username,password) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [teacherId, full_name, gender||'Male', phone||'', email||'', subject_specialization||'', qualification||'', profile_photo||null, username, password]);
    res.json({ message: 'Teacher registered', teacher_id: teacherId, username, default_password: 'teacher123' });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.get = async (req, res) => {
  try {
    const t = await get("SELECT * FROM teachers WHERE id=?", [req.params.id]);
    if (!t) return res.status(404).json({ error: 'Not found' });
    const subjects = await query("SELECT id,subject,class FROM teacher_subjects WHERE teacher_id=?", [req.params.id]);
    res.json({ ...t, subjects });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.update = async (req, res) => {
  try {
    const { full_name, gender, phone, email, subject_specialization, qualification, status, profile_photo } = req.body;
    const photo = (profile_photo && profile_photo.length > 10) ? profile_photo : null;
    if (photo) {
      await run(`UPDATE teachers SET full_name=?,gender=?,phone=?,email=?,subject_specialization=?,qualification=?,status=?,profile_photo=? WHERE id=?`,
        [full_name, gender, phone, email, subject_specialization, qualification, status||'active', photo, req.params.id]);
    } else {
      await run(`UPDATE teachers SET full_name=?,gender=?,phone=?,email=?,subject_specialization=?,qualification=?,status=? WHERE id=?`,
        [full_name, gender, phone, email, subject_specialization, qualification, status||'active', req.params.id]);
    }
    res.json({ message: 'Updated' });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.delete = async (req, res) => {
  try {
    await run("DELETE FROM teacher_subjects WHERE teacher_id=?", [req.params.id]);
    await run("DELETE FROM teachers WHERE id=?", [req.params.id]);
    res.json({ message: 'Teacher deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.assignSubjects = async (req, res) => {
  try {
    const { subjects } = req.body;
    await run("DELETE FROM teacher_subjects WHERE teacher_id=?", [req.params.id]);
    for (const s of (subjects||[])) {
      await run("INSERT INTO teacher_subjects (teacher_id,subject,class) VALUES (?,?,?)",
        [req.params.id, s.subject, s.class||'all']);
    }
    res.json({ message: 'Subjects assigned' });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.assignClass = async (req, res) => {
  try {
    const { assigned_class } = req.body;
    if (!assigned_class) return res.status(400).json({ error: 'Class required' });
    await run("INSERT OR IGNORE INTO teacher_class_assignments (teacher_id, assigned_class) VALUES (?,?)",
      [req.params.id, assigned_class]);
    res.json({ message: 'Class assigned' });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.getClassAssignments = async (req, res) => {
  try {
    const assignments = await query(`SELECT tca.id, tca.assigned_class, t.full_name, t.teacher_id
      FROM teacher_class_assignments tca JOIN teachers t ON tca.teacher_id=t.id ORDER BY tca.assigned_class`);
    res.json(assignments);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.removeClassAssignment = async (req, res) => {
  try {
    await run("DELETE FROM teacher_class_assignments WHERE id=?", [req.params.id]);
    res.json({ message: 'Removed' });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.getMyClasses = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.json([]);
    const classes = await query("SELECT * FROM teacher_class_assignments WHERE teacher_id=?", [userId]);
    res.json(classes);
  } catch (e) { res.json([]); }
};