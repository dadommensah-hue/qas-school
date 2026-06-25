require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');

const app = express();

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'public', 'uploads');
const syllabusDir = path.join(__dirname, 'public', 'uploads', 'syllabus');
const photosDir = path.join(__dirname, 'public', 'uploads', 'photos');
[uploadsDir, syllabusDir, photosDir].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(compression());
app.use(cors({ origin: '*', methods: ['GET','POST','PUT','DELETE','PATCH'], allowedHeaders: ['Content-Type','Authorization'] }));
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));
app.use(morgan('dev'));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api', require('./routes/index'));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', school: 'Queen of Apostles Boarding School', version: '3.0.0', time: new Date().toISOString() });
});

app.get(/^(?!\/api).*$/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
});

module.exports = app;
