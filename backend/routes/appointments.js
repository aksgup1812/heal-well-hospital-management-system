const express = require('express');
const { pool } = require('../db');
const { authorize } = require('../middleware/auth');
const { asyncHandler, publicId } = require('./helpers');

const router = express.Router();
const appointmentSelect = `SELECT a.id, a.appointment_id AS appointmentId, a.patient_id AS patientDbId, p.patient_id AS patientId, p.name AS patient, p.age, p.gender, p.phone, a.doctor_id AS doctorDbId, d.doctor_id AS doctorId, d.name AS doctor, d.department, a.appointment_date AS date, a.appointment_time AS time, a.status, a.reason, a.booking_source AS bookingSource, a.created_at AS createdAt, a.updated_at AS updatedAt FROM appointments a JOIN patients p ON p.id = a.patient_id JOIN doctors d ON d.id = a.doctor_id`;
const DEFAULT_WEEKDAY_SCHEDULE = [{ startTime: '09:00', endTime: '13:00', slotDuration: 30 }, { startTime: '14:00', endTime: '17:00', slotDuration: 30 }];
const DEFAULT_SATURDAY_SCHEDULE = [{ startTime: '09:00', endTime: '12:00', slotDuration: 30 }];

function normalizeTime(value) { return String(value || '').slice(0, 5); }
function toMinutes(value) { const [hours, minutes] = normalizeTime(value).split(':').map(Number); return (hours * 60) + minutes; }
function formatTime(minutes) { return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`; }
function dateDayOfWeek(value) { return new Date(`${value}T00:00:00Z`).getUTCDay(); }
function todayString() { return new Date().toISOString().slice(0, 10); }

async function findPatient(reference) {
  const [rows] = await pool.execute('SELECT * FROM patients WHERE id = ? OR patient_id = ? OR name = ? LIMIT 1', [reference, reference, reference]);
  return rows[0] || null;
}

async function findDoctor(reference) {
  const [rows] = await pool.execute('SELECT * FROM doctors WHERE id = ? OR doctor_id = ? OR name = ? LIMIT 1', [reference, reference, reference]);
  return rows[0] || null;
}

async function getDoctorSchedule(doctorId, date) {
  const dayOfWeek = dateDayOfWeek(date);
  const [leaveRows] = await pool.execute('SELECT id, leave_date AS leaveDate, reason FROM doctor_leaves WHERE doctor_id = ? AND leave_date = ?', [doctorId, date]);
  if (leaveRows.length) return { dayOfWeek, leave: leaveRows[0], schedules: [] };
  const [rows] = await pool.execute('SELECT id, day_of_week AS dayOfWeek, start_time AS startTime, end_time AS endTime, slot_duration AS slotDuration FROM doctor_schedules WHERE doctor_id = ? AND day_of_week = ? ORDER BY start_time', [doctorId, dayOfWeek]);
  const schedules = rows.length ? rows : (dayOfWeek === 0 ? [] : dayOfWeek === 6 ? DEFAULT_SATURDAY_SCHEDULE : DEFAULT_WEEKDAY_SCHEDULE);
  return { dayOfWeek, leave: null, schedules };
}

function createSlots(schedules) {
  return schedules.flatMap((schedule) => {
    const slots = [];
    const duration = Number(schedule.slotDuration || 30);
    for (let minutes = toMinutes(schedule.startTime); minutes + duration <= toMinutes(schedule.endTime); minutes += duration) slots.push(formatTime(minutes));
    return slots;
  });
}

async function getAvailability(doctor, date) {
  const schedule = await getDoctorSchedule(doctor.id, date);
  const [bookedRows] = await pool.execute("SELECT appointment_time AS time FROM appointments WHERE doctor_id = ? AND appointment_date = ? AND status NOT IN ('Cancelled', 'No Show')", [doctor.id, date]);
  const booked = new Set(bookedRows.map((row) => normalizeTime(row.time)));
  const slots = createSlots(schedule.schedules).map((time) => ({ time, available: !booked.has(time) }));
  return { doctorId: doctor.doctor_id, doctor: doctor.name, department: doctor.department, date, dayOfWeek: schedule.dayOfWeek, unavailable: Boolean(schedule.leave) || !schedule.schedules.length, unavailableReason: schedule.leave ? `${doctor.name} is unavailable on this date.` : schedule.dayOfWeek === 0 ? 'This doctor is unavailable on Sundays.' : null, slots };
}

async function assertBookableSlot(doctor, date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date)) || date < todayString()) return { status: 400, message: 'Past dates cannot be booked.' };
  const availability = await getAvailability(doctor, date);
  const selected = availability.slots.find((slot) => slot.time === normalizeTime(time));
  if (availability.unavailable) return { status: 409, message: availability.unavailableReason || 'The doctor is unavailable on this date.' };
  if (!selected) return { status: 400, message: 'Choose one of the doctor\'s available appointment slots.' };
  if (!selected.available) return { status: 409, message: 'This appointment slot was just booked by another patient.' };
  return null;
}

async function resolveReferences(req, body) {
  const patient = req.user.role === 'patient' ? req.user.patient ? await findPatient(req.user.patient.patient_id) : null : await findPatient(body.patientId || body.patient);
  const doctor = await findDoctor(body.doctorId || body.doctor);
  return { patient, doctor };
}

function doctorScope(req, alias = 'a') {
  return req.user.role === 'doctor' && req.user.doctor ? { clause: ` AND ${alias}.doctor_id = ?`, values: [req.user.doctor.id] } : { clause: '', values: [] };
}

/* Return generated slots and live booked state for one doctor/date pair. */
router.get('/availability', asyncHandler(async (req, res) => {
  const doctor = await findDoctor(req.query.doctorId || req.query.doctor);
  const date = String(req.query.date || '');
  if (!doctor || !date) return res.status(400).json({ message: 'Doctor and date are required.' });
  res.json(await getAvailability(doctor, date));
}));

/* List appointments filtered by the authenticated role. */
router.get('/', asyncHandler(async (req, res) => {
  let suffix = '';
  let values = [];
  if (req.user.role === 'patient') { suffix = ' WHERE p.user_id = ?'; values = [req.user.id]; }
  else if (req.user.role === 'doctor' && req.user.doctor) { suffix = ' WHERE a.doctor_id = ?'; values = [req.user.doctor.id]; }
  const [rows] = await pool.execute(`${appointmentSelect}${suffix} ORDER BY a.appointment_date DESC, a.appointment_time DESC`, values);
  res.json(rows);
}));

/* Retrieve one appointment while enforcing patient and doctor ownership. */
router.get('/:id', asyncHandler(async (req, res) => {
  let suffix = '';
  let values = [req.params.id, req.params.id];
  if (req.user.role === 'patient') { suffix = ' AND p.user_id = ?'; values.push(req.user.id); }
  else if (req.user.role === 'doctor' && req.user.doctor) { suffix = ' AND a.doctor_id = ?'; values.push(req.user.doctor.id); }
  const [rows] = await pool.execute(`${appointmentSelect} WHERE (a.id = ? OR a.appointment_id = ?)${suffix}`, values);
  if (!rows.length) return res.status(404).json({ message: 'Appointment not found.' });
  res.json(rows[0]);
}));

/* Create an appointment with a transaction and database-enforced conflict handling. */
router.post('/', authorize('admin', 'doctor', 'patient'), asyncHandler(async (req, res) => {
  const { patient, doctor } = await resolveReferences(req, req.body);
  if (!patient || !doctor || !req.body.date || !req.body.time) return res.status(400).json({ message: 'Patient, doctor, date, and time are required.' });
  if (req.user.role === 'doctor' && req.user.doctor && req.user.doctor.id !== doctor.id) return res.status(403).json({ message: 'Doctors can only schedule their own appointments.' });
  const validationError = await assertBookableSlot(doctor, req.body.date, req.body.time);
  if (validationError) return res.status(validationError.status).json({ message: validationError.message });
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [existing] = await connection.execute("SELECT id FROM appointments WHERE doctor_id = ? AND appointment_date = ? AND appointment_time = ? AND status NOT IN ('Cancelled', 'No Show') FOR UPDATE", [doctor.id, req.body.date, normalizeTime(req.body.time)]);
    if (existing.length) { await connection.rollback(); return res.status(409).json({ message: 'This appointment slot was just booked by another patient.' }); }
    const [result] = await connection.execute('INSERT INTO appointments (appointment_id, patient_id, doctor_id, appointment_date, appointment_time, status, reason, booking_source) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [req.body.appointmentId || publicId('APT'), patient.id, doctor.id, req.body.date, normalizeTime(req.body.time), req.body.status || (req.user.role === 'patient' ? 'Pending' : 'Confirmed'), req.body.reason || null, req.body.bookingSource || (req.user.role === 'patient' ? 'Patient Portal' : 'Hospital Staff')]);
    await connection.commit();
    const [rows] = await pool.execute(`${appointmentSelect} WHERE a.id = ?`, [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (error) {
    await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'This appointment slot was just booked by another patient.' });
    throw error;
  } finally { connection.release(); }
}));

/* Cancel without deleting history so the appointment slot becomes available again. */
router.put('/:id/cancel', authorize('admin', 'doctor', 'patient'), asyncHandler(async (req, res) => {
  const scope = req.user.role === 'patient' ? ' AND p.user_id = ?' : req.user.role === 'doctor' && req.user.doctor ? ' AND a.doctor_id = ?' : '';
  const values = [req.params.id, req.params.id];
  if (scope) values.push(req.user.role === 'patient' ? req.user.id : req.user.doctor.id);
  const [result] = await pool.execute(`UPDATE appointments a JOIN patients p ON p.id = a.patient_id SET a.status = 'Cancelled' WHERE (a.id = ? OR a.appointment_id = ?)${scope}`, values);
  if (!result.affectedRows) return res.status(404).json({ message: 'Appointment not found.' });
  const [rows] = await pool.execute(`${appointmentSelect} WHERE a.id = ? OR a.appointment_id = ?`, [req.params.id, req.params.id]);
  res.json(rows[0]);
}));

/* Reschedule an owned appointment through the same conflict-safe slot check. */
router.put('/:id/reschedule', authorize('patient'), asyncHandler(async (req, res) => {
  const [appointments] = await pool.execute('SELECT a.*, d.* FROM appointments a JOIN doctors d ON d.id = a.doctor_id JOIN patients p ON p.id = a.patient_id WHERE (a.id = ? OR a.appointment_id = ?) AND p.user_id = ?', [req.params.id, req.params.id, req.user.id]);
  if (!appointments.length) return res.status(404).json({ message: 'Appointment not found.' });
  const current = appointments[0];
  const doctor = await findDoctor(req.body.doctorId || current.doctor_id);
  const validationError = await assertBookableSlot(doctor, req.body.date, req.body.time);
  if (validationError) return res.status(validationError.status).json({ message: validationError.message });
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [existing] = await connection.execute("SELECT id FROM appointments WHERE doctor_id = ? AND appointment_date = ? AND appointment_time = ? AND status NOT IN ('Cancelled', 'No Show') AND id <> ? FOR UPDATE", [doctor.id, req.body.date, normalizeTime(req.body.time), current.id]);
    if (existing.length) { await connection.rollback(); return res.status(409).json({ message: 'This appointment slot was just booked by another patient.' }); }
    await connection.execute('UPDATE appointments SET doctor_id = ?, appointment_date = ?, appointment_time = ?, status = \'Pending\' WHERE id = ?', [doctor.id, req.body.date, normalizeTime(req.body.time), current.id]);
    await connection.commit();
    const [rows] = await pool.execute(`${appointmentSelect} WHERE a.id = ?`, [current.id]);
    res.json(rows[0]);
  } catch (error) {
    await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'This appointment slot was just booked by another patient.' });
    throw error;
  } finally { connection.release(); }
}));

/* Update appointment details for staff while preserving slot conflict rules. */
router.put('/:id', authorize('admin', 'doctor'), asyncHandler(async (req, res) => {
  const scope = doctorScope(req);
  const [currentRows] = await pool.execute(`SELECT * FROM appointments WHERE (id = ? OR appointment_id = ?)${scope.clause}`, [req.params.id, req.params.id, ...scope.values]);
  if (!currentRows.length) return res.status(404).json({ message: 'Appointment not found.' });
  const current = currentRows[0];
  const doctor = await findDoctor(req.body.doctorId || req.body.doctor || current.doctor_id);
  const date = req.body.date || String(current.appointment_date).slice(0, 10);
  const time = normalizeTime(req.body.time || current.appointment_time);
  if (doctor.id !== current.doctor_id || date !== String(current.appointment_date).slice(0, 10) || time !== normalizeTime(current.appointment_time)) {
    const validationError = await assertBookableSlot(doctor, date, time);
    if (validationError) return res.status(validationError.status).json({ message: validationError.message });
  }
  try {
    const [result] = await pool.execute('UPDATE appointments SET doctor_id = ?, appointment_date = ?, appointment_time = ?, status = COALESCE(?, status), reason = COALESCE(?, reason) WHERE id = ?', [doctor.id, date, time, req.body.status || null, req.body.reason || null, current.id]);
    if (!result.affectedRows) return res.status(404).json({ message: 'Appointment not found.' });
    const [rows] = await pool.execute(`${appointmentSelect} WHERE a.id = ?`, [current.id]);
    res.json(rows[0]);
  } catch (error) { if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'This appointment slot was just booked by another patient.' }); throw error; }
}));

/* Keep deletion available to staff for legacy dashboard compatibility. */
router.delete('/:id', authorize('admin', 'doctor'), asyncHandler(async (req, res) => {
  const scope = doctorScope(req);
  const [result] = await pool.execute(`DELETE FROM appointments WHERE (id = ? OR appointment_id = ?)${scope.clause}`, [req.params.id, req.params.id, ...scope.values]);
  if (!result.affectedRows) return res.status(404).json({ message: 'Appointment not found.' });
  res.json({ message: 'Appointment deleted successfully.' });
}));

module.exports = router;
