const express = require('express');
const { pool } = require('../db');
const { authorize } = require('../middleware/auth');
const { asyncHandler } = require('./helpers');

const router = express.Router();
router.use(authorize('doctor'));

/* Resolve the authenticated doctor's linked clinical profile. */
async function getDoctor(req) {
  const [rows] = await pool.execute('SELECT * FROM doctors WHERE user_id = ? OR doctor_id = ? LIMIT 1', [req.user.id, req.user.username]);
  return rows[0] || null;
}
function seesAllBookings(req) { return req.user.username === 'doctor'; }

const appointmentSelect = `SELECT a.id, a.appointment_id AS appointmentId, p.id AS patientDbId, p.patient_id AS patientId, p.name AS patient, p.age, p.gender, p.phone, d.doctor_id AS doctorId, d.name AS doctor, d.department, a.appointment_date AS date, a.appointment_time AS time, a.status, a.reason, a.booking_source AS bookingSource, c.status AS consultationStatus, c.prescription, c.diagnosis, c.follow_up_date AS followUpDate FROM appointments a JOIN patients p ON p.id = a.patient_id JOIN doctors d ON d.id = a.doctor_id LEFT JOIN consultations c ON c.appointment_id = a.id`;

/* Return doctor dashboard counts and current doctor details. */
router.get('/summary', asyncHandler(async (req, res) => {
  const doctor = await getDoctor(req);
  if (!doctor) return res.status(404).json({ message: 'Doctor profile not found.' });
  const scope = seesAllBookings(req) ? '' : 'doctor_id = ? AND ';
  const scopeValues = seesAllBookings(req) ? [] : [doctor.id];
  const [[today]] = await pool.execute(`SELECT COUNT(*) AS total FROM appointments WHERE ${scope}appointment_date = CURDATE() AND status NOT IN ('Cancelled')`, scopeValues);
  const [[pending]] = await pool.execute(`SELECT COUNT(*) AS total FROM appointments WHERE ${scope}status IN ('Pending', 'Confirmed')`, scopeValues);
  const [[completed]] = await pool.execute(`SELECT COUNT(*) AS total FROM appointments WHERE ${scope}status = 'Completed'`, scopeValues);
  const [[emergency]] = await pool.execute('SELECT COUNT(*) AS total FROM emergency_cases WHERE priority IN (\'High\', \'Critical\')', []);
  res.json({ doctor: { doctorId: doctor.doctor_id, name: doctor.name, department: doctor.department, qualification: doctor.qualification, experience: doctor.experience }, todayPatients: Number(today.total), todayAppointments: Number(today.total), pendingCases: Number(pending.total), completedConsultations: Number(completed.total), emergencyCases: Number(emergency.total) });
}));

/* List the authenticated doctor's queue for a selected day. */
router.get('/appointments', asyncHandler(async (req, res) => {
  const doctor = await getDoctor(req);
  if (!doctor) return res.status(404).json({ message: 'Doctor profile not found.' });
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  const scope = seesAllBookings(req) ? '' : 'a.doctor_id = ? AND ';
  const values = seesAllBookings(req) ? [date] : [doctor.id, date];
  const [rows] = await pool.execute(`${appointmentSelect} WHERE ${scope}a.appointment_date = ? ORDER BY FIELD(a.status, 'Pending', 'Confirmed', 'Completed', 'Cancelled'), a.appointment_time`, values);
  res.json(rows);
}));

/* Return the complete patient context for a doctor's assigned appointment. */
router.get('/patients/:id', asyncHandler(async (req, res) => {
  const doctor = await getDoctor(req);
  if (!doctor) return res.status(404).json({ message: 'Doctor profile not found.' });
  const patientScope = seesAllBookings(req) ? '' : 'a.doctor_id = ? AND ';
  const patientValues = seesAllBookings(req) ? [req.params.id, req.params.id] : [doctor.id, req.params.id, req.params.id];
  const [patients] = await pool.execute(`SELECT DISTINCT p.id, p.patient_id AS patientId, p.name, p.age, p.gender, p.phone, p.address, p.disease FROM patients p JOIN appointments a ON a.patient_id = p.id WHERE ${patientScope}(p.id = ? OR p.patient_id = ?)`, patientValues);
  if (!patients.length) return res.status(404).json({ message: 'Patient is not assigned to this doctor.' });
  const patient = patients[0];
  const appointmentScope = seesAllBookings(req) ? 'a.patient_id = ?' : 'a.doctor_id = ? AND a.patient_id = ?';
  const appointmentValues = seesAllBookings(req) ? [patient.id] : [doctor.id, patient.id];
  const [appointments] = await pool.execute(`${appointmentSelect} WHERE ${appointmentScope} ORDER BY a.appointment_date DESC, a.appointment_time DESC`, appointmentValues);
  const [laboratory] = await pool.execute('SELECT test_id AS testId, test_name AS testName, status, result, created_at AS createdAt FROM laboratory WHERE patient_id = ? ORDER BY id DESC', [patient.id]);
  const [consultations] = await pool.execute('SELECT id, diagnosis, notes, prescription, recommended_tests AS recommendedTests, follow_up_date AS followUpDate, status, updated_at AS updatedAt FROM consultations WHERE patient_id = ? ORDER BY updated_at DESC', [patient.id]);
  res.json({ patient, appointments, laboratory, consultations });
}));

