const express = require('express');
const { pool } = require('../db');
const { authorize } = require('../middleware/auth');
const { asyncHandler, publicId, isDuplicate } = require('./helpers');

const router = express.Router();
const select = 'SELECT id, doctor_id AS doctorId, name, department, qualification, experience, phone, created_at AS createdAt FROM doctors';

/* List doctors for staff and patient appointment selection. */
router.get('/', asyncHandler(async (req, res) => { const [rows] = await pool.execute(`${select} ORDER BY name`); res.json(rows); }));

/* Retrieve one doctor by internal id or public doctor id. */
router.get('/:id', asyncHandler(async (req, res) => { const [rows] = await pool.execute(`${select} WHERE id = ? OR doctor_id = ?`, [req.params.id, req.params.id]); if (!rows.length) return res.status(404).json({ message: 'Doctor not found.' }); res.json(rows[0]); }));

/* Create a doctor for administrators. */
router.post('/', authorize('admin'), asyncHandler(async (req, res) => { const { name, department, qualification, experience, phone } = req.body; if (!name || !department) return res.status(400).json({ message: 'Name and department are required.' }); try { const [result] = await pool.execute('INSERT INTO doctors (doctor_id, name, department, qualification, experience, phone) VALUES (?, ?, ?, ?, ?, ?)', [req.body.doctorId || publicId('DOC'), name.trim(), department, qualification || null, experience || null, phone || null]); const [rows] = await pool.execute(`${select} WHERE id = ?`, [result.insertId]); res.status(201).json(rows[0]); } catch (error) { if (isDuplicate(error)) return res.status(409).json({ message: 'Doctor ID already exists.' }); throw error; } }));

/* Update a doctor for administrators. */
router.put('/:id', authorize('admin'), asyncHandler(async (req, res) => { const { name, department, qualification, experience, phone } = req.body; const [result] = await pool.execute('UPDATE doctors SET name = ?, department = ?, qualification = ?, experience = ?, phone = ? WHERE id = ? OR doctor_id = ?', [name, department, qualification || null, experience || null, phone || null, req.params.id, req.params.id]); if (!result.affectedRows) return res.status(404).json({ message: 'Doctor not found.' }); const [rows] = await pool.execute(`${select} WHERE id = ? OR doctor_id = ?`, [req.params.id, req.params.id]); res.json(rows[0]); }));

/* Delete a doctor for administrators. */
router.delete('/:id', authorize('admin'), asyncHandler(async (req, res) => { const [result] = await pool.execute('DELETE FROM doctors WHERE id = ? OR doctor_id = ?', [req.params.id, req.params.id]); if (!result.affectedRows) return res.status(404).json({ message: 'Doctor not found.' }); res.json({ message: 'Doctor deleted successfully.' }); }));

module.exports = router;
