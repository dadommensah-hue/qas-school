const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');
const { query, run, get } = require('../database');
const { gradeFromScore, remarkFromGrade } = require('../helpers');

const SCHOOL_NAME = 'QUEEN OF APOSTLES BOARDING SCHOOL';
const SCHOOL_ADDRESS = 'P.O. Box 5, Elmina';
const SCHOOL_MOTTO = 'PER ARDUA AD ASTRA (THROUGH STRUGGLES TO THE STARS)';
const LOGO_PATH = path.join(__dirname, '../public/logo.png');

function drawReportHeader(doc, termLabel) {
  const hasLogo = fs.existsSync(LOGO_PATH);
  const pageW = doc.page.width;
  const margin = 50;
  let curY = doc.y;

  // Logo ABOVE school name
  if (hasLogo) {
    try {
      const logoSize = 80;
      const logoX = (pageW - logoSize) / 2;
      doc.image(LOGO_PATH, logoX, curY, { width: logoSize, height: logoSize });
      curY += logoSize + 6;
    } catch(e) {}
  }

  // School name - bold, large
  doc.fontSize(17).font('Helvetica-Bold').fillColor('#1e3a5f')
    .text(SCHOOL_NAME, margin, curY, { width: pageW - margin*2, align: 'center' });
  curY += 22;

  // Address - bold, bigger
  doc.fontSize(12).font('Helvetica-Bold').fillColor('#374151')
    .text(SCHOOL_ADDRESS, margin, curY, { width: pageW - margin*2, align: 'center' });
  curY += 16;

  // Motto - bold, blue
  doc.fontSize(10).font('Helvetica-Bold').fillColor('#1d4ed8')
    .text(SCHOOL_MOTTO, margin, curY, { align: 'center', width: pageW - margin*2 });
  curY += 14;

  doc.moveTo(margin, curY).lineTo(pageW - margin, curY).strokeColor('#1e3a5f').lineWidth(2).stroke();
  curY += 6;
  doc.fontSize(13).font('Helvetica-Bold').fillColor('#1e3a5f')
    .text(`STUDENT REPORT CARD – ${termLabel}`, margin, curY, { width: pageW - margin*2, align: 'center' });
  curY += 18;
  doc.moveTo(margin, curY).lineTo(pageW - margin, curY).strokeColor('#e5e7eb').lineWidth(1).stroke();
  curY += 10;
  doc.y = curY;
}

function gradeColor(grade) {
  const colors = { A:'#16a34a', B:'#2563eb', C:'#d97706', D:'#ea580c', F:'#dc2626' };
  return colors[grade] || '#374151';
}

