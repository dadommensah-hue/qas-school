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
      const s = get("SELECT * FROM students WHERE username=? AND status='active'", [username]);
      if (s && s.password && await bcrypt.compare(password, s.password)) {
        user = { id: s.id, username: s.username, full_name: s.full_name, role: 'student',
          class: s.class, student_id: s.student_id, profile_photo: s.profile_photo, student_type: s.student_type };
      }
    } else if (portal === 'teacher') {
      const t = get("SELECT * FROM teachers WHERE username=? AND status='active'", [username]);
      if (t && t.password && await bcrypt.compare(password, t.password)) {
        const subjects = query("SELECT subject,class FROM teacher_subjects WHERE teacher_id=?", [t.id]);
        const assignedClasses = query("SELECT assigned_class FROM teacher_class_assignments WHERE teacher_id=?", [t.id]).map(r=>r.assigned_class);
        user = { id: t.id, username: t.username, full_name: t.full_name, role: 'teacher',
          teacher_id: t.teacher_id, profile_photo: t.profile_photo, subjects,
          subject_specialization: t.subject_specialization, assignedClasses };
      }
    } else {
      const u = get("SELECT * FROM users WHERE username=?", [username]);
      if (u && await bcrypt.compare(password, u.password)) {
        user = { id: u.id, username: u.username, full_name: u.full_name, role: u.role, email: u.email, profile_photo: u.profile_photo };
      }
    }
    if (!user) return res.status(401).json({ error: 'Invalid username or password' });
    const token = jwt.sign({ id: user.id, role: user.role, portal: portal || 'admin' }, SECRET, { expiresIn: '12h' });
    res.json({ token, user });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.me = (req, res) => {
  try {
    const { id, portal } = req.user;
    if (portal === 'student') {
      const s = get("SELECT id,student_id,full_name,class,gender,student_type,guardian_name,guardian_phone,profile_photo,username,status FROM students WHERE id=?", [id]);
      return res.json({ ...s, role: 'student' });
    } else if (portal === 'teacher') {
      const t = get("SELECT id,teacher_id,full_name,gender,phone,email,profile_photo,username,subject_specialization FROM teachers WHERE id=?", [id]);
      const subjects = query("SELECT subject,class FROM teacher_subjects WHERE teacher_id=?", [id]);
      const assignedClasses = query("SELECT assigned_class FROM teacher_class_assignments WHERE teacher_id=?", [id]).map(r=>r.assigned_class);
      return res.json({ ...t, role: 'teacher', subjects, assignedClasses });
    } else {
      const u = get("SELECT id,username,full_name,role,email,phone,profile_photo FROM users WHERE id=?", [id]);
      return res.json(u);
    }
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.changePassword = async (req, res) => {
  try {
    const { old_password, new_password } = req.body;
    const { id, portal } = req.user;
    let stored;
    if (portal === 'student') stored = get("SELECT password FROM students WHERE id=?", [id]);
    else if (portal === 'teacher') stored = get("SELECT password FROM teachers WHERE id=?", [id]);
    else stored = get("SELECT password FROM users WHERE id=?", [id]);
    if (!stored || !await bcrypt.compare(old_password, stored.password))
      return res.status(400).json({ error: 'Current password is incorrect' });
    const hash = await bcrypt.hash(new_password, 10);
    if (portal === 'student') run("UPDATE students SET password=? WHERE id=?", [hash, id]);
    else if (portal === 'teacher') run("UPDATE teachers SET password=? WHERE id=?", [hash, id]);
    else run("UPDATE users SET password=? WHERE id=?", [hash, id]);
    res.json({ message: 'Password updated' });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.createUser = async (req, res) => {
  try {
    const { username, password, role, full_name, email } = req.body;
    const hash = await bcrypt.hash(password, 10);
    run("INSERT INTO users (username,password,role,full_name,email) VALUES (?,?,?,?,?)", [username, hash, role||'teacher', full_name||'', email||'']);
    res.json({ message: 'User created' });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.listUsers = (req, res) => {
  res.json(query("SELECT id,username,role,full_name,email,created_at FROM users ORDER BY created_at DESC"));
};

exports.forgotPassword = async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'Username required' });
    
    // Check students
    const student = get("SELECT id, full_name FROM students WHERE username=?", [username]);
    if (student) {
      const hash = await bcrypt.hash('student123', 10);
      run("UPDATE students SET password=? WHERE id=?", [hash, student.id]);
      return res.json({ message: 'Password reset to default (student123) for ' + student.full_name });
    }
    
    // Check teachers
    const teacher = get("SELECT id, full_name FROM teachers WHERE username=?", [username]);
    if (teacher) {
      const hash = await bcrypt.hash('teacher123', 10);
      run("UPDATE teachers SET password=? WHERE id=?", [hash, teacher.id]);
      return res.json({ message: 'Password reset to default (teacher123) for ' + teacher.full_name });
    }
    
    return res.status(404).json({ error: 'Username not found. Please contact the admin.' });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.adminResetPassword = async (req, res) => {
  try {
    const { username, new_password } = req.body;
    if (!username) return res.status(400).json({ error: 'Username required' });
    
    // Check students
    const student = get("SELECT id, full_name FROM students WHERE username=?", [username]);
    if (student) {
      const pw = new_password || 'student123';
      const hash = await bcrypt.hash(pw, 10);
      run("UPDATE students SET password=? WHERE id=?", [hash, student.id]);
      return res.json({ message: 'Password reset for student ' + student.full_name + ' (new password: ' + pw + ')' });
    }
    
    // Check teachers
    const teacher = get("SELECT id, full_name FROM teachers WHERE username=?", [username]);
    if (teacher) {
      const pw = new_password || 'teacher123';
      const hash = await bcrypt.hash(pw, 10);
      run("UPDATE teachers SET password=? WHERE id=?", [hash, teacher.id]);
      return res.json({ message: 'Password reset for teacher ' + teacher.full_name + ' (new password: ' + pw + ')' });
    }
    
    return res.status(404).json({ error: 'Username not found' });
  } catch (e) { res.status(500).json({ error: e.message }); }
};
