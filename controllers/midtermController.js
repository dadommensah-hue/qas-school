const { query, run, get } = require('../database');

function gradeFromScore(score) {
  const s = parseFloat(score);
  if (isNaN(s)) return 'F';
  if (s >= 80) return 'A';
  if (s >= 70) return 'B';
  if (s >= 60) return 'C';
  if (s >= 50) return 'D';
  return 'F';
}

function remarkFromGrade(grade) {
  return {A:'Excellent',B:'Very Good',C:'Good',D:'Pass',F:'Fail'}[grade]||'N/A';
}

const MIDTERM_CLASSES = ['Basic 1','Basic 2','Basic 3','Basic 4','Basic 5','Basic 6','Basic 7','Basic 8'];

exports.save = (req, res) => {
  try {
    const { grades } = req.body;
    for (const g of grades) {
      if (!MIDTERM_CLASSES.includes(g.class)) continue;
      const score = parseFloat(g.exam_score || 0);
      const grade = gradeFromScore(score);
      const remarks = remarkFromGrade(grade);
      const existing = get("SELECT id FROM midterm_grades WHERE student_id=? AND subject=? AND term=? AND academic_year=?",
        [g.student_id, g.subject, g.term, g.academic_year || '2024/2025']);
      if (existing) {
        run("UPDATE midterm_grades SET exam_score=?, grade=?, remarks=?, recorded_by=? WHERE id=?",
          [g.exam_score, grade, remarks, req.user?.id, existing.id]);
      } else {
        run("INSERT INTO midterm_grades (student_id, subject, class, term, academic_year, exam_score, grade, remarks, recorded_by) VALUES (?,?,?,?,?,?,?,?,?)",
          [g.student_id, g.subject, g.class || '', g.term, g.academic_year || '2024/2025', g.exam_score, grade, remarks, req.user?.id]);
      }
    }
    res.json({ message: 'Mid-term grades saved successfully' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.getByClass = (req, res) => {
  const { class: cls } = req.params;
  const { term, subject, academic_year } = req.query;
  let sql = "SELECT g.*, s.full_name, s.student_id as sid FROM midterm_grades g JOIN students s ON g.student_id=s.id WHERE g.class=?";
  const params = [cls];
  if (term) { sql += " AND g.term=?"; params.push(term); }
  if (subject) { sql += " AND g.subject=?"; params.push(subject); }
  if (academic_year) { sql += " AND g.academic_year=?"; params.push(academic_year); }
  sql += " ORDER BY s.full_name, g.subject";
  res.json(query(sql, params));
};

exports.getStudentReport = (req, res) => {
  const { id } = req.params;
  const { term, academic_year } = req.query;
  const student = get("SELECT * FROM students WHERE id=?", [id]);
  if (!student) return res.status(404).json({ error: 'Student not found' });
  const grades = query("SELECT * FROM midterm_grades WHERE student_id=? AND term=? AND academic_year=? ORDER BY subject",
    [id, term || 'Term 1', academic_year || '2024/2025']);
  const totalScore = grades.reduce((sum, g) => sum + (parseFloat(g.exam_score) || 0), 0);
  const average = grades.length ? (totalScore / grades.length).toFixed(1) : 0;
  const overallGrade = gradeFromScore(parseFloat(average));

  // Check approval
  const approval = get("SELECT id FROM approved_terms WHERE class=? AND term=? AND exam_type='midterm' AND academic_year=?",
    [student.class, term || 'Term 1', academic_year || '2024/2025']);
  const approved = !!approval;

  // Position
  const classStudents = query(`SELECT s.id, AVG(g.exam_score) as avg_score
    FROM students s JOIN midterm_grades g ON s.id=g.student_id
    WHERE s.class=? AND g.term=? AND s.status='active' GROUP BY s.id ORDER BY avg_score DESC`,
    [student.class, term || 'Term 1']);
  const pos = classStudents.findIndex(s => s.id == id);
  const position = pos >= 0 ? pos + 1 : null;
  const totalEnrollment = get("SELECT COUNT(*) as count FROM students WHERE class=? AND status='active'", [student.class]).count;

  res.json({ student, grades, average, overallGrade, approved, position, totalEnrollment });
};

exports.topStudents = (req, res) => {
  const { term, class: cls } = req.query;
  let sql = `SELECT s.full_name, s.class, s.student_id as sid,
    AVG(g.exam_score) as avg_score, COUNT(g.id) as subject_count
    FROM midterm_grades g JOIN students s ON g.student_id = s.id WHERE g.term=?`;
  const params = [term || 'Term 1'];
  if (cls) { sql += " AND g.class=?"; params.push(cls); }
  sql += " GROUP BY g.student_id ORDER BY avg_score DESC LIMIT 10";
  res.json(query(sql, params));
};

exports.approve = (req, res) => {
  try {
    const { class: cls, term, academic_year } = req.body;
    const ay = academic_year || '2024/2025';
    const existing = get("SELECT id FROM approved_terms WHERE class=? AND term=? AND exam_type='midterm' AND academic_year=?", [cls, term, ay]);
    if (!existing) {
      run("INSERT INTO approved_terms (class, term, exam_type, academic_year, approved_by) VALUES (?,?,?,?,?)",
        [cls, term, 'midterm', ay, req.user?.id]);
    }
    res.json({ message: 'Mid-term report approved' });
  } catch (e) { res.status(500).json({ error: e.message }); }
};