exports.studentReport = async (req, res) => {
  try {
    const { id } = req.params;
    const { term, academic_year, next_term_begins, promoted_to } = req.query;
    const termLabel = term || 'Term 1';
    const student = await get("SELECT * FROM students WHERE id=?", [id]);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    // Get grades and class-wide data for position
    let grades = await query("SELECT * FROM grades WHERE student_id=? AND term=? ORDER BY subject", [id, termLabel]);
    // Include History for Basic 1-8
    if (student.class !== 'Basic 9') {
      // keep all subjects including History
    }
    const att = await get("SELECT COUNT(*) as total, COUNT(CASE WHEN status='present' THEN 1 END) as present FROM attendance WHERE student_id=? AND term=?", [id, termLabel]);

    // Total enrollment in class
    const enrollRow = await get("SELECT COUNT(*) as count FROM students WHERE class=? AND status='active'", [student.class]);
    const totalEnrollment = parseInt(String(enrollRow?.count||0));

    // Position in class
    const classStudents = await query(`SELECT s.id, AVG(g.class_score+g.exam_score) as avg_score
      FROM students s JOIN grades g ON s.id=g.student_id
      WHERE s.class=? AND g.term=? AND s.status='active' GROUP BY s.id ORDER BY avg_score DESC`,
      [student.class, termLabel]);
    const pos = Array.isArray(classStudents) ? classStudents.findIndex(s => String(s.id) === String(id)) : -1;
    const position = pos >= 0 ? pos + 1 : '—';

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="report_${student.student_id}_${termLabel.replace(' ','_')}.pdf"`);
    doc.pipe(res);

    drawReportHeader(doc, termLabel);

    // Student info box - with photo
    const infoTop = doc.y;
    const infoH = 100;
    const photoW = 72;
    doc.rect(50, infoTop, 495, infoH).fillAndStroke('#f0f9ff', '#bfdbfe');
    const iy = infoTop + 10;
    // Draw student photo or placeholder
    let photoDrawn = false;
    if (student.profile_photo) {
      try {
        const photoData = student.profile_photo.startsWith('data:')
          ? Buffer.from(student.profile_photo.split(',')[1], 'base64')
          : student.profile_photo;
        doc.image(photoData, 472, infoTop+5, { width: photoW-4, height: infoH-10, fit:[photoW-4,infoH-10] });
        photoDrawn = true;
      } catch(pe) {}
    }
    if (!photoDrawn) {
      doc.rect(472, infoTop+5, photoW-4, infoH-10).fillAndStroke('#dbeafe','#93c5fd');
      doc.fillColor('#93c5fd').fontSize(7).font('Helvetica').text('PHOTO', 472, infoTop+46, {width:photoW-4,align:'center'});
    }
    doc.fillColor('#1e40af').fontSize(10).font('Helvetica-Bold')
      .text(`Name: ${student.full_name}`, 60, iy, {width:380})
      .text(`Class: ${student.class}`, 60, iy+16, {width:380})
      .text(`Student ID: ${student.student_id}`, 60, iy+32, {width:380})
      .text(`Type: ${(student.student_type||'Day').charAt(0).toUpperCase()+(student.student_type||'day').slice(1)}`, 60, iy+48, {width:180})
      .text(`Gender: ${student.gender||'N/A'}`, 300, iy, {width:160})
      .text(`Term: ${termLabel}`, 300, iy+16, {width:160})
      .text(`Total Enrollment: ${totalEnrollment}`, 300, iy+32, {width:160})
      .text(`Position in Class: ${position} of ${totalEnrollment}`, 60, iy+64, {width:380});
    doc.moveDown(6.5);

    // Grades table
    doc.fillColor('#374151').fontSize(11).font('Helvetica-Bold').text('Academic Performance');
    doc.moveDown(0.3);

    const tableTop = doc.y;
    const cols = [50, 215, 295, 370, 430, 480];
    const headers = ['Subject', 'Class Score (50)', 'Exam Score (50)', 'Total (100)', 'Grade', 'Remark'];

    doc.rect(50, tableTop, 495, 20).fill('#1e3a5f');
    doc.fillColor('#ffffff').fontSize(8.5).font('Helvetica-Bold');
    headers.forEach((h, i) => doc.text(h, cols[i]+3, tableTop+5, { width: (cols[i+1]||545)-cols[i]-5 }));

    let rowY = tableTop + 20;
    let totalScore = 0;

    grades.forEach((g, idx) => {
      if (g.subject === 'History' && student.class === 'Basic 9') return; // History only excluded for Basic 9
      const total = parseFloat(g.class_score||0) + parseFloat(g.exam_score||0);
      totalScore += total;
      const bg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
      doc.rect(50, rowY, 495, 18).fill(bg);
      doc.fillColor('#374151').fontSize(8.5).font('Helvetica');
      doc.text(g.subject, cols[0]+3, rowY+4, { width: cols[1]-cols[0]-5 });
      doc.text(parseFloat(g.class_score||0).toFixed(1), cols[1]+3, rowY+4);
      doc.text(parseFloat(g.exam_score||0).toFixed(1), cols[2]+3, rowY+4);
      doc.text(total.toFixed(1), cols[3]+3, rowY+4);
      doc.fillColor(gradeColor(g.grade)).font('Helvetica-Bold').text(g.grade||'—', cols[4]+3, rowY+4);
      doc.fillColor('#374151').font('Helvetica').text(g.remarks || remarkFromGrade(g.grade), cols[5]-5, rowY+4, { width: 60 });
      rowY += 18;
    });

    const avg = grades.length ? (totalScore / grades.length).toFixed(1) : 0;
    const overallGrade = gradeFromScore(parseFloat(avg));
    doc.rect(50, rowY, 495, 20).fill('#dbeafe');
    doc.fillColor('#1e40af').fontSize(9).font('Helvetica-Bold')
      .text('AVERAGE / OVERALL', cols[0]+3, rowY+5)
      .text(avg, cols[3]+3, rowY+5)
      .text(overallGrade, cols[4]+3, rowY+5);

    rowY += 28;

    // Attendance
    const attPct = att.total ? ((att.present/att.total)*100).toFixed(0) : 0;
    doc.fillColor('#374151').fontSize(10).font('Helvetica-Bold').text('Attendance Summary', 50, rowY);
    rowY += 15;
    doc.rect(50, rowY, 495, 30).fill('#f0fdf4');
    doc.fillColor('#374151').fontSize(9).font('Helvetica')
      .text(`Days Present: ${att.present}`, 60, rowY+10)
      .text(`Days Absent: ${att.total - att.present}`, 190, rowY+10)
      .text(`Total Days: ${att.total}`, 310, rowY+10)
      .text(`Rate: ${attPct}%`, 420, rowY+10);

    rowY += 44;

    // Conduct & Remarks section - load from DB
    const conductData = await get("SELECT * FROM report_conduct WHERE student_id=? AND term=? AND academic_year=? AND exam_type='end_of_term'",
      [id, termLabel, academic_year || '2024/2025']);

    // Promoted to / Next term - also check DB
    const dbPromotedTo = conductData?.promoted_to || promoted_to;
    if (dbPromotedTo || next_term_begins) {
      doc.rect(50, rowY, 495, 36).fillAndStroke('#fffbeb', '#fde68a');
      doc.fillColor('#92400e').fontSize(9.5).font('Helvetica-Bold');
      if (dbPromotedTo) doc.text(`PROMOTED TO: ${dbPromotedTo}`, 60, rowY + 8);
      if (next_term_begins) doc.text(`NEXT TERM BEGINS: ${next_term_begins}`, dbPromotedTo ? 270 : 60, rowY + 8);
      rowY += 50;
    }

    rowY += 8;
    doc.fillColor('#1e3a5f').fontSize(10).font('Helvetica-Bold').text('CONDUCT & REMARKS', 50, rowY);
    rowY += 14;
    doc.rect(50, rowY, 495, 72).fillAndStroke('#f8fafc', '#e2e8f0');
    const conductItems = [
      { label: 'CONDUCT', value: conductData?.conduct || '' },
      { label: 'INTEREST', value: conductData?.interest || '' },
      { label: 'ATTITUDE IN CLASS', value: conductData?.attitude || '' },
      { label: "CLASS TEACHER'S REMARK", value: conductData?.teacher_remark || '' }
    ];
    const cRows = [[0,1],[2,3]];
    cRows.forEach((pair, ri) => {
      pair.forEach((ci, col) => {
        const item = conductItems[ci];
        const x = col === 0 ? 58 : 310;
        const y = rowY + 10 + ri * 30;
        doc.fillColor('#6b7280').fontSize(8).font('Helvetica-Bold').text(item.label + ':', x, y);
        if (item.value) {
          doc.fillColor('#374151').fontSize(8).font('Helvetica').text(item.value, x + 10, y + 14, { width: 210 });
        } else {
          doc.moveTo(x + 10, y + 14).lineTo(x + 220, y + 14).strokeColor('#94a3b8').lineWidth(0.5).stroke();
        }
      });
    });

    rowY += 85;
    doc.fillColor('#374151').fontSize(10).font('Helvetica-Bold')
      .text(`Generated: ${new Date().toLocaleDateString('en-GH',{day:'numeric',month:'long',year:'numeric'})} | ${SCHOOL_NAME}`, 50, rowY, { align: 'center', width: 495 });

    doc.end();
  } catch (e) {
    if (!res.headersSent) res.status(500).json({ error: e.message });
  }
};

// Mock Exam Report (B.E.C.E style)
const CORE = ['English Language','Mathematics','Integrated Science','Social Studies'];

function beceGrade(score) {
  if (score >= 80) return '1'; if (score >= 75) return '2'; if (score >= 70) return '3';
  if (score >= 65) return '4'; if (score >= 60) return '5'; if (score >= 55) return '6';
  if (score >= 50) return '7'; if (score >= 45) return '8'; return '9';
}

function gradePoints(g) { const n = parseInt(g); return (n>=1&&n<=9)?n:({A1:1,B2:2,B3:3,C4:4,C5:5,C6:6,D7:7,E8:8,F9:9}[g]||9); }

const SUBJECT_ABBR = {
  'Career Technology':'C.Tech','Computing':'Computing','Creative Arts and Design':'C.Arts',
  'English Language':'English','French':'French','Ghanaian Language':'Fante',
  'Integrated Science':'Science','Mathematics':'Maths','Religious and Moral Education':'R.M.E',
  'Social Studies':'Social'
};

exports.mockClassReport = async (req, res) => {
  try {
    const academic_year = req.query.academic_year || '2024/2025';
    const mock_number = parseInt(req.query.mock_number) || 1;
    const _rawStudents = await query("SELECT * FROM students WHERE class='Basic 9' AND status='active' ORDER BY full_name");
    const students = Array.isArray(_rawStudents) ? _rawStudents : [];

    const MOCK_SUBJECTS = ['Career Technology','Computing','Creative Arts and Design','English Language','French','Ghanaian Language','Integrated Science','Mathematics','Religious and Moral Education','Social Studies'];

    const results = await Promise.all(students.map(async st => {
      const scores = await query("SELECT * FROM mock_exam WHERE student_id=? AND (mock_number=? OR mock_number IS NULL)", [st.id, mock_number]);
      const scoresWithGrades = scores.map(s => ({ ...s, grade: beceGrade(s.score||0) }));
      const core = scoresWithGrades.filter(s => CORE.includes(s.subject)).sort((a,b)=>gradePoints(a.grade)-gradePoints(b.grade)).slice(0,4);
      const elec = scoresWithGrades.filter(s => !CORE.includes(s.subject)).sort((a,b)=>gradePoints(a.grade)-gradePoints(b.grade)).slice(0,2);
      const agg = [...core,...elec].reduce((s,x)=>s+gradePoints(x.grade),0);
      return { ...st, scores: scoresWithGrades, aggregate: agg, best4Core: core, best2Elective: elec };
    }));
    results.sort((a,b)=>(a.aggregate??99)-(b.aggregate??99));
    results.forEach((r,i)=>{ r.position=i+1; });

    const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="mock${mock_number}_exam_report_basic9.pdf"`);
    doc.pipe(res);

    // ── HEADER: Logo above school name ──
    const hasLogo = fs.existsSync(LOGO_PATH);
    const pageW = doc.page.width;
    let headerY = 20;
    if (hasLogo) {
      try {
        const logoSize = 70;
        const lx = (pageW - logoSize) / 2;
        doc.image(LOGO_PATH, lx, headerY, { width: logoSize, height: logoSize });
        headerY += logoSize + 6;
      } catch(e) {}
    }
    doc.fontSize(17).font('Helvetica-Bold').fillColor('#1e3a5f')
       .text(SCHOOL_NAME, 30, headerY, { align: 'center', width: pageW-60 });
    headerY += 22;
    doc.fontSize(12).font('Helvetica-Bold').fillColor('#374151')
       .text(SCHOOL_ADDRESS, 30, headerY, { align: 'center', width: pageW-60 });
    headerY += 16;
    doc.moveTo(30, headerY).lineTo(pageW-30, headerY).lineWidth(1).stroke('#1e3a5f');
    headerY += 6;
    doc.fontSize(13).font('Helvetica-Bold').fillColor('#1e3a5f')
       .text(`MOCK ${mock_number} EXAMINATION RESULTS – BASIC 9`, 30, headerY, { align: 'center', width: pageW-60 });
    headerY += 18;
    doc.moveTo(30, headerY).lineTo(pageW-30, headerY).lineWidth(0.5).stroke('#9ca3af');
    headerY += 6;
    // Bold grading key
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#374151')
       .text('Grading: 1(80-100), 2(75-79), 3(70-74), 4(65-69), 5(60-64), 6(55-59), 7(50-54), 8(45-49), 9(0-44)  |  Aggregate = Best 4 Core + Best 2 Elective (lower = better)',
             30, headerY, { align: 'center', width: pageW-60 });
    headerY += 14;

    // ── TABLE LAYOUT ──
    const colStart = 30;
    const idW = 20;
    const nameW = 150;   // wider for long names
    const markW = 30;
    const gradeW = 22;
    const subjW = markW + gradeW;   // 52 per subject
    const aggW = 36;
    const subjectsStart = colStart + idW + nameW;
    const tableW = idW + nameW + MOCK_SUBJECTS.length*subjW + aggW;
    const tableY = headerY;

    // ── TABLE HEADER ──
    const headH = 28;
    doc.rect(colStart, tableY, tableW, headH).fill('#1e3a5f');
    // # col
    doc.fillColor('#fff').fontSize(9).font('Helvetica-Bold')
       .text('#', colStart+2, tableY+10, { width: idW-2, align:'center' });
    // Student Name header
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#fff')
       .text('Student Name', colStart+idW+2, tableY+10, { width: nameW-2 });
    // Subject headers
    MOCK_SUBJECTS.forEach((subj, i) => {
      const x = subjectsStart + i*subjW;
      const label = SUBJECT_ABBR[subj] || subj.split(' ')[0];
      doc.fillColor('#fff').fontSize(8).font('Helvetica-Bold')
         .text(label, x, tableY+2, { width: subjW-2, align: 'center' });
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#fff')
         .text('Mark', x, tableY+17, { width: markW-1, align: 'center' });
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#fff')
         .text('Gr', x+markW, tableY+17, { width: gradeW-1, align: 'center' });
    });
    // Agg header
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#fff')
       .text('Agg', subjectsStart + MOCK_SUBJECTS.length*subjW, tableY+10, { width: aggW-2, align: 'center' });

    // ── TABLE ROWS ──
    function aggColor(agg) {
      if (agg >= 6  && agg <= 15) return '#15803d';  // green
      if (agg >= 16 && agg <= 24) return '#b45309';  // amber/yellow
      if (agg >= 25 && agg <= 29) return '#c2410c';  // orange
      return '#dc2626';                                // red (30-54)
    }

    const rowH = 20;
    let ry = tableY + headH;
    let pageNum = 1;

    results.forEach((r, ri) => {
      // New page if needed
      if (ry + rowH > doc.page.height - 30) {
        doc.addPage({ layout:'landscape', margin:30 });
        ry = 30;
        pageNum++;
        // Repeat header on new page
        doc.rect(colStart, ry, tableW, headH).fill('#1e3a5f');
        doc.fillColor('#fff').fontSize(9).font('Helvetica-Bold')
           .text('#', colStart+2, ry+10, { width: idW-2, align:'center' });
        doc.text('Student Name', colStart+idW+2, ry+10, { width: nameW-2 });
        MOCK_SUBJECTS.forEach((subj, i) => {
          const x = subjectsStart + i*subjW;
          const label = SUBJECT_ABBR[subj] || subj.split(' ')[0];
          doc.fillColor('#fff').fontSize(8).font('Helvetica-Bold')
             .text(label, x, ry+2, { width: subjW-2, align: 'center' });
          doc.fontSize(8).font('Helvetica-Bold').fillColor('#fff')
             .text('Mark', x, ry+17, { width: markW-1, align: 'center' });
          doc.fontSize(8).font('Helvetica-Bold').fillColor('#fff')
             .text('Gr', x+markW, ry+17, { width: gradeW-1, align: 'center' });
        });
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#fff')
           .text('Agg', subjectsStart + MOCK_SUBJECTS.length*subjW, ry+10, { width: aggW-2, align: 'center' });
        ry += headH;
      }

      const bg = ri%2===0 ? '#ffffff' : '#f0f4f8';
      doc.rect(colStart, ry, tableW, rowH).fill(bg);

      // Row border
      doc.moveTo(colStart, ry+rowH).lineTo(colStart+tableW, ry+rowH).lineWidth(0.3).stroke('#d1d5db');

      // Position number
      doc.fillColor('#374151').fontSize(11).font('Helvetica-Bold')
         .text(String(r.position), colStart+2, ry+5, { width: idW-2, align:'center' });

      // Student name - bold, dark blue, fits in wider column
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#1e3a5f')
         .text(r.full_name, colStart+idW+3, ry+5, { width: nameW-4, lineBreak: false, ellipsis: false });

      // Subject scores
      MOCK_SUBJECTS.forEach((subj, si) => {
        const x = subjectsStart + si*subjW;
        const sc = r.scores.find(s => s.subject===subj);
        const markVal = sc ? String(sc.score||0) : '—';
        const gradeVal = sc ? String(sc.grade||beceGrade(sc.score||0)) : '—';
        const isUsed = r.best4Core?.some(c=>c.subject===subj) || r.best2Elective?.some(c=>c.subject===subj);
        // Mark in blue
        doc.fillColor('#2563eb').font(isUsed?'Helvetica-Bold':'Helvetica').fontSize(11)
           .text(markVal, x, ry+5, { width: markW-1, align:'center' });
        // Grade in red
        doc.fillColor('#dc2626').font('Helvetica-Bold').fontSize(11)
           .text(gradeVal, x+markW, ry+5, { width: gradeW-1, align:'center' });
      });

      // Aggregate with colour coding
      const aggNum = r.aggregate ?? null;
      const aggText = aggNum !== null ? String(aggNum) : '—';
      const aggCol = aggNum !== null ? aggColor(aggNum) : '#6b7280';
      doc.fillColor(aggCol).font('Helvetica-Bold').fontSize(12)
         .text(aggText, subjectsStart + MOCK_SUBJECTS.length*subjW, ry+5, { width: aggW-2, align:'center' });

      ry += rowH;
    });

    // Footer
    doc.fillColor('#374151').fontSize(10).font('Helvetica-Bold')
      .text(`Generated: ${new Date().toLocaleDateString('en-GH',{day:'numeric',month:'long',year:'numeric'})} | ${SCHOOL_NAME}`,
            30, ry+8, { align: 'center', width: pageW-60 });

    doc.end();
  } catch (e) {
    if (!res.headersSent) res.status(500).json({ error: e.message });
  }
};

