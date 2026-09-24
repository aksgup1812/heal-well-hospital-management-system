const express = require('express');
const { pool } = require('../db');
const { authorize } = require('../middleware/auth');
const { asyncHandler, publicId } = require('./helpers');

const router = express.Router();
const select = 'SELECT l.id, l.test_id AS testId, l.patient_id AS patientDbId, p.patient_id AS patientId, p.name AS patient, l.test_name AS testName, l.status, l.result, l.created_at AS createdAt FROM laboratory l JOIN patients p ON p.id = l.patient_id';
async function findPatient(reference) { const [rows] = await pool.execute('SELECT * FROM patients WHERE id = ? OR patient_id = ? OR name = ? LIMIT 1', [reference, reference, reference]); return rows[0] || null; }

/* List laboratory results for staff or only the logged-in patient. */
router.get('/', asyncHandler(async (req, res) => { const suffix = req.user.role === 'patient' ? ' WHERE p.user_id = ?' : req.user.role === 'doctor' && req.user.doctor ? ' WHERE EXISTS (SELECT 1 FROM appointments a WHERE a.patient_id = l.patient_id AND a.doctor_id = ?)' : ''; const values = req.user.role === 'patient' ? [req.user.id] : req.user.role === 'doctor' && req.user.doctor ? [req.user.doctor.id] : []; const [rows] = await pool.execute(`${select}${suffix} ORDER BY l.id DESC`, values); res.json(rows); }));

/* Create a laboratory record for administrators and doctors. */
router.post('/', authorize('admin', 'doctor'), asyncHandler(async (req, res) => { const patient = await findPatient(req.body.patientId || req.body.patient); if (!patient || !req.body.testName) return res.status(400).json({ message: 'Patient and test name are required.' }); const [result] = await pool.execute('INSERT INTO laboratory (test_id, patient_id, test_name, status, result) VALUES (?, ?, ?, ?, ?)', [req.body.testId || publicId('LAB'), patient.id, req.body.testName, req.body.status || 'Pending', req.body.result || null]); const [rows] = await pool.execute(`${select} WHERE l.id = ?`, [result.insertId]); res.status(201).json(rows[0]); }));

/* Update a laboratory result for administrators and doctors. */
router.put('/:id', authorize('admin', 'doctor'), asyncHandler(async (req, res) => { const patient = req.body.patientId || req.body.patient ? await findPatient(req.body.patientId || req.body.patient) : null; const [result] = await pool.execute('UPDATE laboratory SET patient_id = COALESCE(?, patient_id), test_name = COALESCE(?, test_name), status = COALESCE(?, status), result = COALESCE(?, result) WHERE id = ? OR test_id = ?', [patient?.id || null, req.body.testName || null, req.body.status || null, req.body.result || null, req.params.id, req.params.id]); if (!result.affectedRows) return res.status(404).json({ message: 'Laboratory record not found.' }); const [rows] = await pool.execute(`${select} WHERE l.id = ? OR l.test_id = ?`, [req.params.id, req.params.id]); res.json(rows[0]); }));

/* Delete a laboratory record for administrators and doctors. */
router.delete('/:id', authorize('admin', 'doctor'), asyncHandler(async (req, res) => { const [result] = await pool.execute('DELETE FROM laboratory WHERE id = ? OR test_id = ?', [req.params.id, req.params.id]); if (!result.affectedRows) return res.status(404).json({ message: 'Laboratory record not found.' }); res.json({ message: 'Laboratory record deleted successfully.' }); }));

module.exports = router;