/* Save or update a consultation and optionally complete its appointment. */
router.post('/appointments/:id/consultation', asyncHandler(async (req, res) => {
  const doctor = await getDoctor(req);
  if (!doctor) return res.status(404).json({ message: 'Doctor profile not found.' });
  const consultationScope = seesAllBookings(req) ? '' : ' AND doctor_id = ?';
  const consultationValues = seesAllBookings(req) ? [req.params.id, req.params.id] : [req.params.id, req.params.id, doctor.id];
  const [appointments] = await pool.execute(`SELECT id, patient_id AS patientId FROM appointments WHERE (id = ? OR appointment_id = ?)${consultationScope}`, consultationValues);
  if (!appointments.length) return res.status(404).json({ message: 'Appointment is not assigned to this doctor.' });
  const appointment = appointments[0];
  const { symptoms, diagnosis, notes, prescription, recommendedTests, followUpDate } = req.body;
  await pool.execute(`INSERT INTO consultations (appointment_id, doctor_id, patient_id, symptoms, diagnosis, notes, prescription, recommended_tests, follow_up_date, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE symptoms = VALUES(symptoms), diagnosis = VALUES(diagnosis), notes = VALUES(notes), prescription = VALUES(prescription), recommended_tests = VALUES(recommended_tests), follow_up_date = VALUES(follow_up_date), status = VALUES(status)`, [appointment.id, doctor.id, appointment.patientId, symptoms || null, diagnosis || null, notes || null, prescription || null, recommendedTests || null, followUpDate || null, req.body.status || 'Completed']);
  if (req.body.complete !== false) await pool.execute('UPDATE appointments SET status = \'Completed\' WHERE id = ?', [appointment.id]);
  const [rows] = await pool.execute('SELECT id, appointment_id AS appointmentId, diagnosis, notes, prescription, recommended_tests AS recommendedTests, follow_up_date AS followUpDate, status, updated_at AS updatedAt FROM consultations WHERE appointment_id = ?', [appointment.id]);
  res.status(201).json(rows[0]);
}));

/* Return working hours, booked slots, and configured leave dates. */
router.get('/schedule', asyncHandler(async (req, res) => {
  const doctor = await getDoctor(req);
  if (!doctor) return res.status(404).json({ message: 'Doctor profile not found.' });
  const [schedules] = await pool.execute('SELECT id, day_of_week AS dayOfWeek, start_time AS startTime, end_time AS endTime, slot_duration AS slotDuration FROM doctor_schedules WHERE doctor_id = ? ORDER BY day_of_week, start_time', [doctor.id]);
  const [leaves] = await pool.execute('SELECT id, leave_date AS leaveDate, reason FROM doctor_leaves WHERE doctor_id = ? AND leave_date >= CURDATE() ORDER BY leave_date', [doctor.id]);
  res.json({ schedules, leaves });
}));

/* Allow a doctor to mark a future day unavailable. */
router.post('/leave', asyncHandler(async (req, res) => {
  const doctor = await getDoctor(req);
  if (!doctor || !req.body.leaveDate) return res.status(400).json({ message: 'A leave date is required.' });
  try {
    const [result] = await pool.execute('INSERT INTO doctor_leaves (doctor_id, leave_date, reason) VALUES (?, ?, ?)', [doctor.id, req.body.leaveDate, req.body.reason || null]);
    const [rows] = await pool.execute('SELECT id, leave_date AS leaveDate, reason FROM doctor_leaves WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (error) { if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'This leave date is already configured.' }); throw error; }
}));

/* Remove a configured future leave date. */
router.delete('/leave/:id', asyncHandler(async (req, res) => {
  const doctor = await getDoctor(req);
  if (!doctor) return res.status(404).json({ message: 'Doctor profile not found.' });
  const [result] = await pool.execute('DELETE FROM doctor_leaves WHERE id = ? AND doctor_id = ?', [req.params.id, doctor.id]);
  if (!result.affectedRows) return res.status(404).json({ message: 'Leave date not found.' });
  res.json({ message: 'Leave date removed.' });
}));

module.exports = router;