exports.classReport = async (req, res) => {
  try {
    const { class: cls } = req.params;
    const { term } = req.query;
    const termLabel = term || 'Term 1';
    const students = query("SELECT * FROM students WHERE class=? AND status='active' ORDER BY full_name", [cls]);
    const SUBJECTS = ['Career Technology','Computing','Creative Arts and Design','English Language','French','Ghanaian Language','Integrated Science','Mathematics','Religious and Moral Education','Social Studies'];

    const doc = new PDFDocument({ margin: 50, size: 'A4', layout: 'landscape' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="class_report_${cls.replace(' ','_')}.pdf"`);
    doc.pipe(res);

    doc.fontSize(13).font('Helvetica-Bold').fillColor('#1e3a5f').text(SCHOOL_NAME, { align: 'center' });
    doc.fontSize(8).font('Helvetica').fillColor('#374151').text(SCHOOL_ADDRESS, { align: 'center' });
    doc.moveDown(0.3);
    doc.moveTo(50, doc.y).lineTo(790, doc.y).stroke('#1e3a5f');
    doc.moveDown(0.3);
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#1e3a5f')
      .text(`CLASS PERFORMANCE REPORT – ${cls} | ${termLabel}`, { align: 'center' });
    doc.moveDown(0.5);

    const colW = 55;
    const hY = doc.y;
    doc.rect(50, hY, 740, 18).fill('#1e3a5f');
    doc.fillColor('#fff').fontSize(7.5).font('Helvetica-Bold');
    doc.text('Student', 52, hY+4, { width: 120 });
    SUBJECTS.forEach((s,i) => doc.text(s.split(' ')[0].substring(0,7), 175+i*colW, hY+4, { width: colW-2 }));
    doc.text('Avg', 175+SUBJECTS.length*colW+2, hY+4);
    doc.text('Grade', 175+SUBJECTS.length*colW+32, hY+4);

    let ry = hY + 18;
    for (let idx = 0; idx < students.length; idx++) {
      const st = students[idx];
      const grades = await query("SELECT subject,class_score,exam_score,grade FROM grades WHERE student_id=? AND term=?", [st.id, termLabel]);
      const gMap = {}; (Array.isArray(grades)?grades:[]).forEach(g => { gMap[g.subject] = g; });
      doc.rect(50, ry, 740, 15).fill(idx%2===0?'#fff':'#f8fafc');
      doc.fillColor('#374151').fontSize(7.5).font('Helvetica');
      doc.text(st.full_name, 52, ry+3, { width: 120 });
      let tot = 0;
      SUBJECTS.forEach((subj, si) => {
        const g = gMap[subj];
        const t = g ? parseFloat(g.class_score||0)+parseFloat(g.exam_score||0) : 0;
        tot += t;
        doc.text(g ? t.toFixed(0) : '—', 175+si*colW, ry+3, { width: colW-2 });
      });
      const avg = (tot/SUBJECTS.length).toFixed(1);
      const gr = gradeFromScore(parseFloat(avg));
      doc.text(avg, 175+SUBJECTS.length*colW+2, ry+3);
      doc.fillColor(gradeColor(gr)).font('Helvetica-Bold').text(gr, 175+SUBJECTS.length*colW+32, ry+3);
      ry += 15;
      if (ry > 510) { doc.addPage({ layout:'landscape' }); ry = 50; }
    }

    doc.fillColor('#9ca3af').fontSize(7)
      .text(`Generated: ${new Date().toLocaleDateString('en-GH')} | ${SCHOOL_NAME}`, 50, ry+15, { align:'center', width:740 });
    doc.end();
  } catch (e) {
    if (!res.headersSent) res.status(500).json({ error: e.message });
  }
};

// Individual Basic 9 Mock Student Report PDF
exports.mockStudentReport = async (req, res) => {
  try {
    const { id } = req.params;
    const mock_number = parseInt(req.query.mock_number) || 1;
    const student = await get('SELECT * FROM students WHERE id=?', [id]);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const scores = await query('SELECT * FROM mock_exam WHERE student_id=? AND mock_number=?', [id, mock_number]);
    const scoresWithGrades = scores.map(s => ({ ...s, grade: beceGrade(parseFloat(s.score)||0) }));
    const core = scoresWithGrades.filter(s => CORE.includes(s.subject)).sort((a,b)=>gradePoints(a.grade)-gradePoints(b.grade)).slice(0,4);
    const elec = scoresWithGrades.filter(s => !CORE.includes(s.subject)).sort((a,b)=>gradePoints(a.grade)-gradePoints(b.grade)).slice(0,2);
    const agg = [...core,...elec].reduce((s,x)=>s+gradePoints(x.grade),0);
    const allSorted = [...scoresWithGrades].sort((a,b)=>a.subject.localeCompare(b.subject));
    const avg = allSorted.length ? (allSorted.reduce((t,s)=>t+(parseFloat(s.score)||0),0)/allSorted.length).toFixed(1) : '0.0';

    // Get class position
    const classResults = await query(`SELECT s.id, SUM(CASE WHEN m.subject IN ('English Language','Mathematics','Integrated Science','Social Studies') AND ranked_core.rn<=4 THEN grade_val ELSE 0 END) as agg FROM students s INNER JOIN mock_exam m ON s.id=m.student_id WHERE s.class='Basic 9' AND s.status='active' AND m.mock_number=? GROUP BY s.id ORDER BY agg ASC`, [mock_number]).catch(()=>[]);
    const posIdx = Array.isArray(classResults) ? classResults.findIndex(r=>String(r.id)===String(id)) : -1;
    const position = posIdx >= 0 ? posIdx+1 : '—';
    const totalStudents = Array.isArray(classResults) ? classResults.length : '—';

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="mock${mock_number}_${student.student_id}.pdf"`);
    doc.pipe(res);

    const pageW = doc.page.width;
    const margin = 40;
    let curY = margin;

    // Logo
    const hasLogo = fs.existsSync(LOGO_PATH);
    if (hasLogo) {
      try { doc.image(LOGO_PATH, (pageW-70)/2, curY, {width:70,height:70}); curY += 78; } catch(e){}
    }

    // School header
    doc.fontSize(16).font('Helvetica-Bold').fillColor('#1e3a5f')
      .text(SCHOOL_NAME, margin, curY, {width:pageW-margin*2, align:'center'});
    curY += 22;
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#374151')
      .text(SCHOOL_ADDRESS, margin, curY, {width:pageW-margin*2, align:'center'});
    curY += 15;
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#1d4ed8')
      .text(SCHOOL_MOTTO, margin, curY, {width:pageW-margin*2, align:'center'});
    curY += 14;
    doc.moveTo(margin, curY).lineTo(pageW-margin, curY).strokeColor('#1e3a5f').lineWidth(2).stroke();
    curY += 6;

    // Banner
    doc.rect(margin, curY, pageW-margin*2, 24).fill('#b45309');
    doc.fontSize(12).font('Helvetica-Bold').fillColor('#fff')
      .text(`MOCK ${mock_number} EXAMINATION REPORT`, margin, curY+6, {width:pageW-margin*2, align:'center'});
    curY += 32;

    // Student info box with photo
    const infoH = 96;
    const photoW = 70;
    doc.rect(margin, curY, pageW-margin*2, infoH).fillAndStroke('#f0f9ff','#bfdbfe');
    const iy = curY + 10;
    // Photo
    let photoDrawn = false;
    if (student.profile_photo) {
      try {
        const photoData = student.profile_photo.startsWith('data:')
          ? Buffer.from(student.profile_photo.split(',')[1], 'base64') : student.profile_photo;
        doc.image(photoData, pageW-margin-photoW-5, curY+5, {width:photoW-2, height:infoH-10, fit:[photoW-2,infoH-10]});
        photoDrawn = true;
      } catch(pe){}
    }
    if (!photoDrawn) {
      doc.rect(pageW-margin-photoW-5, curY+5, photoW-2, infoH-10).fillAndStroke('#dbeafe','#93c5fd');
      doc.fillColor('#93c5fd').fontSize(7).font('Helvetica').text('PHOTO', pageW-margin-photoW-5, curY+infoH/2-4, {width:photoW-2,align:'center'});
    }
    const textW = pageW - margin*2 - photoW - 20;
    doc.fillColor('#1e40af').fontSize(10).font('Helvetica-Bold')
      .text(`Name: ${student.full_name}`, margin+10, iy, {width:textW})
      .text(`Student ID: ${student.student_id}`, margin+10, iy+16, {width:textW})
      .text(`Class: ${student.class}`, margin+10, iy+32, {width:textW/2})
      .text(`Mock: ${mock_number}`, margin+textW/2, iy+32, {width:textW/2})
      .text(`BECE Aggregate: ${agg}/54`, margin+10, iy+48, {width:textW/2})
      .text(`Average: ${avg}%`, margin+textW/2, iy+48, {width:textW/2})
      .text(`Position: ${position} of ${totalStudents}`, margin+10, iy+64, {width:textW});
    curY += infoH + 12;

    // Aggregate & Best subjects
    doc.rect(margin, curY, pageW-margin*2, 50).fillAndStroke('#f8fafc','#e2e8f0');
    const aggColor = agg<=10?'#16a34a':agg<=15?'#2563eb':agg<=20?'#0891b2':agg<=29?'#d97706':'#dc2626';
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#6b7280').text('BECE Aggregate:', margin+10, curY+8);
    doc.fontSize(26).font('Helvetica-Bold').fillColor(aggColor).text(`${agg}/54`, margin+10, curY+18);
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#1e3a5f')
      .text('Best 4 Core: '+core.map(s=>s.subject.split(' ')[0]+' ('+s.score+')').join(', '), margin+90, curY+10, {width:220})
      .text('Best 2 Elective: '+elec.map(s=>s.subject.split(' ')[0]+' ('+s.score+')').join(', '), margin+90, curY+26, {width:220});
    curY += 62;

    // Subject table
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#1e3a5f').text('Subject Results', margin, curY);
    curY += 14;
    const tCols = [margin, margin+200, margin+285, margin+340, margin+380, margin+430];
    doc.rect(margin, curY, pageW-margin*2, 18).fill('#1e3a5f');
    doc.fillColor('#fff').fontSize(8.5).font('Helvetica-Bold');
    ['SUBJECT','TYPE','MARK (/100)','GRADE','REMARKS'].forEach((h,i)=>doc.text(h, tCols[i]+3, curY+4, {width:(tCols[i+1]||pageW-margin)-tCols[i]-4}));
    curY += 18;

    allSorted.forEach((s,i) => {
      const isCore = CORE.includes(s.subject);
      const used = core.some(c=>c.subject===s.subject)||elec.some(c=>c.subject===s.subject);
      const sc = parseFloat(s.score)||0;
      const scoreCol = sc>=70?'#16a34a':sc>=55?'#d97706':'#dc2626';
      const remarks = sc>=80?'Excellent':sc>=75?'Very Good':sc>=70?'Good':sc>=65?'Credit':sc>=60?'Credit':sc>=55?'Pass':sc>=50?'Pass':sc>=45?'Weak Pass':'Fail';
      doc.rect(margin, curY, pageW-margin*2, 16).fill(i%2===0?'#fff':'#f8fafc');
      doc.fillColor(used?'#1e3a5f':'#374151').fontSize(8.5).font(used?'Helvetica-Bold':'Helvetica')
        .text((used?'★ ':'')+s.subject, tCols[0]+3, curY+3, {width:tCols[1]-tCols[0]-4});
      doc.fillColor(isCore?'#1d4ed8':'#6d28d9').font('Helvetica').text(isCore?'Core':'Elective', tCols[1]+3, curY+3);
      doc.fillColor(scoreCol).font('Helvetica-Bold').text(String(s.score), tCols[2]+3, curY+3);
      doc.fillColor('#dc2626').text(beceGrade(sc), tCols[3]+3, curY+3);
      doc.fillColor('#374151').font('Helvetica').text(remarks, tCols[4]+3, curY+3);
      curY += 16;
    });

    // Average row
    doc.rect(margin, curY, pageW-margin*2, 18).fill('#dbeafe');
    doc.fillColor('#1e40af').fontSize(9).font('Helvetica-Bold')
      .text('OVERALL AVERAGE', tCols[0]+3, curY+4)
      .text(avg+'%', tCols[2]+3, curY+4);
    curY += 26;

    // Footer note
    doc.fillColor('#374151').fontSize(10).font('Helvetica-Bold')
      .text('★ Used in BECE aggregate | Grade: 1=80-100, 2=75-79, 3=70-74, 4=65-69, 5=60-64, 6=55-59, 7=50-54, 8=45-49, 9=0-44', margin, curY, {width:pageW-margin*2, align:'center'});
    curY += 18;
    doc.fillColor('#9ca3af').fontSize(8)
      .text(`Generated: ${new Date().toLocaleDateString('en-GH',{day:'numeric',month:'long',year:'numeric'})} | ${SCHOOL_NAME}`, margin, curY, {width:pageW-margin*2, align:'center'});

    doc.end();
  } catch(e) {
    if (!res.headersSent) res.status(500).json({ error: e.message });
  }
};

// Mid-Term Student Report PDF
exports.midtermStudentReport = async (req, res) => {
  try {
    const { id } = req.params;
    const { term } = req.query;
    const termLabel = term || 'Term 1';
    const student = await get('SELECT * FROM students WHERE id=?', [id]);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const grades = await query(
      'SELECT * FROM midterm_grades WHERE student_id=? AND term=? ORDER BY subject',
      [id, termLabel]
    );

    // Position in class for midterm
    const classPos = await query(
      `SELECT student_id, AVG(exam_score) as avg_score FROM midterm_grades WHERE term=? AND class=? GROUP BY student_id ORDER BY avg_score DESC`,
      [termLabel, student.class]
    ).catch(()=>[]);
    const posIdx = Array.isArray(classPos) ? classPos.findIndex(r=>String(r.student_id)===String(id)) : -1;
    const position = posIdx>=0 ? posIdx+1 : '—';
    const totalEnroll = await get('SELECT COUNT(*) as count FROM students WHERE class=? AND status=\'active\'', [student.class]);
    const totalStudents = parseInt(String(totalEnroll?.count||0));

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="midterm_${student.student_id}_${termLabel.replace(' ','_')}.pdf"`);
    doc.pipe(res);

    const pageW = doc.page.width;
    const margin = 40;
    let curY = margin;

    // Logo
    if (fs.existsSync(LOGO_PATH)) {
      try { doc.image(LOGO_PATH, (pageW-70)/2, curY, {width:70,height:70}); curY+=78; } catch(e){}
    }
    doc.fontSize(16).font('Helvetica-Bold').fillColor('#1e3a5f')
      .text(SCHOOL_NAME, margin, curY, {width:pageW-margin*2, align:'center'}); curY+=22;
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#374151')
      .text(SCHOOL_ADDRESS, margin, curY, {width:pageW-margin*2, align:'center'}); curY+=15;
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#1d4ed8')
      .text(SCHOOL_MOTTO, margin, curY, {width:pageW-margin*2, align:'center'}); curY+=14;
    doc.moveTo(margin,curY).lineTo(pageW-margin,curY).strokeColor('#1e3a5f').lineWidth(2).stroke(); curY+=6;
    doc.rect(margin,curY,pageW-margin*2,24).fill('#b45309');
    doc.fontSize(12).font('Helvetica-Bold').fillColor('#fff')
      .text(`MID-TERM EXAMINATION REPORT – ${termLabel.toUpperCase()} 2026`, margin, curY+6, {width:pageW-margin*2, align:'center'});
    curY+=32;

    // Student info with photo
    const infoH = 96;
    const photoW = 70;
    doc.rect(margin,curY,pageW-margin*2,infoH).fillAndStroke('#f0f9ff','#bfdbfe');
    const iy = curY+10;
    let photoDrawn = false;
    if (student.profile_photo) {
      try {
        const pd = student.profile_photo.startsWith('data:')
          ? Buffer.from(student.profile_photo.split(',')[1],'base64') : student.profile_photo;
        doc.image(pd, pageW-margin-photoW-5, curY+5, {width:photoW-2,height:infoH-10,fit:[photoW-2,infoH-10]});
        photoDrawn=true;
      } catch(pe){}
    }
    if (!photoDrawn) {
      doc.rect(pageW-margin-photoW-5,curY+5,photoW-2,infoH-10).fillAndStroke('#dbeafe','#93c5fd');
      doc.fillColor('#93c5fd').fontSize(7).font('Helvetica').text('PHOTO',pageW-margin-photoW-5,curY+infoH/2-4,{width:photoW-2,align:'center'});
    }
    const textW = pageW-margin*2-photoW-20;
    doc.fillColor('#1e40af').fontSize(10).font('Helvetica-Bold')
      .text(`Name: ${student.full_name}`, margin+10, iy, {width:textW})
      .text(`Class: ${student.class}`, margin+10, iy+16, {width:textW/2})
      .text(`Student ID: ${student.student_id}`, margin+textW/2, iy+16, {width:textW/2})
      .text(`Type: ${(student.student_type||'Day').charAt(0).toUpperCase()+(student.student_type||'day').slice(1)}`, margin+10, iy+32, {width:textW/2})
      .text(`Gender: ${student.gender||'N/A'}`, margin+textW/2, iy+32, {width:textW/2})
      .text(`Term: ${termLabel}`, margin+10, iy+48, {width:textW/2})
      .text(`Position: ${position} of ${totalStudents}`, margin+textW/2, iy+48, {width:textW/2});
    curY+=infoH+12;

    // Subject table
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#1e3a5f').text('Academic Performance', margin, curY); curY+=14;
    const tCols = [margin, margin+230, margin+325, margin+380, margin+430];
    doc.rect(margin,curY,pageW-margin*2,18).fill('#1e3a5f');
    doc.fillColor('#fff').fontSize(8.5).font('Helvetica-Bold');
    ['SUBJECT','EXAM SCORE (100)','GRADE','REMARKS'].forEach((h,i)=>
      doc.text(h, tCols[i]+3, curY+4, {width:(tCols[i+1]||(pageW-margin))-tCols[i]-4}));
    curY+=18;

    let totalScore=0;
    grades.forEach((g,i)=>{
      const sc = parseFloat(g.exam_score||0);
      totalScore+=sc;
      const gradeCol = g.grade==='A'?'#16a34a':g.grade==='B'?'#2563eb':g.grade==='C'?'#0891b2':g.grade==='D'?'#d97706':'#dc2626';
      doc.rect(margin,curY,pageW-margin*2,16).fill(i%2===0?'#fff':'#f8fafc');
      doc.fillColor('#374151').fontSize(8.5).font('Helvetica')
        .text(g.subject, tCols[0]+3, curY+3, {width:tCols[1]-tCols[0]-4})
        .text(sc.toFixed(1), tCols[1]+3, curY+3);
      doc.fillColor(gradeCol).font('Helvetica-Bold').text(g.grade||'—', tCols[2]+3, curY+3);
      doc.fillColor('#374151').font('Helvetica').text(g.remarks||'', tCols[3]+3, curY+3, {width:pageW-margin-tCols[3]-4});
      curY+=16;
    });

    const avg = grades.length ? (totalScore/grades.length).toFixed(1) : '0.0';
    const overallGrade = parseFloat(avg)>=80?'A':parseFloat(avg)>=70?'B':parseFloat(avg)>=60?'C':parseFloat(avg)>=50?'D':'F';
    doc.rect(margin,curY,pageW-margin*2,20).fill('#dbeafe');
    doc.fillColor('#1e40af').fontSize(9).font('Helvetica-Bold')
      .text('AVERAGE / OVERALL', tCols[0]+3, curY+5)
      .text(avg, tCols[1]+3, curY+5)
      .text(overallGrade, tCols[2]+3, curY+5);
    curY+=30;

    doc.fillColor('#374151').fontSize(10).font('Helvetica-Bold')
      .text(`Generated: ${new Date().toLocaleDateString('en-GH',{day:'numeric',month:'long',year:'numeric'})} | ${SCHOOL_NAME}`, margin, curY, {width:pageW-margin*2, align:'center'});

    doc.end();
  } catch(e) {
    if (!res.headersSent) res.status(500).json({ error: e.message });
  }
};
