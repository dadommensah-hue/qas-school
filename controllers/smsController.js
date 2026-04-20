const { query, run, get } = require('../database');

async function sendSMS(phone, message) {
  console.log(`[SMS] To: ${phone} | Msg: ${message}`);
  return { status: 'sent', message_id: 'SIM-' + Date.now() };
}

exports.sendToClass = async (req, res) => {
  try {
    const { class: cls, message, sms_type } = req.body;
    const students = await query("SELECT s.guardian_phone, s.guardian_name, s.full_name FROM students s WHERE s.class=? AND s.status='active' AND s.guardian_phone != ''", [cls]);
    let sent = 0;
    for (const s of students) {
      if (!s.guardian_phone) continue;
      const personalMsg = message.replace('{student_name}', s.full_name).replace('{guardian_name}', s.guardian_name || 'Parent/Guardian');
      await sendSMS(s.guardian_phone, personalMsg);
      await run("INSERT INTO sms_logs (recipient_phone, recipient_name, message, status, sms_type) VALUES (?,?,?,?,?)",
        [s.guardian_phone, s.guardian_name, personalMsg, 'sent', sms_type || 'general']);
      sent++;
    }
    res.json({ message: `SMS sent to ${sent} guardians in ${cls}`, sent });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.sendToStudent = async (req, res) => {
  try {
    const { student_id, message, sms_type } = req.body;
    const student = await get("SELECT * FROM students WHERE id=?", [student_id]);
    if (!student) return res.status(404).json({ error: 'Student not found' });
    const msg = message.replace('{student_name}', student.full_name);
    await sendSMS(student.guardian_phone, msg);
    await run("INSERT INTO sms_logs (recipient_phone, recipient_name, message, status, sms_type) VALUES (?,?,?,?,?)",
      [student.guardian_phone, student.guardian_name, msg, 'sent', sms_type || 'individual']);
    res.json({ message: 'SMS sent successfully' });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.sendFeeReminders = async (req, res) => {
  try {
    const { term } = req.body;
    const defaulters = await query(`SELECT s.full_name, s.guardian_phone, s.guardian_name,
      f.amount, f.amount_paid, f.amount-f.amount_paid as balance
      FROM fees f JOIN students s ON f.student_id=s.id
      WHERE f.term=? AND f.status!='paid' AND s.guardian_phone!=''`, [term || 'Term 1']);
    let sent = 0;
    for (const d of defaulters) {
      const msg = `Dear ${d.guardian_name || 'Parent/Guardian'}, your ward ${d.full_name} has an outstanding school fees balance of GH₵${parseFloat(d.balance).toFixed(2)} for ${term}. Please make payment urgently. Thank you. - QAS School`;
      await sendSMS(d.guardian_phone, msg);
      await run("INSERT INTO sms_logs (recipient_phone, recipient_name, message, status, sms_type) VALUES (?,?,?,?,?)",
        [d.guardian_phone, d.guardian_name, msg, 'sent', 'fee_reminder']);
      sent++;
    }
    res.json({ message: `Fee reminders sent to ${sent} guardians`, sent });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.logs = async (req, res) => {
  try {
    const { limit } = req.query;
    const logs = await query(`SELECT * FROM sms_logs ORDER BY sent_at DESC LIMIT ?`,
      [parseInt(limit) || 50]);
    res.json(logs);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.sendAll = async (req, res) => {
  try {
    const { message, sms_type } = req.body;
    const guardians = await query("SELECT DISTINCT guardian_phone, guardian_name FROM students WHERE status='active' AND guardian_phone!=''");
    for (const g of guardians) {
      await sendSMS(g.guardian_phone, message);
      await run("INSERT INTO sms_logs (recipient_phone, recipient_name, message, status, sms_type) VALUES (?,?,?,?,?)",
        [g.guardian_phone, g.guardian_name, message, 'sent', sms_type || 'broadcast']);
    }
    res.json({ message: `Broadcast sent to ${guardians.length} guardians`, sent: guardians.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
};