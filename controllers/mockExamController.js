const { query, run, get } = require('../database');

const CORE = ['English Language','Mathematics','Integrated Science','Social Studies'];
const MOCK_SUBJECTS = ['Career Technology','Computing','Creative Arts and Design','English Language','French','Ghanaian Language','Integrated Science','Mathematics','Religious and Moral Education','Social Studies'];

function beceGrade(score) {
  if (score >= 80) return 'A1';
  if (score >= 75) return 'B2';
  if (score >= 70) return 'B3';
  if (score >= 65) return 'C4';
  if (score >= 60) return 'C5';
  if (score >= 55) return 'C6';
  if (score >= 50) return 'D7';
  if (score >= 45) return 'E8';
  return 'F9';
}

function gradePoints(grade) {
  return ({ A1:1, B2:2, B3:3, C4:4, C5:5, C6:6, D7:7, E8:8, F9:9 }[grade] || 9);
}

function calcAggregate(scores) {
  // Always recalculate grade from score to guarantee A1-F9 format
  const withGrades = scores.map(s => ({ ...s, grade: beceGrade(parseFloat(s.score)||0) }));
  const coreScores = withGrades.filter(s => CORE.includes(s.subject));
  const electiveScores = withGrades.filter(s => !CORE.includes(s.subject));
  const best4Core = [...coreScores].sort((a,b) => gradePoints(a.grade)-gradePoints(b.grade)).slice(0,4);
  const best2Elective = [...electiveScores].sort((a,b) => gradePoints(a.grade)-gradePoints(b.grade)).slice(0,2);
  const used = [...best4Core, ...best2Elective];
  const aggregate = used.reduce((sum, s) => sum + gradePoints(s.grade), 0);
  return { aggregate, best4Core, best2Elective };
}

// Ensure mock_number column exists
try {
  const cols = query("PRAGMA table_info(mock_exam)");
  const hasMockNumber = cols.some(c => c.name === 'mock_number');
  if (!hasMockNumber) {
    run("ALTER TABLE mock_exam ADD COLUMN mock_number INTEGER DEFAULT 1");
  }
} catch(e) { console.log('mock_number column check:', e.message); }

exports.getStudentResults = (req, res) => {
  try {
    const { student_id } = req.params;
    const mock_number = parseInt(req.query.mock_number) || 1;
    const scores = query("SELECT * FROM mock_exam WHERE student_id=? AND (mock_number=? OR mock_number IS NULL) ORDER BY subject", [student_id, mock_number]);
    // Always recalculate grade from score to ensure A1-F9 format (fixes legacy numeric grades)
    const withGrades = scores.map(s => ({ ...s, grade: beceGrade(parseFloat(s.score)||0) }));
    if (!withGrades.length) return res.json({ scores: [], aggregate: null, best4Core: [], best2Elective: [] });
    const { aggregate, best4Core, best2Elective } = calcAggregate(withGrades);
    res.json({ scores: withGrades, aggregate, best4Core, best2Elective });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.getClassResults = (req, res) => {
  try {
    const mock_number = parseInt(req.query.mock_number) || 1;
    const students = query("SELECT * FROM students WHERE class='Basic 9' AND status='active' ORDER BY full_name");
    const results = students.map(st => {
      const rawScores = query("SELECT * FROM mock_exam WHERE student_id=? AND (mock_number=? OR mock_number IS NULL)", [st.id, mock_number]);
      const scores = rawScores.map(s => ({ ...s, grade: beceGrade(parseFloat(s.score)||0) }));
      if (!scores.length) return { ...st, aggregate: null, best4Core: [], best2Elective: [], scores: [] };
      const { aggregate, best4Core, best2Elective } = calcAggregate(scores);
      return { ...st, aggregate, best4Core, best2Elective, scores };
    }).sort((a,b) => (a.aggregate??999)-(b.aggregate??999));
    results.forEach((r,i) => { r.position = i+1; });
    res.json(results);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.saveScores = (req, res) => {
  try {
    const { scores, mock_number } = req.body;
    const mn = parseInt(mock_number) || 1;
    for (const s of (scores||[])) {
      if (MOCK_SUBJECTS.indexOf(s.subject) === -1) continue; // skip History and unknown subjects
      const grade = beceGrade(parseFloat(s.score)||0);
      const stype = CORE.includes(s.subject) ? 'core' : 'elective';
      const existing = get("SELECT id FROM mock_exam WHERE student_id=? AND subject=? AND mock_number=?", [s.student_id, s.subject, mn]);
      if (existing) run("UPDATE mock_exam SET score=?,grade=?,subject_type=? WHERE id=?", [s.score, grade, stype, existing.id]);
      else run("INSERT INTO mock_exam (student_id,subject,class,score,grade,subject_type,mock_number) VALUES (?,?,?,?,?,?,?)",
        [s.student_id, s.subject, 'Basic 9', s.score, grade, stype, mn]);
    }
    res.json({ message: 'Scores saved' });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.deleteStudentScores = (req, res) => {
  try {
    const mock_number = parseInt(req.query.mock_number) || 1;
    run("DELETE FROM mock_exam WHERE student_id=? AND (mock_number=? OR mock_number IS NULL)", [req.params.student_id, mock_number]);
    res.json({ message: 'Deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.getMockList = (req, res) => {
  try {
    const rows = query("SELECT DISTINCT mock_number FROM mock_exam ORDER BY mock_number");
    res.json(rows.map(r => r.mock_number || 1));
  } catch (e) { res.json([1]); }
};
