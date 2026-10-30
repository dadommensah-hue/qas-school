const { query, run, get } = require('../database');

exports.dashboard = async (req, res) => {
  try {
    const _ts = await get("SELECT COUNT(*) as count FROM students WHERE status='active'"); const totalStudents = parseInt(String(parseInt(String(_ts?.count||0))||0));
    const _bs = await get("SELECT COUNT(*) as count FROM students WHERE status='active' AND student_type='boarding'"); const boardingStudents = parseInt(String(parseInt(String(_bs?.count||0))||0));
    const _ds = await get("SELECT COUNT(*) as count FROM students WHERE status='active' AND student_type='day'"); const dayStudents = parseInt(String(parseInt(String(_ds?.count||0))||0));
    const _tt = await get("SELECT COUNT(*) as count FROM teachers WHERE status='active'"); const totalTeachers = parseInt(String(parseInt(String(_tt?.count||0))||0));
    const today = new Date().toISOString().split('T')[0];
    const todayAttendance = await get("SELECT COUNT(CASE WHEN status='present' THEN 1 END) as present, COUNT(*) as total FROM attendance WHERE date=?", [today]) || {present:0,total:0};
    const _avg = await get("SELECT AVG(class_score + exam_score) as avg FROM grades WHERE term='Term 1'"); const avgScore = _avg?.avg ? parseFloat(_avg.avg).toFixed(1) : 0;
    const upcomingEvents = await query("SELECT * FROM events WHERE event_date >= ? ORDER BY event_date LIMIT 5", [today]);
    const _sms = await get("SELECT COUNT(*) as count FROM sms_logs WHERE date(sent_at) = ?", [today]); const recentSMS = parseInt(String(_sms?.count||0)) || 0;
    const byClass = await query("SELECT class, COUNT(*) as count FROM students WHERE status='active' GROUP BY class ORDER BY class");
    const gradeDistribution = await query("SELECT grade, COUNT(*) as count FROM grades WHERE term='Term 1' GROUP BY grade ORDER BY grade");
    const weeklyAttendance = await query(`SELECT date,
      COUNT(CASE WHEN status='present' THEN 1 END) as present, COUNT(*) as total
      FROM attendance WHERE date >= date('now','-7 days') GROUP BY date ORDER BY date`);

    res.json({
      totalStudents, boardingStudents, dayStudents, totalTeachers,
      todayAttendance,
      attendanceRate: todayAttendance.total ? ((todayAttendance.present/todayAttendance.total)*100).toFixed(1) : 0,
      avgScore: avgScore ? parseFloat(avgScore).toFixed(1) : 0,
      upcomingEvents, recentSMS, byClass, gradeDistribution, weeklyAttendance
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.aiInsights = async (req, res) => {
  try {
    const insights = [];

    // ── Attendance alert ──
    const poorAttendance = await query(`SELECT s.full_name, s.class,
      COUNT(CASE WHEN a.status='absent' THEN 1 END) as absences, COUNT(a.id) as total
      FROM students s JOIN attendance a ON s.id=a.student_id WHERE a.term='Term 1'
      GROUP BY s.id HAVING absences > 5 ORDER BY absences DESC LIMIT 5`);
    if (poorAttendance.length > 0) {
      insights.push({ type:'warning', icon:'⚠️', title:'Attendance Alert',
        message:`${poorAttendance.length} student(s) have missed more than 5 days. ${poorAttendance[0]?.full_name} leads with ${poorAttendance[0]?.absences} absences.`,
        action:'Send SMS reminders to guardians' });
    }

    // ── End-of-term academic risk ──
    const failingStudents = await query(`SELECT s.full_name, s.class, COUNT(*) as fail_count
      FROM students s JOIN grades g ON s.id=g.student_id WHERE g.grade='F' AND g.term='Term 1'
      GROUP BY s.id HAVING fail_count >= 2 ORDER BY fail_count DESC LIMIT 5`);
    if (failingStudents.length > 0) {
      insights.push({ type:'danger', icon:'📉', title:'Academic Risk',
        message:`${failingStudents.length} student(s) are failing 2+ subjects. Immediate intervention recommended.`,
        action:'Review grade records' });
    }

    // ── Mid-term overall average ──
    const mtAvgRow = await get(`SELECT AVG(exam_score) as avg_score, COUNT(DISTINCT student_id) as num_students FROM midterm_grades`);
    if (mtAvgRow && mtAvgRow.num_students > 0) {
      const avg = parseFloat(mtAvgRow.avg_score||0).toFixed(1);
      const avgNum = parseFloat(avg);
      const type = avgNum >= 70 ? 'success' : avgNum >= 50 ? 'warning' : 'danger';
      const icon = avgNum >= 70 ? '📊' : avgNum >= 50 ? '📊' : '📉';
      insights.push({ type, icon, title:'Mid-Term Overall Average',
        message:`School-wide mid-term average is ${avg}% across ${mtAvgRow.num_students} student(s). ${avgNum >= 70 ? 'Performance is satisfactory.' : avgNum >= 50 ? 'Room for improvement before end of term.' : 'Performance is below expectation — urgent review needed.'}` });
    }

    // ── Mid-term top performers ──
    const mtTop = await query(`SELECT s.full_name, s.class, AVG(g.exam_score) as avg
      FROM students s JOIN midterm_grades g ON s.id=g.student_id
      GROUP BY s.id ORDER BY avg DESC LIMIT 3`);
    if (mtTop.length > 0) {
      const names = mtTop.map(t=>`${t.full_name} (${parseFloat(t.avg).toFixed(1)}%)`).join(', ');
      insights.push({ type:'success', icon:'🏆', title:'Mid-Term Top Performers',
        message:`Leading students this mid-term: ${names}.` });
    }

    // ── Mid-term students at risk (avg below 50) ──
    const mtAtRisk = await query(`SELECT s.full_name, s.class, AVG(g.exam_score) as avg
      FROM students s JOIN midterm_grades g ON s.id=g.student_id
      GROUP BY s.id HAVING avg < 50 ORDER BY avg ASC LIMIT 5`);
    if (mtAtRisk.length > 0) {
      insights.push({ type:'danger', icon:'🚨', title:'Mid-Term At-Risk Students',
        message:`${mtAtRisk.length} student(s) scored below 50% average in mid-term exams. ${mtAtRisk[0]?.full_name} (${parseFloat(mtAtRisk[0]?.avg||0).toFixed(1)}%) needs immediate support.` });
    }

    // ── Mid-term subject with lowest average ──
    const mtSubjects = await query(`SELECT subject, AVG(exam_score) as avg_score, COUNT(*) as cnt
      FROM midterm_grades GROUP BY subject ORDER BY avg_score ASC LIMIT 1`);
    if (mtSubjects.length > 0 && parseFloat(mtSubjects[0].avg_score) < 60) {
      insights.push({ type:'warning', icon:'📚', title:'Mid-Term Weak Subject',
        message:`"${mtSubjects[0].subject}" has the lowest mid-term average at ${parseFloat(mtSubjects[0].avg_score).toFixed(1)}% across ${mtSubjects[0].cnt} entries. Consider extra support or revision classes.` });
    }

    if (!insights.length) {
      insights.push({ type:'success', icon:'🎉', title:'All Looking Good',
        message:'No critical issues detected. School performance is on track.',
        action:'View detailed analytics' });
    }
    res.json({ insights });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.subjectAnalysis = async (req, res) => {
  try {
    const subjects = await query(`SELECT subject,
      AVG(class_score+exam_score) as avg_total,
      COUNT(CASE WHEN grade='A' THEN 1 END) as grade_a,
      COUNT(CASE WHEN grade='F' THEN 1 END) as grade_f,
      COUNT(*) as total_students
      FROM grades WHERE term='Term 1' GROUP BY subject ORDER BY subject`);
    res.json(subjects);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.termComparison = async (req, res) => {
  try {
    const data = await query(`SELECT term, AVG(class_score+exam_score) as avg FROM grades GROUP BY term ORDER BY term`);
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
};
