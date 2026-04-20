const path = require('path');
const fs = require('fs');
const { query, run, get } = require('../database');

const UPLOAD_DIR = path.join(__dirname, '../uploads/syllabus');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

exports.list = async (req, res) => {
  try {
    const { subject, class: cls } = req.query;
    let sql = "SELECT * FROM syllabus WHERE 1=1";
    const params = [];
    if (subject) { sql += " AND subject=?"; params.push(subject); }
    if (cls) { sql += " AND class=?"; params.push(cls); }
    sql += " ORDER BY uploaded_at DESC";
    res.json(await query(sql, params));
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.upload = async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const { title, subject, class: cls } = req.body;
    const file = req.file;
    if (!file || !title) return res.status(400).json({ error: 'Title and file required' });
    const u = await get("SELECT full_name FROM users WHERE id=?", [req.user.id]);
    await run("INSERT INTO syllabus (title,subject,class,filename,filepath,filesize,mimetype,uploaded_by,uploader_name) VALUES (?,?,?,?,?,?,?,?,?)",
      [title, subject||'', cls||'', file.originalname, file.filename,
       `${(file.size/1024).toFixed(1)} KB`, file.mimetype, req.user.id, u?.full_name||'Admin']);
    res.json({ message: 'Syllabus uploaded successfully' });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.download = async (req, res) => {
  try {
    const s = await get("SELECT * FROM syllabus WHERE id=?", [req.params.id]);
    if (!s) return res.status(404).json({ error: 'Not found' });
    const filePath = path.join(UPLOAD_DIR, s.filepath);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not on server' });
    res.download(filePath, s.filename);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.delete = async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const s = await get("SELECT * FROM syllabus WHERE id=?", [req.params.id]);
    if (!s) return res.status(404).json({ error: 'Not found' });
    const filePath = path.join(UPLOAD_DIR, s.filepath);
    if (fs.existsSync(filePath)) { try { fs.unlinkSync(filePath); } catch(e2) {} }
    await run("DELETE FROM syllabus WHERE id=?", [req.params.id]);
    res.json({ message: 'Syllabus deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
};