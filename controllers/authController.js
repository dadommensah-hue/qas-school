const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query, run, get } = require('../database');
const SECRET = process.env.JWT_SECRET || 'qas_secret_2024';

exports.login = async (req, res) => {
  try {
    const { username, password, portal } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

    let user = null;

    if (portal === 'student') {
      const s = await get("SELECT * FROM students WHERE username=?", [username]);
      console.log('[LOGIN] student lookup:', username, '-> found:', !!s, 'status:', s?.status, 'pw_len:', String(s?.password||'').length);
      if (s) {
        const pw = String(s.password || '');
        const match = pw.length > 0 ? await bcrypt.compare(String(password), pw) : false;
        console.log('[LOGIN] student pw match:', match);
        if (match) {
          user = {
            id: Number(s.id), username: String(s.username), full_name: String(s.full_name),
            role: 'student', class: String(s.class), student_id: String(s.student_id),
            profile_photo: s.profile_photo || null, student_type: String(s.student_type || 'day')
          };
        }
      }

    } else if (portal === 'teacher') {
      const t = await get("SELECT * FROM teachers WHERE username=?", [username]);
      console.log('[LOGIN] teacher lookup:', username, '-> found:', !!t, 'status:', t?.status, 'pw_len:', String(t?.password||'').length);
      if (t) {
        const pw = String(t.password || '');
        const match = pw.length > 0 ? await bcrypt.compare(String(password), pw) : false;
        console.log('[LOGIN] teacher pw match:', match);
        if (match) {
          const subjects = await query("SELECT subject,class FROM teacher_subjects WHERE teacher_id=?", [t.id]);
          const classRows = await query("SELECT assigned_class FROM teacher_class_assignments WHERE teacher_id=?", [t.id]);
          user = {
            id: Number(t.id), username: String(t.username), full_name: String(t.full_name),
            role: 'teacher', teacher_id: String(t.teacher_id), profile_photo: t.profile_photo || null,
            subject_specialization: String(t.subject_specialization || ''),
            subjects, assignedClasses: classRows.map(r => r.assigned_class)
          };
        }
      }

    } else {
      const u = await get("SELECT * FROM users WHERE username=?", [username]);
      console.log('[LOGIN] admin lookup:', username, '-> found:', !!u, 'pw_len:', String(u?.password||'').length);
      if (u) {
        const pw = String(u.password || '');
        const match = pw.length > 0 ? await bcrypt.compare(String(password), pw) : false;
        console.log('[LOGIN] admin pw match:', match);
        if (match) {
          user = {
            id: Number(u.id), username: String(u.username), full_name: String(u.full_name || ''),
            role: String(u.role), email: String(u.email || ''), profile_photo: u.profile_photo || null
          };
        }
      }
    }

    if (!user) return res.status(401).json({ error: 'Invalid username or password' });
    const token = jwt.sign({ id: user.id, role: user.role, portal: portal || 'admin' }, SECRET, { expiresIn: '24h' });
    res.json({ token, user });
  } catch (e) {
    console.error('[LOGIN ERROR]', e.message);
    res.status(500).json({ error: 'Login failed: ' + e.message });
  }
};

