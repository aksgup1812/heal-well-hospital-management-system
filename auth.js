const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../db');
const { authenticate } = require('../middleware/auth');
const { asyncHandler, publicId, isDuplicate } = require('./helpers');

const router = express.Router();

/* Build a short-lived JWT for a successfully authenticated user. */
function createToken(user) {
  return jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '8h' });
}

/* Register a patient using name, phone, and password; phone is the login id. */
router.post('/register', asyncHandler(async (req, res) => {
  const { name, phone, password } = req.body;
  const normalizedPhone = String(phone || '').replace(/\D/g, '');
  if (!name || normalizedPhone.length < 7 || !password || password.length < 6) return res.status(400).json({ message: 'Name, valid phone number, and a password of at least 6 characters are required.' });
  const passwordHash = await bcrypt.hash(password, 10);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [userResult] = await connection.execute('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', [normalizedPhone, passwordHash, 'patient']);
    const patientId = publicId('PATIENT');
    await connection.execute('INSERT INTO patients (user_id, patient_id, name, phone) VALUES (?, ?, ?, ?)', [userResult.insertId, patientId, name.trim(), normalizedPhone]);
    await connection.commit();
    const user = { id: userResult.insertId, username: normalizedPhone, role: 'patient' };
    res.status(201).json({ token: createToken(user), user: { ...user, name: name.trim(), patientId } });
  } catch (error) {
    await connection.rollback();
    if (isDuplicate(error)) return res.status(409).json({ message: 'An account already exists for this phone number.' });
    throw error;
  } finally { connection.release(); }
}));

/* Log in an administrator, doctor, or patient with username/phone and password. */
router.post('/login', asyncHandler(async (req, res) => {
  const identifier = String(req.body.username || req.body.phone || '').trim();
  const [users] = await pool.execute('SELECT * FROM users WHERE username = ? LIMIT 1', [identifier]);
  if (!users.length || !(await bcrypt.compare(String(req.body.password || ''), users[0].password))) return res.status(401).json({ message: 'Invalid credentials.' });
  const user = users[0];
  const [patients] = user.role === 'patient' ? await pool.execute('SELECT patient_id, name, phone FROM patients WHERE user_id = ?', [user.id]) : [[]];
  res.json({ token: createToken(user), user: { id: user.id, username: user.username, role: user.role, name: patients[0]?.name || user.username, patientId: patients[0]?.patient_id || null, phone: patients[0]?.phone || null } });
}));

/* Return the authenticated account and linked patient profile when present. */
router.get('/me', authenticate, asyncHandler(async (req, res) => {
  res.json({ user: { ...req.user, password: undefined, patient: req.user.patient || null } });
}));

module.exports = router;
