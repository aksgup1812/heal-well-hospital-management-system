const express = require('express');
const { pool } = require('../db');
const { authorize } = require('../middleware/auth');
const { asyncHandler, publicId, isDuplicate } = require('./helpers');

const router = express.Router();
const select = 'SELECT id, patient_id AS patientId, name, age, gender, phone, address, disease, created_at AS createdAt, user_id AS userId FROM patients';

/* List all patients for staff or only the logged-in patient's record. */
router.get('/', asyncHandler(async (req, res) => {
  let query = `${select} ORDER BY id DESC`;
  let values = [];
  if (req.user.role === 'patient') { query = `${select} WHERE user_id = ? ORDER BY id DESC`; values = [req.user.id]; }
  if (req.user.role === 'doctor' && req.user.doctor) { query = `${select} WHERE EXISTS (SELECT 1 FROM appointments a WHERE a.patient_id = patients.id AND a.doctor_id = ?) ORDER BY id DESC`; values = [req.user.doctor.id]; }
  const [rows] = await pool.execute(query, values);
  res.json(rows);
}));

/* Retrieve one patient by internal id or public patient id. */
router.get('/:id', asyncHandler(async (req, res) => {
  const scope = req.user.role === 'patient' ? ' AND user_id = ?' : req.user.role === 'doctor' && req.user.doctor ? ' AND EXISTS (SELECT 1 FROM appointments a WHERE a.patient_id = patients.id AND a.doctor_id = ?)' : '';
  const values = req.user.role === 'patient' ? [req.params.id, req.params.id, req.user.id] : req.user.role === 'doctor' && req.user.doctor ? [req.params.id, req.params.id, req.user.doctor.id] : [req.params.id, req.params.id];
  const [rows] = await pool.execute(`${select} WHERE (id = ? OR patient_id = ?)${scope}`, values);
  if (!rows.length) return res.status(404).json({ message: 'Patient not found.' });
  res.json(rows[0]);
}));

/* Create a patient record for administrators. */
router.post('/', authorize('admin'), asyncHandler(async (req, res) => {
  const { name, age, gender, phone, address, disease } = req.body;
  if (!name || !phone) return res.status(400).json({ message: 'Name and phone are required.' });
  try {
    const patientId = req.body.patientId || publicId('PAT');
    const [result] = await pool.execute('INSERT INTO patients (patient_id, name, age, gender, phone, address, disease) VALUES (?, ?, ?, ?, ?, ?, ?)', [patientId, name.trim(), age || null, gender || null, phone, address || null, disease || null]);
    const [rows] = await pool.execute(`${select} WHERE id = ?`, [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (error) { if (isDuplicate(error)) return res.status(409).json({ message: 'Patient ID or phone already exists.' }); throw error; }
}));

/* Update a patient record for administrators. */
router.put('/:id', authorize('admin'), asyncHandler(async (req, res) => {
  const { name, age, gender, phone, address, disease } = req.body;
  const [result] = await pool.execute('UPDATE patients SET name = ?, age = ?, gender = ?, phone = ?, address = ?, disease = ? WHERE id = ? OR patient_id = ?', [name, age || null, gender || null, phone, address || null, disease || null, req.params.id, req.params.id]);
  if (!result.affectedRows) return res.status(404).json({ message: 'Patient not found.' });
  const [rows] = await pool.execute(`${select} WHERE id = ? OR patient_id = ?`, [req.params.id, req.params.id]);
  res.json(rows[0]);
}));

/* Delete a patient record for administrators. */
router.delete('/:id', authorize('admin'), asyncHandler(async (req, res) => {
  const [result] = await pool.execute('DELETE FROM patients WHERE id = ? OR patient_id = ?', [req.params.id, req.params.id]);
  if (!result.affectedRows) return res.status(404).json({ message: 'Patient not found.' });
  res.json({ message: 'Patient deleted successfully.' });
}));

module.exports = router;
