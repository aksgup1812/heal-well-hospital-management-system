const express = require('express');
const { pool } = require('../db');
const { authorize } = require('../middleware/auth');
const { asyncHandler, publicId } = require('./helpers');

const router = express.Router();
const select = 'SELECT b.id, b.bill_id AS billId, b.patient_id AS patientDbId, p.patient_id AS patientId, p.name AS patient, b.consultation, b.medicine, b.laboratory, b.total, b.status, b.created_at AS createdAt FROM billing b JOIN patients p ON p.id = b.patient_id';
async function findPatient(reference) { const [rows] = await pool.execute('SELECT * FROM patients WHERE id = ? OR patient_id = ? OR name = ? LIMIT 1', [reference, reference, reference]); return rows[0] || null; }

/* List all bills for staff or only the current patient's bills. */
router.get('/', asyncHandler(async (req, res) => { const suffix = req.user.role === 'patient' ? ' WHERE p.user_id = ?' : req.user.role === 'doctor' && req.user.doctor ? ' WHERE EXISTS (SELECT 1 FROM appointments a WHERE a.patient_id = b.patient_id AND a.doctor_id = ?)' : ''; const values = req.user.role === 'patient' ? [req.user.id] : req.user.role === 'doctor' && req.user.doctor ? [req.user.doctor.id] : []; const [rows] = await pool.execute(`${select}${suffix} ORDER BY b.id DESC`, values); res.json(rows); }));

/* Retrieve one bill by internal id or public bill id. */
router.get('/:id', asyncHandler(async (req, res) => { const scope = req.user.role === 'patient' ? ' AND p.user_id = ?' : ''; const values = req.user.role === 'patient' ? [req.params.id, req.params.id, req.user.id] : [req.params.id, req.params.id]; const [rows] = await pool.execute(`${select} WHERE (b.id = ? OR b.bill_id = ?)${scope}`, values); if (!rows.length) return res.status(404).json({ message: 'Bill not found.' }); res.json(rows[0]); }));

/* Create a bill for administrators. */
router.post('/', authorize('admin'), asyncHandler(async (req, res) => { const patient = await findPatient(req.body.patientId || req.body.patient); if (!patient) return res.status(400).json({ message: 'Patient is required.' }); const consultation = Number(req.body.consultation ?? req.body.consultationFee ?? 0); const medicine = Number(req.body.medicine ?? req.body.medicineFee ?? 0); const laboratory = Number(req.body.laboratory ?? req.body.laboratoryFee ?? 0); const total = consultation + medicine + laboratory; const [result] = await pool.execute('INSERT INTO billing (bill_id, patient_id, consultation, medicine, laboratory, total, status) VALUES (?, ?, ?, ?, ?, ?, ?)', [req.body.billId || publicId('BIL'), patient.id, consultation, medicine, laboratory, total, req.body.status || 'Recorded']); const [rows] = await pool.execute(`${select} WHERE b.id = ?`, [result.insertId]); res.status(201).json(rows[0]); }));

/* Update bill amounts and calculate the total again for administrators. */
router.put('/:id', authorize('admin'), asyncHandler(async (req, res) => { const consultation = Number(req.body.consultation ?? req.body.consultationFee ?? 0); const medicine = Number(req.body.medicine ?? req.body.medicineFee ?? 0); const laboratory = Number(req.body.laboratory ?? req.body.laboratoryFee ?? 0); const [result] = await pool.execute('UPDATE billing SET consultation = ?, medicine = ?, laboratory = ?, total = ?, status = COALESCE(?, status) WHERE id = ? OR bill_id = ?', [consultation, medicine, laboratory, consultation + medicine + laboratory, req.body.status || null, req.params.id, req.params.id]); if (!result.affectedRows) return res.status(404).json({ message: 'Bill not found.' }); const [rows] = await pool.execute(`${select} WHERE b.id = ? OR b.bill_id = ?`, [req.params.id, req.params.id]); res.json(rows[0]); }));

module.exports = router;
