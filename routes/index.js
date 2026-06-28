const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();

const auth = require('../controllers/authController');
const students = require('../controllers/studentsController');
const teachers = require('../controllers/teachersController');
const attendance = require('../controllers/attendanceController');
const grades = require('../controllers/gradesController');
const fees = require('../controllers/feesController');
const events = require('../controllers/eventsController');
const sms = require('../controllers/smsController');
const analytics = require('../controllers/analyticsController');
const reports = require('../controllers/reportsController');
const mockExam = require('../controllers/mockExamController');
const syllabus = require('../controllers/syllabusController');
const midterm = require('../controllers/midtermController');
const conduct = require('../controllers/conductController');
const { authMiddleware, adminOnly, teacherOrAdmin } = require('../middleware/auth');

// Multer for profile photos (base64 handled in-memory)
const uploadDir = path.join(__dirname, '../uploads/syllabus');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const syllabusStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}_${file.originalname.replace(/\s+/g,'_')}`)
});
const syllabusUpload = multer({ storage: syllabusStorage, limits: { fileSize: 20*1024*1024 } });

// ── AUTH ──
router.post('/auth/login', auth.login);
router.post('/auth/forgot-password', auth.forgotPassword);
router.get('/auth/me', authMiddleware, auth.me);
router.put('/auth/password', authMiddleware, auth.changePassword);
router.post('/auth/users', authMiddleware, adminOnly, auth.createUser);
router.get('/auth/users', authMiddleware, adminOnly, auth.listUsers);
router.post('/auth/admin-reset-password', authMiddleware, adminOnly, auth.adminResetPassword);

// ── STUDENTS ──
router.get('/students', authMiddleware, students.list);
router.post('/students', authMiddleware, students.create);
router.get('/students/stats', authMiddleware, students.stats);
router.get('/students/class/:class', authMiddleware, students.byClass);
router.get('/students/:id', authMiddleware, students.get);
router.put('/students/:id', authMiddleware, students.update);
router.delete('/students/:id', authMiddleware, adminOnly, students.delete);
router.put('/students/:id/reset-password', authMiddleware, adminOnly, students.resetPassword);
router.put('/students/:id/photo', authMiddleware, students.uploadPhoto);

// ── TEACHERS ──
router.get('/teachers', authMiddleware, teachers.list);
router.post('/teachers', authMiddleware, adminOnly, teachers.create);
router.get("/teachers/class-assignments", authMiddleware, teachers.getClassAssignments);
router.get("/teachers/my-classes", authMiddleware, teachers.getMyClasses);
router.delete("/teachers/class-assignment/:id", authMiddleware, adminOnly, teachers.removeClassAssignment);
router.get('/teachers/:id', authMiddleware, teachers.get);
router.put('/teachers/:id', authMiddleware, adminOnly, teachers.update);
router.delete('/teachers/:id', authMiddleware, adminOnly, teachers.delete);
router.put('/teachers/:id/subjects', authMiddleware, adminOnly, teachers.assignSubjects);
router.post('/teachers/:id/assign-class', authMiddleware, adminOnly, teachers.assignClass);
router.put('/teachers/:id/reset-password', authMiddleware, adminOnly, teachers.resetPassword);

// ── ATTENDANCE ──
router.post('/attendance', authMiddleware, attendance.mark);
router.get('/attendance/class/:class', authMiddleware, attendance.getByClass);
router.get('/attendance/summary', authMiddleware, attendance.summary);
router.get('/attendance/student/:id', authMiddleware, attendance.studentAttendance);

// ── GRADES ──
router.post('/grades', authMiddleware, grades.save);
router.get('/grades/class/:class', authMiddleware, grades.getByClass);
router.get('/grades/student/:id', authMiddleware, grades.getStudentReport);
router.get('/grades/class/:class/performance', authMiddleware, grades.classPerformance);
router.get('/grades/top-students', authMiddleware, grades.topStudents);

// ── MOCK EXAM (Basic 9 only) ──
router.get('/mock/list', authMiddleware, mockExam.getMockList);
router.get('/mock/class', authMiddleware, mockExam.getClassResults);
router.get('/mock/student/:student_id', authMiddleware, mockExam.getStudentResults);
router.post('/mock/scores', authMiddleware, mockExam.saveScores);
router.delete('/mock/student/:student_id', authMiddleware, adminOnly, mockExam.deleteStudentScores);

// ── SYLLABUS ──
router.get('/syllabus', authMiddleware, teacherOrAdmin, syllabus.list);
router.post('/syllabus', authMiddleware, adminOnly, syllabusUpload.single('file'), syllabus.upload);
router.get('/syllabus/:id/download', authMiddleware, teacherOrAdmin, syllabus.download);
router.delete('/syllabus/:id', authMiddleware, adminOnly, syllabus.delete);

// ── FEES ──
router.get('/fees', authMiddleware, fees.list);
router.post('/fees', authMiddleware, fees.create);
router.post('/fees/bulk', authMiddleware, fees.bulkCreate);
router.put('/fees/:id/payment', authMiddleware, fees.recordPayment);
router.get('/fees/summary', authMiddleware, fees.summary);

// ── EVENTS ──
router.get('/events', authMiddleware, events.list);
router.post('/events', authMiddleware, events.create);
router.put('/events/:id', authMiddleware, events.update);
router.delete('/events/:id', authMiddleware, events.delete);
router.get('/events/upcoming', authMiddleware, events.upcoming);

// ── SMS ──
router.post('/sms/class', authMiddleware, sms.sendToClass);
router.post('/sms/student', authMiddleware, sms.sendToStudent);
router.post('/sms/broadcast', authMiddleware, sms.sendAll);
router.get('/sms/logs', authMiddleware, sms.logs);

// ── ANALYTICS ──
router.get('/analytics/dashboard', authMiddleware, analytics.dashboard);
router.get('/analytics/ai-insights', authMiddleware, analytics.aiInsights);
router.get('/analytics/subjects', authMiddleware, analytics.subjectAnalysis);
router.get('/analytics/term-comparison', authMiddleware, analytics.termComparison);

// ── REPORTS ──
router.get('/reports/student/:id', authMiddleware, reports.studentReport);
router.get('/reports/class/:class', authMiddleware, reports.classReport);
router.get('/reports/mock/class', authMiddleware, reports.mockClassReport);


// ── MIDTERM GRADES (Basic 1-8) ──
router.post('/midterm/grades', authMiddleware, midterm.save);
router.get('/midterm/class/:class', authMiddleware, midterm.getByClass);
router.get('/midterm/student/:id', authMiddleware, midterm.getStudentReport);
router.get('/midterm/top-students', authMiddleware, midterm.topStudents);
router.post('/midterm/approve', authMiddleware, adminOnly, midterm.approve);

// ── CONDUCT & REMARKS ──
router.get('/conduct/student/:student_id', authMiddleware, conduct.get);
router.post('/conduct', authMiddleware, teacherOrAdmin, conduct.save);
router.get('/conduct/class/:class', authMiddleware, conduct.getByClass);

// ── GRADES APPROVAL (end-of-term) ──
router.post('/grades/approve', authMiddleware, adminOnly, (req, res) => {
  const { query: q, run: r, get: g } = require('../database');
  try {
    const { class: cls, term, academic_year } = req.body;
    const ay = academic_year || '2024/2025';
    const existing = g("SELECT id FROM approved_terms WHERE class=? AND term=? AND exam_type='end_of_term' AND academic_year=?", [cls, term, ay]);
    if (!existing) {
      r("INSERT INTO approved_terms (class, term, exam_type, academic_year, approved_by) VALUES (?,?,?,?,?)",
        [cls, term, 'end_of_term', ay, req.user?.id]);
    }
    res.json({ message: 'Report approved' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── APPROVED TERM (check which term is approved for a class) ──
router.get('/approved-term/:class', authMiddleware, async (req, res) => {
  const { query: q } = require('../database');
  try {
    const cls = req.params.class;
    const academic_year = req.query.academic_year || '2024/2025';
    const rows = await q("SELECT term, exam_type FROM approved_terms WHERE class=? AND academic_year=? ORDER BY id DESC", [cls, academic_year]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── AI PROXY ROUTE (uses Google Gemini free tier) ──
router.post('/ai/analyze', authMiddleware, async (req, res) => {
  try {
    const { prompt, max_tokens } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt required' });
    const apiKey = process.env.GEMINI_API_KEY || process.env.ANTHROPIC_API_KEY || '';
    if (!apiKey) return res.status(500).json({ error: 'No AI API key configured. Please add GEMINI_API_KEY to environment variables.' });

    // Use Gemini if key starts with AIza, otherwise use Anthropic
    if (apiKey.startsWith('AIza') || apiKey.startsWith('AQ.') || apiKey.startsWith('AI')) {
      const https = require('https');
      const model = 'gemini-1.5-flash';
      const body = JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: max_tokens || 1800, temperature: 0.7 }
      });
      const options = {
        hostname: 'generativelanguage.googleapis.com',
        path: `/v1beta/models/${model}:generateContent?key=${apiKey}`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      };
      const proxyReq = https.request(options, (proxyRes) => {
        let data = '';
        proxyRes.on('data', chunk => { data += chunk; });
        proxyRes.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) return res.status(500).json({ error: parsed.error.message });
            // Convert Gemini response to Anthropic-style format for frontend compatibility
            const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated.';
            res.json({ content: [{ type: 'text', text }] });
          } catch(e) { res.status(500).json({ error: 'Invalid AI response: ' + e.message }); }
        });
      });
      proxyReq.on('error', (e) => res.status(500).json({ error: e.message }));
      proxyReq.write(body);
      proxyReq.end();
    } else {
      // Anthropic fallback
      const https = require('https');
      const body = JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: max_tokens || 1800,
        messages: [{ role: 'user', content: prompt }]
      });
      const options = {
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
          'x-api-key': apiKey
        }
      };
      const proxyReq = https.request(options, (proxyRes) => {
        let data = '';
        proxyRes.on('data', chunk => { data += chunk; });
        proxyRes.on('end', () => {
          try { res.json(JSON.parse(data)); }
          catch(e) { res.status(500).json({ error: 'Invalid AI response' }); }
        });
      });
      proxyReq.on('error', (e) => res.status(500).json({ error: e.message }));
      proxyReq.write(body);
      proxyReq.end();
    }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
