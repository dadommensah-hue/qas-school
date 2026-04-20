const { getDB, run, query } = require('./database');
const bcrypt = require('bcryptjs');

const CLASSES = ['Basic 1','Basic 2','Basic 3','Basic 4','Basic 5','Basic 6','Basic 7','Basic 8','Basic 9'];
const SUBJECTS = [
  'Career Technology','Computing','Creative Arts and Design','English Language','French',
  'Ghanaian Language','History','Integrated Science','Mathematics',
  'Religious and Moral Education','Social Studies'
];
const CORE_SUBJECTS = ['English Language','Mathematics','Integrated Science','Social Studies'];
const TERMS = ['Term 1', 'Term 2', 'Term 3'];

async function setupDatabase() {
  await getDB();

  await run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'teacher',
    full_name TEXT,
    email TEXT,
    phone TEXT,
    profile_photo TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await run(`CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    date_of_birth TEXT,
    gender TEXT,
    class TEXT NOT NULL,
    student_type TEXT DEFAULT 'day',
    guardian_name TEXT,
    guardian_phone TEXT,
    guardian_email TEXT,
    address TEXT,
    profile_photo TEXT,
    username TEXT UNIQUE,
    password TEXT,
    status TEXT DEFAULT 'active',
    academic_year TEXT DEFAULT '2024/2025',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await run(`CREATE TABLE IF NOT EXISTS teachers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    teacher_id TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    gender TEXT,
    phone TEXT,
    email TEXT,
    subject_specialization TEXT,
    qualification TEXT,
    profile_photo TEXT,
    username TEXT UNIQUE,
    password TEXT,
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await run(`CREATE TABLE IF NOT EXISTS teacher_subjects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    teacher_id INTEGER NOT NULL,
    subject TEXT NOT NULL,
    class TEXT DEFAULT 'all',
    FOREIGN KEY(teacher_id) REFERENCES teachers(id)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS teacher_class_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    teacher_id INTEGER NOT NULL,
    assigned_class TEXT NOT NULL,
    UNIQUE(teacher_id, assigned_class),
    FOREIGN KEY(teacher_id) REFERENCES teachers(id)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    class TEXT NOT NULL,
    date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'present',
    term TEXT,
    academic_year TEXT DEFAULT '2024/2025',
    recorded_by INTEGER,
    FOREIGN KEY(student_id) REFERENCES students(id)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS grades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    subject TEXT NOT NULL,
    class TEXT NOT NULL,
    term TEXT NOT NULL,
    academic_year TEXT DEFAULT '2024/2025',
    class_score REAL DEFAULT 0,
    exam_score REAL DEFAULT 0,
    total_score REAL DEFAULT 0,
    grade TEXT,
    remarks TEXT,
    recorded_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(student_id) REFERENCES students(id)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS grade_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    subject TEXT NOT NULL,
    class TEXT NOT NULL,
    term TEXT NOT NULL,
    academic_year TEXT DEFAULT '2024/2025',
    class_score REAL DEFAULT 0,
    exam_score REAL DEFAULT 0,
    total_score REAL DEFAULT 0,
    grade TEXT,
    remarks TEXT,
    recorded_by INTEGER,
    archived_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(student_id) REFERENCES students(id)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS mock_exam (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    subject TEXT NOT NULL,
    class TEXT NOT NULL DEFAULT 'Basic 9',
    academic_year TEXT DEFAULT '2024/2025',
    score REAL DEFAULT 0,
    grade TEXT,
    subject_type TEXT DEFAULT 'core',
    mock_number INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(student_id) REFERENCES students(id)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS midterm_grades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    subject TEXT NOT NULL,
    class TEXT NOT NULL,
    term TEXT NOT NULL,
    academic_year TEXT DEFAULT '2024/2025',
    exam_score REAL DEFAULT 0,
    grade TEXT,
    remarks TEXT,
    recorded_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(student_id) REFERENCES students(id)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS report_conduct (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    term TEXT NOT NULL,
    academic_year TEXT DEFAULT '2024/2025',
    exam_type TEXT DEFAULT 'end_of_term',
    conduct TEXT DEFAULT '',
    interest TEXT DEFAULT '',
    attitude TEXT DEFAULT '',
    teacher_remark TEXT DEFAULT '',
    promoted_to TEXT DEFAULT '',
    next_term_begins TEXT DEFAULT '',
    updated_by INTEGER,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(student_id, term, academic_year, exam_type),
    FOREIGN KEY(student_id) REFERENCES students(id)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS approved_terms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    class TEXT NOT NULL,
    term TEXT NOT NULL,
    exam_type TEXT DEFAULT 'end_of_term',
    academic_year TEXT DEFAULT '2024/2025',
    approved_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    approved_by INTEGER,
    UNIQUE(class, term, academic_year, exam_type)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS syllabus (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    subject TEXT,
    class TEXT,
    filename TEXT NOT NULL,
    filepath TEXT NOT NULL,
    filesize TEXT,
    mimetype TEXT,
    uploaded_by INTEGER,
    uploader_name TEXT,
    uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(uploaded_by) REFERENCES users(id)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS fees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    fee_type TEXT NOT NULL,
    amount REAL NOT NULL,
    amount_paid REAL DEFAULT 0,
    balance REAL DEFAULT 0,
    term TEXT,
    academic_year TEXT DEFAULT '2024/2025',
    due_date TEXT,
    paid_date TEXT,
    status TEXT DEFAULT 'pending',
    receipt_number TEXT,
    payment_method TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(student_id) REFERENCES students(id)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    event_date TEXT NOT NULL,
    end_date TEXT,
    event_type TEXT DEFAULT 'general',
    class TEXT DEFAULT 'all',
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await run(`CREATE TABLE IF NOT EXISTS sms_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipient_phone TEXT NOT NULL,
    recipient_name TEXT,
    message TEXT NOT NULL,
    status TEXT DEFAULT 'sent',
    sms_type TEXT,
    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Admin user
  const admin = await query("SELECT id FROM users WHERE username='admin'");
  if (!admin.length) {
    const hash = await bcrypt.hash('admin123', 10);
    await run("INSERT INTO users (username,password,role,full_name,email) VALUES (?,?,?,?,?)",
      ['admin', hash, 'admin', 'System Administrator', 'admin@qasschool.edu.gh']);
    console.log('Admin: admin / admin123');
  }

  const existingStudents = await query("SELECT id FROM students LIMIT 1");
  if (!existingStudents.length) {
    const sampleStudents = [
      ['QAS-2025-001','Ama Owusu','2014-03-15','Female','Basic 5','boarding','Kofi Owusu','0244123456'],
      ['QAS-2025-002','Kwame Asante','2013-07-22','Male','Basic 6','day','Adwoa Asante','0244234567'],
      ['QAS-2025-003','Abena Mensah','2015-01-10','Female','Basic 4','boarding','Yaw Mensah','0244345678'],
      ['QAS-2025-004','Kofi Adjei','2012-09-05','Male','Basic 7','day','Esi Adjei','0244456789'],
      ['QAS-2025-005','Efua Boateng','2016-05-20','Female','Basic 3','boarding','Kweku Boateng','0244567890'],
      ['QAS-2025-006','Yaw Darko','2011-11-30','Male','Basic 8','day','Akua Darko','0244678901'],
      ['QAS-2025-007','Akosua Frimpong','2010-04-18','Female','Basic 9','boarding','Kojo Frimpong','0244789012'],
      ['QAS-2025-008','Kojo Amponsah','2017-08-25','Male','Basic 2','day','Abena Amponsah','0244890123'],
      ['QAS-2025-009','Adwoa Gyasi','2018-02-14','Female','Basic 1','boarding','Kwame Gyasi','0244901234'],
      ['QAS-2025-010','Nana Osei','2013-12-01','Male','Basic 9','day','Ama Osei','0244012345'],
    ];

    for (const s of sampleStudents) {
      const username = s[0].toLowerCase().replace(/-/g,'');
      const hash = await bcrypt.hash('student123', 10);
      await run("INSERT INTO students (student_id,full_name,date_of_birth,gender,class,student_type,guardian_name,guardian_phone,username,password) VALUES (?,?,?,?,?,?,?,?,?,?)",
        [...s, username, hash]);
    }

    const allStudents = await query("SELECT id,class FROM students");
    for (const st of allStudents) {
      for (const subj of SUBJECTS) {
        const cs = Math.min(50, Math.max(15, Math.floor(Math.random()*36+14)));
        const es = Math.min(50, Math.max(15, Math.floor(Math.random()*36+14)));
        const total = cs + es;
        const grade = total>=80?'A':total>=70?'B':total>=60?'C':total>=50?'D':'F';
        await run("INSERT INTO grades (student_id,subject,class,term,class_score,exam_score,total_score,grade) VALUES (?,?,?,?,?,?,?,?)",
          [st.id, subj, st.class, 'Term 1', cs, es, total, grade]);
      }
    }

    const basic9 = await query("SELECT id FROM students WHERE class='Basic 9'");
    for (const st of basic9) {
      for (const subj of SUBJECTS) {
        const score = Math.floor(Math.random()*60+30);
        const grade = score>=80?'A1':score>=75?'B2':score>=70?'B3':score>=65?'C4':score>=60?'C5':score>=55?'C6':score>=50?'D7':score>=45?'E8':'F9';
        const stype = CORE_SUBJECTS.includes(subj) ? 'core' : 'elective';
        await run("INSERT INTO mock_exam (student_id,subject,class,score,grade,subject_type) VALUES (?,?,?,?,?,?)",
          [st.id, subj, 'Basic 9', score, grade, stype]);
      }
    }

    for (const st of allStudents) {
      for (let d = 29; d >= 0; d--) {
        const date = new Date(); date.setDate(date.getDate()-d);
        if (date.getDay()===0||date.getDay()===6) continue;
        const status = Math.random()>0.1?'present':'absent';
        await run("INSERT INTO attendance (student_id,class,date,status,term) VALUES (?,?,?,?,?)",
          [st.id, st.class, date.toISOString().split('T')[0], status, 'Term 1']);
      }
    }

    const evts=[
      ['End of Term Exams','First term examinations','2025-03-10','2025-03-21','exam'],
      ['Prize Giving Day','Annual prize giving ceremony','2025-03-28',null,'ceremony'],
      ['PTA Meeting','Parent-Teacher Association meeting','2025-02-15',null,'meeting'],
      ['Independence Day Holiday','Ghana Independence Day','2025-03-06',null,'holiday'],
      ['Sports Day','Annual inter-house sports competition','2025-02-28',null,'sports'],
    ];
    for (const ev of evts) await run("INSERT INTO events (title,description,event_date,end_date,event_type) VALUES (?,?,?,?,?)", ev);

    const tList=[
      ['QAS-TCH-001','Mr. Emmanuel Asante','Male','0244111111','Mathematics','B.Ed Mathematics'],
      ['QAS-TCH-002','Mrs. Grace Mensah','Female','0244222222','English Language','B.Ed English'],
      ['QAS-TCH-003','Mr. Samuel Darko','Male','0244333333','Integrated Science','B.Sc Science Education'],
    ];
    for (const t of tList) {
      const username = t[0].toLowerCase().replace(/-/g,'');
      const hash = await bcrypt.hash('teacher123',10);
      await run("INSERT INTO teachers (teacher_id,full_name,gender,phone,subject_specialization,qualification,username,password) VALUES (?,?,?,?,?,?,?,?)",[...t,username,hash]);
      const tr = await query("SELECT id FROM teachers WHERE teacher_id=?",[t[0]]);
      if (tr[0]) await run("INSERT INTO teacher_subjects (teacher_id,subject) VALUES (?,?)",[tr[0].id, t[4]]);
    }

    console.log('Sample data seeded');
  }
  console.log('Database ready');
}

module.exports = { setupDatabase, CLASSES, SUBJECTS, CORE_SUBJECTS, TERMS };