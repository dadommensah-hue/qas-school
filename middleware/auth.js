const jwt = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET || 'qas_secret_2024';

exports.authMiddleware = (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Not authenticated' });
  try {
    req.user = jwt.verify(auth.slice(7), SECRET);
    next();
  } catch (e) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};

exports.adminOnly = (req, res, next) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
};

exports.teacherOrAdmin = (req, res, next) => {
  if (!['admin','teacher'].includes(req.user?.role)) return res.status(403).json({ error: 'Teacher or Admin access required' });
  next();
};

exports.studentOnly = (req, res, next) => {
  if (req.user?.role !== 'student') return res.status(403).json({ error: 'Student access required' });
  next();
};
