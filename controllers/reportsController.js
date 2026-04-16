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

  if (hasLogo) {
    try {
      const logoX = (pageW - 70) / 2;
      doc.image(LOGO_PATH, logoX, doc.y, { width: 70, height: 70 });
      doc.moveDown(4.5);
    } catch(e) {}
  }

  // School name centered
  doc.fontSize(16).font('Helvetica-Bold').fillColor('#1e3a5f')
    .text(SCHOOL_NAME, margin, doc.y, { width: pageW - margin*2, align: 'center' });
  doc.fontSize(10).font('Helvetica').fillColor('#374151')
    .text(SCHOOL_ADDRESS, margin, doc.y + 2, { width: pageW - margin*2, align: 'center' });
  doc.fontSize(8).font('Helvetica-Oblique').fillColor('#1d4ed8')
    .text(SCHOOL_MOTTO, margin, doc.y + 2, { align: 'center', width: pageW - margin*2 });

  doc.moveDown(0.3);
  doc.moveTo(margin, doc.y).lineTo(pageW - margin, doc.y).strokeColor('#1e3a5f').lineWidth(2).stroke();
  doc.moveDown(0.3);
  doc.fontSize(13).font('Helvetica-Bold').fillColor('#1e3a5f')
    .text(`STUDENT REPORT CARD – ${termLabel}`, { align: 'center' });
  doc.moveDown(0.3);
  doc.moveTo(margin, doc.y).lineTo(pageW - margin, doc.y).strokeColor('#e5e7eb').lineWidth(1).stroke();
  doc.moveDown(0.5);
}

function gradeColor(grade) {
  const colors = { A:'#16a34a', B:'#2563eb', C:'#d97706', D:'#ea580c', F:'#dc2626' };
  return colors[grade] || '#374151';
}

