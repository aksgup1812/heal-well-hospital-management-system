const express = require('express');
const { pool } = require('../db');
const { authorize } = require('../middleware/auth');
const { asyncHandler, publicId, isDuplicate } = require('./helpers');

const router = express.Router();
const select = 'SELECT id, medicine_id AS medicineId, name AS medicineName, company, price, quantity, created_at AS createdAt FROM medicines';

/* List medicine inventory for authenticated users. */
router.get('/', authorize('admin', 'doctor'), asyncHandler(async (req, res) => { const [rows] = await pool.execute(`${select} ORDER BY name`); res.json(rows); }));

/* Create a medicine inventory item for administrators. */
router.post('/', authorize('admin'), asyncHandler(async (req, res) => { const { medicineName, name, company, price, quantity } = req.body; if (!(medicineName || name) || price === undefined) return res.status(400).json({ message: 'Medicine name and price are required.' }); try { const [result] = await pool.execute('INSERT INTO medicines (medicine_id, name, company, price, quantity) VALUES (?, ?, ?, ?, ?)', [req.body.medicineId || publicId('MED'), medicineName || name, company || null, price, quantity || 0]); const [rows] = await pool.execute(`${select} WHERE id = ?`, [result.insertId]); res.status(201).json(rows[0]); } catch (error) { if (isDuplicate(error)) return res.status(409).json({ message: 'Medicine ID already exists.' }); throw error; } }));

/* Update medicine price, company, or quantity for administrators. */
router.put('/:id', authorize('admin'), asyncHandler(async (req, res) => { const { medicineName, name, company, price, quantity } = req.body; const [result] = await pool.execute('UPDATE medicines SET name = COALESCE(?, name), company = COALESCE(?, company), price = COALESCE(?, price), quantity = COALESCE(?, quantity) WHERE id = ? OR medicine_id = ?', [medicineName || name || null, company || null, price ?? null, quantity ?? null, req.params.id, req.params.id]); if (!result.affectedRows) return res.status(404).json({ message: 'Medicine not found.' }); const [rows] = await pool.execute(`${select} WHERE id = ? OR medicine_id = ?`, [req.params.id, req.params.id]); res.json(rows[0]); }));

/* Delete a medicine inventory item for administrators. */
router.delete('/:id', authorize('admin'), asyncHandler(async (req, res) => { const [result] = await pool.execute('DELETE FROM medicines WHERE id = ? OR medicine_id = ?', [req.params.id, req.params.id]); if (!result.affectedRows) return res.status(404).json({ message: 'Medicine not found.' }); res.json({ message: 'Medicine deleted successfully.' }); }));

module.exports = router;
