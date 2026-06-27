const { query, run, get } = require('../database');

// Ensure next_term_begins column exists on existing databases
function ensureNextTermColumn() {
  try {
    const cols = await query("PRAGMA table_info(report_conduct)");
    if (cols.length > 0 && !cols.some(c => c.name === 'next_term_begins')) {
      await run("ALTER TABLE report_conduct ADD COLUMN next_term_begins TEXT DEFAULT ''");
      console.log('[conductController] Added next_term_begins column');
    }
  } catch(e) { /* already exists or not ready */ }
}
try { ensureNextTermColumn(); } catch(e) {}

exports.get = async (req, res) => {
  try {
    const { student_id } = req.params;
    const { term, academic_year, exam_type } = req.query;
    const conduct = await get("SELECT * FROM report_conduct WHERE student_id=? AND term=? AND academic_year=? AND exam_type=?",
      [student_id, term || 'Term 1', academic_year || '2024/2025', exam_type || 'end_of_term']);
    res.json(conduct || { conduct: '', interest: '', attitude: '', teacher_remark: '', promoted_to: '', next_term_begins: '' });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.save = async (req, res) => {
  try {
    const { student_id, term, academic_year, exam_type, conduct, interest, attitude, teacher_remark, promoted_to, next_term_begins } = req.body;
    const ay = academic_year || '2024/2025';
    const et = exam_type || 'end_of_term';
    const existing = await get("SELECT id FROM report_conduct WHERE student_id=? AND term=? AND academic_year=? AND exam_type=?",
      [student_id, term, ay, et]);
    if (existing) {
      await run("UPDATE report_conduct SET conduct=?, interest=?, attitude=?, teacher_remark=?, promoted_to=?, next_term_begins=?, updated_by=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
        [conduct||'', interest||'', attitude||'', teacher_remark||'', promoted_to||'', next_term_begins||'', req.user?.id, existing.id]);
    } else {
      await run("INSERT INTO report_conduct (student_id, term, academic_year, exam_type, conduct, interest, attitude, teacher_remark, promoted_to, next_term_begins, updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        [student_id, term, ay, et, conduct||'', interest||'', attitude||'', teacher_remark||'', promoted_to||'', next_term_begins||'', req.user?.id]);
    }
    res.json({ message: 'Conduct & remarks saved' });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.getByClass = async (req, res) => {
  try {
    const { class: cls } = req.params;
    const { term, academic_year, exam_type } = req.query;
    const students = await query("SELECT id, full_name, student_id FROM students WHERE class=? AND status='active' ORDER BY full_name", [cls]);
    const results = students.map(s => {
      const c = await get("SELECT * FROM report_conduct WHERE student_id=? AND term=? AND academic_year=? AND exam_type=?",
        [s.id, term || 'Term 1', academic_year || '2024/2025', exam_type || 'end_of_term']);
      return { ...s, ...(c || { conduct:'', interest:'', attitude:'', teacher_remark:'', promoted_to:'', next_term_begins:'' }) };
    });
    res.json(results);
  } catch (e) { res.status(500).json({ error: e.message }); }
};
