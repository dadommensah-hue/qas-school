const { query, run, get } = require('../database');

exports.dashboard = async (req, res) => {
  try {
    const totalStudentsRow = await get("SELECT COUNT(*) as count FROM students WHERE status='active'");
    const totalStudents = totalStudentsRow?.count || 0;
    const boardingRow = await get("SELECT COUNT(*) as count FROM students WHERE status='active' AND student_type='boarding'");
    const boardingStudents = boardingRow?.count || 0;
    const dayRow = await get("SELECT COUNT(*) as count FROM students WHERE status='active' AND student_type='day'");
    const dayStudents = dayRow?.count || 0;
    const teachersRow = await get("SELECT COUNT(*) as count FROM teachers WHERE status='active'");
    const totalTeachers = teachersRow?.count || 0;
    const today = new Date().toISOString().split('T')[0];
    const todayAttendance = await get("SELECT COUNT(CASE WHEN status='present' THEN 1 END) as present, COUNT(*) as total FROM attendance WHERE date=?", [today]) || { present: 0, total: 0 };
    const avgRow = await get("SELECT AVG(class_score + exam_score) as avg FROM grades WHERE term='Term 1'");
    const avgScore = avgRow?.avg || 0;
    const upcomingEvents = await query("SELECT * FROM events WHERE event_date >= ? ORDER BY event_date LIMIT 5", [today]);
    const smsRow = await get("SELECT COUNT(*) as count FROM sms_logs WHERE date(sent_at) = ?", [today]);
    const recentSMS = smsRow?.count || 0;
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
    const poorAttendance = await query(`SELECT s.full_name, s.class,
      COUNT(CASE WHEN a.status='absent' THEN 1 END) as absences, COUNT(a.id) as total
      FROM students s JOIN attendance a ON s.id=a.student_id WHERE a.term='Term 1'
      GROUP BY s.id HAVING absences > 5 ORDER BY absences DESC LIMIT 5`);
    if (poorAttendance.length > 0) {
      insights.push({ type:'warning', icon:'⚠️', title:'Attendance Alert',
        message:`${poorAttendance.length} student(s) have missed more than 5 days. ${poorAttendance[0]?.full_name} leads with ${poorAttendance[0]?.absences} absences.`,
        action:'Send SMS reminders to guardians' });
    }
    const failingStudents = await query(`SELECT s.full_name, s.class, COUNT(*) as fail_count
      FROM students s JOIN grades g ON s.id=g.student_id WHERE g.grade='F' AND g.term='Term 1'
      GROUP BY s.id HAVING fail_count >= 2 ORDER BY fail_count DESC LIMIT 5`);
    if (failingStudents.length > 0) {
      insights.push({ type:'danger', icon:'📉', title:'Academic Risk',
        message:`${failingStudents.length} student(s) are failing 2+ subjects. Immediate intervention recommended.`,
        action:'Review grade records' });
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