exports.studentReport = (req, res) => {
  try {
    const { id } = req.params;
    const { term, academic_year, next_term_begins, promoted_to } = req.query;
    const termLabel = term || 'Term 1';
    const student = get("SELECT * FROM students WHERE id=?", [id]);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    // Get grades and class-wide data for position
    const grades = query("SELECT * FROM grades WHERE student_id=? AND term=? ORDER BY subject", [id, termLabel]);
    const att = get("SELECT COUNT(*) as total, COUNT(CASE WHEN status='present' THEN 1 END) as present FROM attendance WHERE student_id=? AND term=?", [id, termLabel]);

    // Total enrollment in class
    const totalEnrollment = get("SELECT COUNT(*) as count FROM students WHERE class=? AND status='active'", [student.class]).count;

    // Position in class: compute avg for each student in class for this term
    const classStudents = query(`SELECT s.id, AVG(g.class_score+g.exam_score) as avg_score
      FROM students s JOIN grades g ON s.id=g.student_id
      WHERE s.class=? AND g.term=? AND s.status='active' GROUP BY s.id ORDER BY avg_score DESC`,
      [student.class, termLabel]);
    const pos = classStudents.findIndex(s => s.id == id);
    const position = pos >= 0 ? pos + 1 : '—';

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="report_${student.student_id}_${termLabel.replace(' ','_')}.pdf"`);
    doc.pipe(res);

    drawReportHeader(doc, termLabel);

    // Student info box
    const infoTop = doc.y;
    doc.rect(50, infoTop, 495, 88).fillAndStroke('#f0f9ff', '#bfdbfe');
    const iy = infoTop + 8;
    doc.fillColor('#1e40af').fontSize(10).font('Helvetica-Bold')
      .text(`Name: ${student.full_name}`, 60, iy)
      .text(`Class: ${student.class}`, 60, iy + 16)
      .text(`Student ID: ${student.student_id}`, 60, iy + 32)
      .text(`Type: ${(student.student_type||'Day').charAt(0).toUpperCase()+(student.student_type||'day').slice(1)}`, 60, iy + 48)
      .text(`Gender: ${student.gender || 'N/A'}`, 300, iy)
      .text(`Academic Year: ${academic_year || '2024/2025'}`, 300, iy + 16)
      .text(`Term: ${termLabel}`, 300, iy + 32)
      .text(`Total Enrollment: ${totalEnrollment}`, 300, iy + 48)
      .text(`Position in Class: ${position} of ${totalEnrollment}`, 60, iy + 64);
    doc.moveDown(5.5);

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
      if (g.subject === 'History') return; // Remove History
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
    const conductData = get("SELECT * FROM report_conduct WHERE student_id=? AND term=? AND academic_year=? AND exam_type='end_of_term'",
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
    doc.fillColor('#9ca3af').fontSize(7.5)
      .text(`Generated: ${new Date().toLocaleDateString('en-GH',{day:'numeric',month:'long',year:'numeric'})} | ${SCHOOL_NAME}`, 50, rowY, { align: 'center', width: 495 });

    doc.end();
  } catch (e) {
    if (!res.headersSent) res.status(500).json({ error: e.message });
  }
};

// Mock Exam Report (B.E.C.E style)
const CORE = ['English Language','Mathematics','Integrated Science','Social Studies'];

function beceGrade(score) {
  if (score >= 80) return 'A1'; if (score >= 75) return 'B2'; if (score >= 70) return 'B3';
  if (score >= 65) return 'C4'; if (score >= 60) return 'C5'; if (score >= 55) return 'C6';
  if (score >= 50) return 'D7'; if (score >= 45) return 'E8'; return 'F9';
}

function gradePoints(g) { return { A1:1,B2:2,B3:3,C4:4,C5:5,C6:6,D7:7,E8:8,F9:9 }[g]||9; }

exports.mockClassReport = (req, res) => {
  try {
    const academic_year = req.query.academic_year || '2024/2025';
    const mock_number = parseInt(req.query.mock_number) || 1;
    const students = query("SELECT * FROM students WHERE class='Basic 9' AND status='active' ORDER BY full_name");

    const MOCK_SUBJECTS = ['Career Technology','Computing','Creative Arts and Design','English Language','French','Ghanaian Language','Integrated Science','Mathematics','Religious and Moral Education','Social Studies'];

    const results = students.map(st => {
      const scores = query("SELECT * FROM mock_exam WHERE student_id=? AND (mock_number=? OR mock_number IS NULL)", [st.id, mock_number]);
      const scoresWithGrades = scores.map(s => ({ ...s, grade: beceGrade(s.score||0) }));
      const core = scoresWithGrades.filter(s => CORE.includes(s.subject)).sort((a,b)=>gradePoints(a.grade)-gradePoints(b.grade)).slice(0,4);
      const elec = scoresWithGrades.filter(s => !CORE.includes(s.subject)).sort((a,b)=>gradePoints(a.grade)-gradePoints(b.grade)).slice(0,2);
      const agg = [...core,...elec].reduce((s,x)=>s+gradePoints(x.grade),0);
      return { ...st, scores: scoresWithGrades, aggregate: agg, best4Core: core, best2Elective: elec };
    }).sort((a,b)=>(a.aggregate??99)-(b.aggregate??99));
    results.forEach((r,i)=>{ r.position=i+1; });

    const doc = new PDFDocument({ margin: 50, size: 'A4', layout: 'landscape' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="mock${mock_number}_exam_report_basic9.pdf"`);
    doc.pipe(res);

    // Header with logo centered above school name
    const hasLogo = fs.existsSync(LOGO_PATH);
    if (hasLogo) {
      try {
        const lx = (doc.page.width - 70) / 2;
        doc.image(LOGO_PATH, lx, doc.y, { width: 70, height: 70 });
        doc.moveDown(4.5);
      } catch(e) {}
    }
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#1e3a5f').text(SCHOOL_NAME, { align: 'center' });
    doc.fontSize(9).font('Helvetica').fillColor('#374151').text(SCHOOL_ADDRESS, { align: 'center' });
    doc.moveDown(0.3);
    doc.moveTo(50, doc.y).lineTo(790, doc.y).stroke('#1e3a5f');
    doc.moveDown(0.3);
    doc.fontSize(12).font('Helvetica-Bold').fillColor('#1e3a5f')
      .text(`MOCK ${mock_number} EXAMINATION RESULTS – BASIC 9`, { align: 'center' });
    doc.moveDown(0.3);
    doc.moveTo(50, doc.y).lineTo(790, doc.y).stroke('#e5e7eb');
    doc.moveDown(0.5);

    doc.fontSize(8).font('Helvetica-Oblique').fillColor('#6b7280')
      .text('Grading: A1(80-100), B2(75-79), B3(70-74), C4(65-69), C5(60-64), C6(55-59), D7(50-54), E8(45-49), F9(0-44) | Aggregate = Best 4 Core + Best 2 Elective (lower = better)', { align: 'center' });
    doc.moveDown(0.4);

    const colStart = 50;
    const nameW = 120;
    const subjW = 52;
    const tableY = doc.y;

    // Header row
    doc.rect(colStart, tableY, 740, 18).fill('#1e3a5f');
    doc.fillColor('#fff').fontSize(7).font('Helvetica-Bold');
    doc.text('#', colStart+2, tableY+5, { width: 18 });
    doc.text('Student Name', colStart+22, tableY+5, { width: nameW });
    MOCK_SUBJECTS.forEach((s, i) => {
      doc.text(s.split(' ')[0].substring(0,6), colStart+nameW+22+i*subjW, tableY+5, { width: subjW-2 });
    });
    doc.text('Agg', colStart+nameW+22+MOCK_SUBJECTS.length*subjW+2, tableY+5);

    let ry = tableY + 18;
    results.forEach((r, ri) => {
      const bg = ri%2===0 ? '#fff' : '#f8fafc';
      doc.rect(colStart, ry, 740, 15).fill(bg);
      doc.fillColor('#374151').fontSize(7.5).font('Helvetica');
      doc.text(r.position, colStart+2, ry+3, { width: 18 });
      doc.text(r.full_name, colStart+22, ry+3, { width: nameW });
      MOCK_SUBJECTS.forEach((subj, si) => {
        const sc = r.scores.find(s => s.subject===subj);
        // Show actual MARK (score) not letter grade
        const displayVal = sc ? String(sc.score||0) : '—';
        const isUsed = r.best4Core?.some(c=>c.subject===subj) || r.best2Elective?.some(c=>c.subject===subj);
        doc.fillColor(isUsed ? '#1e40af' : CORE.includes(subj) ? '#374151' : '#6b7280')
           .font(isUsed ? 'Helvetica-Bold' : 'Helvetica')
           .text(displayVal, colStart+nameW+22+si*subjW, ry+3, { width: subjW-2 });
      });
      const aggText = r.aggregate != null ? String(r.aggregate) : '—';
      doc.fillColor('#dc2626').font('Helvetica-Bold').text(aggText, colStart+nameW+22+MOCK_SUBJECTS.length*subjW+2, ry+3);
      ry += 15;
      if (ry > 510) { doc.addPage({ layout:'landscape' }); ry = 50; }
    });

    doc.fillColor('#9ca3af').fontSize(7)
      .text(`Generated: ${new Date().toLocaleDateString('en-GH',{day:'numeric',month:'long',year:'numeric'})} | ${SCHOOL_NAME}`, 50, ry+15, { align: 'center', width: 740 });

    doc.end();
  } catch (e) {
    if (!res.headersSent) res.status(500).json({ error: e.message });
  }
};

exports.classReport = (req, res) => {
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
    students.forEach((st, idx) => {
      const grades = query("SELECT subject,class_score,exam_score,grade FROM grades WHERE student_id=? AND term=?", [st.id, termLabel]);
      const gMap = {}; grades.forEach(g => { gMap[g.subject] = g; });
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
    });

    doc.fillColor('#9ca3af').fontSize(7)
      .text(`Generated: ${new Date().toLocaleDateString('en-GH')} | ${SCHOOL_NAME}`, 50, ry+15, { align:'center', width:740 });
    doc.end();
  } catch (e) {
    if (!res.headersSent) res.status(500).json({ error: e.message });
  }
};
