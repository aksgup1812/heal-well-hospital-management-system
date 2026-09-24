const express = require('express');
const { pool } = require('../db');
const { authorize } = require('../middleware/auth');
const { asyncHandler } = require('./helpers');

const router = express.Router();

/* Build the complete patient-facing snapshot from the shared hospital database. */
router.get('/summary', authorize('patient'), asyncHandler(async (req, res) => {
  const patientId = req.user.patient?.id;
  if (!patientId) return res.status(404).json({ message: 'Patient profile not found.' });
  const [[patient]] = await pool.execute('SELECT id, patient_id AS patientId, name, age, gender, phone, address, disease FROM patients WHERE id = ?', [patientId]);
  const [appointments] = await pool.execute(`SELECT a.id, a.appointment_id AS appointmentId, p.patient_id AS patientId, p.name AS patient, d.doctor_id AS doctorId, d.name AS doctor, d.department, a.appointment_date AS date, a.appointment_time AS time, a.status, a.reason, c.status AS consultationStatus, c.prescription, c.follow_up_date AS followUpDate FROM appointments a JOIN patients p ON p.id = a.patient_id JOIN doctors d ON d.id = a.doctor_id LEFT JOIN consultations c ON c.appointment_id = a.id WHERE a.patient_id = ? ORDER BY a.appointment_date DESC, a.appointment_time DESC`, [patientId]);
  const [laboratory] = await pool.execute('SELECT l.test_id AS testId, l.test_name AS testName, l.status, l.result, l.created_at AS createdAt FROM laboratory l WHERE l.patient_id = ? ORDER BY l.id DESC', [patientId]);
  const [billing] = await pool.execute('SELECT b.bill_id AS billId, b.consultation, b.medicine, b.laboratory, b.total, b.status, b.created_at AS createdAt FROM billing b WHERE b.patient_id = ? ORDER BY b.id DESC', [patientId]);
  const [prescriptions] = await pool.execute(`SELECT c.id, c.prescription, c.diagnosis, c.follow_up_date AS followUpDate, c.updated_at AS updatedAt, d.name AS doctor FROM consultations c JOIN doctors d ON d.id = c.doctor_id WHERE c.patient_id = ? AND c.prescription IS NOT NULL AND c.prescription <> '' ORDER BY c.updated_at DESC`, [patientId]);
  res.json({ patient, appointments, laboratory, billing, prescriptions });
}));

module.exports = router;
