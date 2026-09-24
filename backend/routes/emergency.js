const express = require('express');
const { pool } = require('../db');
const { authorize } = require('../middleware/auth');
const { asyncHandler, publicId } = require('./helpers');

const router = express.Router();
const select = 'SELECT id, emergency_id AS emergencyId, patient, priority, condition, phone, created_at AS createdAt FROM emergency_cases';

/* List emergency cases in priority order for staff. */
router.get('/', authorize('admin', 'doctor'), asyncHandler(async (req, res) => { const [rows] = await pool.execute(`${select} ORDER BY FIELD(priority, 'High', 'Medium', 'Low'), id DESC`); res.json(rows); }));

/* Create an emergency case for administrators. */
router.post('/', authorize('admin'), asyncHandler(async (req, res) => { const { patient, priority, condition, phone } = req.body; if (!patient || !priority || !condition) return res.status(400).json({ message: 'Patient, priority, and condition are required.' }); const [result] = await pool.execute('INSERT INTO emergency_cases (emergency_id, patient, priority, `condition`, phone) VALUES (?, ?, ?, ?, ?)', [req.body.emergencyId || publicId('EMR'), patient, priority, condition, phone || null]); const [rows] = await pool.execute(`${select} WHERE id = ?`, [result.insertId]); res.status(201).json(rows[0]); }));

/* Update an emergency case for administrators. */
router.put('/:id', authorize('admin'), asyncHandler(async (req, res) => { const [result] = await pool.execute('UPDATE emergency_cases SET patient = COALESCE(?, patient), priority = COALESCE(?, priority), `condition` = COALESCE(?, `condition`), phone = COALESCE(?, phone) WHERE id = ? OR emergency_id = ?', [req.body.patient || null, req.body.priority || null, req.body.condition || null, req.body.phone || null, req.params.id, req.params.id]); if (!result.affectedRows) return res.status(404).json({ message: 'Emergency case not found.' }); const [rows] = await pool.execute(`${select} WHERE id = ? OR emergency_id = ?`, [req.params.id, req.params.id]); res.json(rows[0]); }));

/* Delete an emergency case for administrators. */
router.delete('/:id', authorize('admin'), asyncHandler(async (req, res) => { const [result] = await pool.execute('DELETE FROM emergency_cases WHERE id = ? OR emergency_id = ?', [req.params.id, req.params.id]); if (!result.affectedRows) return res.status(404).json({ message: 'Emergency case not found.' }); res.json({ message: 'Emergency case deleted successfully.' }); }));

module.exports = router;