exports.me = async (req, res) => {
  try {
    const { id, portal } = req.user;
    if (portal === 'student') {
      const s = await get("SELECT id,student_id,full_name,class,gender,student_type,guardian_name,guardian_phone,profile_photo,username,status FROM students WHERE id=?", [id]);
      if (!s) return res.status(404).json({ error: 'Student not found' });
      return res.json({ ...s, id: Number(s.id), role: 'student' });
    } else if (portal === 'teacher') {
      const t = await get("SELECT id,teacher_id,full_name,gender,phone,email,profile_photo,username,subject_specialization FROM teachers WHERE id=?", [id]);
      if (!t) return res.status(404).json({ error: 'Teacher not found' });
      const subjects = await query("SELECT subject,class FROM teacher_subjects WHERE teacher_id=?", [id]);
      const classRows = await query("SELECT assigned_class FROM teacher_class_assignments WHERE teacher_id=?", [id]);
      return res.json({ ...t, id: Number(t.id), role: 'teacher', subjects, assignedClasses: classRows.map(r => r.assigned_class) });
    } else {
      const u = await get("SELECT id,username,full_name,role,email,phone,profile_photo FROM users WHERE id=?", [id]);
      if (!u) return res.status(404).json({ error: 'User not found' });
      return res.json({ ...u, id: Number(u.id) });
    }
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.changePassword = async (req, res) => {
  try {
    const { old_password, new_password } = req.body;
    const { id, portal } = req.user;
    let stored;
    if (portal === 'student') stored = await get("SELECT password FROM students WHERE id=?", [id]);
    else if (portal === 'teacher') stored = await get("SELECT password FROM teachers WHERE id=?", [id]);
    else stored = await get("SELECT password FROM users WHERE id=?", [id]);
    if (!stored || !await bcrypt.compare(String(old_password), String(stored.password||'')))
      return res.status(400).json({ error: 'Current password is incorrect' });
    const hash = await bcrypt.hash(String(new_password), 10);
    if (portal === 'student') await run("UPDATE students SET password=? WHERE id=?", [hash, id]);
    else if (portal === 'teacher') await run("UPDATE teachers SET password=? WHERE id=?", [hash, id]);
    else await run("UPDATE users SET password=? WHERE id=?", [hash, id]);
    res.json({ message: 'Password updated successfully' });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.createUser = async (req, res) => {
  try {
    const { username, password, role, full_name, email } = req.body;
    const existing = await get("SELECT id FROM users WHERE username=?", [username]);
    if (existing) return res.status(400).json({ error: 'Username already exists' });
    const hash = await bcrypt.hash(String(password), 10);
    await run("INSERT INTO users (username,password,role,full_name,email) VALUES (?,?,?,?,?)",
      [username, hash, role||'teacher', full_name||'', email||'']);
    res.json({ message: 'User created successfully' });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.listUsers = async (req, res) => {
  try {
    const users = await query("SELECT id,username,role,full_name,email,created_at FROM users ORDER BY created_at DESC");
    res.json(users);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.forgotPassword = async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'Username required' });
    const student = await get("SELECT id,full_name FROM students WHERE username=?", [username]);
    if (student) {
      const hash = await bcrypt.hash('student123', 10);
      await run("UPDATE students SET password=? WHERE id=?", [hash, student.id]);
      return res.json({ message: `Password reset to "student123" for ${student.full_name}` });
    }
    const teacher = await get("SELECT id,full_name FROM teachers WHERE username=?", [username]);
    if (teacher) {
      const hash = await bcrypt.hash('teacher123', 10);
      await run("UPDATE teachers SET password=? WHERE id=?", [hash, teacher.id]);
      return res.json({ message: `Password reset to "teacher123" for ${teacher.full_name}` });
    }
    return res.status(404).json({ error: 'Username not found. Please contact the admin.' });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.adminResetPassword = async (req, res) => {
  try {
    const { username, new_password } = req.body;
    if (!username) return res.status(400).json({ error: 'Username required' });
    const student = await get("SELECT id,full_name FROM students WHERE username=?", [username]);
    if (student) {
      const pw = new_password || 'student123';
      await run("UPDATE students SET password=? WHERE id=?", [await bcrypt.hash(pw, 10), student.id]);
      return res.json({ message: `Password reset for ${student.full_name} → ${pw}` });
    }
    const teacher = await get("SELECT id,full_name FROM teachers WHERE username=?", [username]);
    if (teacher) {
      const pw = new_password || 'teacher123';
      await run("UPDATE teachers SET password=? WHERE id=?", [await bcrypt.hash(pw, 10), teacher.id]);
      return res.json({ message: `Password reset for ${teacher.full_name} → ${pw}` });
    }
    return res.status(404).json({ error: 'Username not found' });
  } catch (e) { res.status(500).json({ error: e.message }); }
};
