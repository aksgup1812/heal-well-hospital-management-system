const jwt = require('jsonwebtoken');
const { pool } = require('../db');

/* Verify the bearer token and attach the current user to the request. */
async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ message: 'Authentication required.' });
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const [users] = await pool.execute('SELECT id, username, role, created_at FROM users WHERE id = ?', [payload.id]);
    if (!users.length) return res.status(401).json({ message: 'User account no longer exists.' });
    req.user = users[0];
    if (req.user.role === 'patient') {
      const [patients] = await pool.execute('SELECT id, patient_id, name, phone FROM patients WHERE user_id = ?', [req.user.id]);
      req.user.patient = patients[0] || null;
    }
    if (req.user.role === 'doctor') {
      const [doctors] = await pool.execute('SELECT id, doctor_id, name, department, qualification, experience FROM doctors WHERE user_id = ? OR doctor_id = ? LIMIT 1', [req.user.id, req.user.username]);
      req.user.doctor = doctors[0] || null;
    }
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired token.' });
  }
}

/* Restrict a route to the listed roles. Authentication runs first. */
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) return res.status(403).json({ message: 'You do not have permission for this action.' });
    next();
  };
}

module.exports = { authenticate, authorize };
