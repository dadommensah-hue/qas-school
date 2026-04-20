const { query, run, get } = require('../database');
const { gradeFromScore, remarkFromGrade } = require('../helpers');

exports.save = async (req, res) => {
  try {
    const { grades } = req.body;
    for (const g of grades) {
      const total = parseFloat(g.class_score || 0) + parseFloat(g.exam_score || 0);
      const grade = gradeFromScore(total);
      const remarks = remarkFromGrade(grade);
      const existing = await get("SELECT id FROM grades WHERE student_id=? AND subject=? AND term=? AND academic_year=?",
        [g.student_id, g.subject, g.term, g.academic_year || '2024/2025']);
      if (existing) {
        await run("UPDATE grades SET class_score=?, exam_score=?, total_score=?, grade=?, remarks=?, recorded_by=? WHERE id=?",
          [g.class_score, g.exam_score, total, grade, remarks, req.user?.id, existing.id]);
      } else {
        await run("INSERT INTO grades (student_id, subject, class, term, academic_year, class_score, exam_score, total_score, grade, remarks, recorded_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
          [g.student_id, g.subject, g.class || '', g.term, g.academic_year || '2024/2025', g.class_score, g.exam_score, total, grade, remarks, req.user?.id]);
      }
    }
    res.json({ message: 'Grades saved successfully' });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.getByClass = async (req, res) => {
  try {
    const { class: cls } = req.params;
    const { term, subject, academic_year } = req.query;
    let sql = "SELECT g.*, s.full_name, s.student_id as sid FROM grades g JOIN students s ON g.student_id=s.id WHERE g.class=?";
    const params = [cls];
    if (term) { sql += " AND g.term=?"; params.push(term); }
    if (subject) { sql += " AND g.subject=?"; params.push(subject); }
    if (academic_year) { sql += " AND g.academic_year=?"; params.push(academic_year); }
    sql += " ORDER BY s.full_name, g.subject";
    res.json(await query(sql, params));
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.getStudentReport = async (req, res) => {
  try {
    const { id } = req.params;
    const { term, academic_year } = req.query;
    const student = await get("SELECT * FROM students WHERE id=?", [id]);
    if (!student) return res.status(404).json({ error: 'Student not found' });
    const grades = await query("SELECT * FROM grades WHERE student_id=? AND term=? AND academic_year=? ORDER BY subject",
      [id, term || 'Term 1', academic_year || '2024/2025']);
    const attendance = await get("SELECT COUNT(*) as total, COUNT(CASE WHEN status='present' THEN 1 END) as present FROM attendance WHERE student_id=? AND term=?",
      [id, term || 'Term 1']) || { total: 0, present: 0 };
    const totalScore = grades.reduce((sum, g) => sum + (parseFloat(g.total_score) || 0), 0);
    const average = grades.length ? (totalScore / grades.length).toFixed(1) : 0;
    const overallGrade = gradeFromScore(parseFloat(average));
    const classStudents = await query(`SELECT s.id, AVG(g.class_score+g.exam_score) as avg_score
      FROM students s JOIN grades g ON s.id=g.student_id
      WHERE s.class=? AND g.term=? AND s.status='active' GROUP BY s.id ORDER BY avg_score DESC`,
      [student.class, term || 'Term 1']);
    const pos = classStudents.findIndex(s => s.id == id);
    const position = pos >= 0 ? pos + 1 : null;
    const enrollRow = await get("SELECT COUNT(*) as count FROM students WHERE class=? AND status='active'", [student.class]);
    const totalEnrollment = enrollRow?.count || 0;
    res.json({ student, grades, attendance, average, overallGrade, position, totalEnrollment });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.classPerformance = async (req, res) => {
  try {
    const { class: cls } = req.params;
    const { term } = req.query;
    const data = await query(`SELECT subject,
      AVG(class_score) as avg_class, AVG(exam_score) as avg_exam,
      AVG(class_score + exam_score) as avg_total,
      COUNT(CASE WHEN grade='A' THEN 1 END) as grade_a,
      COUNT(CASE WHEN grade='B' THEN 1 END) as grade_b,
      COUNT(CASE WHEN grade='C' THEN 1 END) as grade_c,
      COUNT(CASE WHEN grade='D' THEN 1 END) as grade_d,
      COUNT(CASE WHEN grade='F' THEN 1 END) as grade_f,
      COUNT(*) as total
      FROM grades WHERE class=? AND term=? GROUP BY subject`, [cls, term || 'Term 1']);
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.topStudents = async (req, res) => {
  try {
    const { term, class: cls } = req.query;
    let sql = `SELECT s.full_name, s.class, s.student_id as sid,
      AVG(g.class_score + g.exam_score) as avg_score, COUNT(g.id) as subject_count
      FROM grades g JOIN students s ON g.student_id = s.id WHERE g.term=?`;
    const params = [term || 'Term 1'];
    if (cls) { sql += " AND g.class=?"; params.push(cls); }
    sql += " GROUP BY g.student_id ORDER BY avg_score DESC LIMIT 10";
    res.json(await query(sql, params));
  } catch (e) { res.status(500).json({ error: e.message }); }
};