const express = require('express');
const { pool } = require('../db');
const { asyncHandler } = require('./helpers');

const router = express.Router();

/* Expose only the public doctor profile fields used by the homepage. */
router.get('/doctors', asyncHandler(async (req, res) => {
  const [rows] = await pool.execute('SELECT doctor_id AS doctorId, name, department, qualification, experience FROM doctors ORDER BY name');
  res.json(rows);
}));

/* Return safe public hospital counts without exposing patient information. */
router.get('/stats', asyncHandler(async (req, res) => {
  const [[doctors]] = await pool.execute('SELECT COUNT(*) AS total FROM doctors');
  const [[patients]] = await pool.execute('SELECT COUNT(*) AS total FROM patients');
  const [[specialties]] = await pool.execute('SELECT COUNT(DISTINCT department) AS total FROM doctors');
  res.json({ doctors: Number(doctors.total), patients: Number(patients.total), specialties: Number(specialties.total) });
}));

module.exports = router;
