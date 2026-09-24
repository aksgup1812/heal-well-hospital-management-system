require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const path = require('path');
const { pool, testConnection } = require('./db');
const { authenticate } = require('./middleware/auth');

const authRoutes = require('./routes/auth');
const patientsRoutes = require('./routes/patients');
const doctorsRoutes = require('./routes/doctors');
const appointmentsRoutes = require('./routes/appointments');
const emergencyRoutes = require('./routes/emergency');
const medicinesRoutes = require('./routes/medicines');
const laboratoryRoutes = require('./routes/laboratory');
const billingRoutes = require('./routes/billing');
const publicRoutes = require('./routes/public');
const patientRoutes = require('./routes/patient');
const doctorRoutes = require('./routes/doctor');

const app = express();
app.use(cors());
app.use(express.json());

/* Verify the database and create a safe demo administrator/patient for first run. */
async function initializeDemoAccounts() {
  const [adminRows] = await pool.execute('SELECT id FROM users WHERE username = ?', ['admin']);
  if (!adminRows.length) await pool.execute('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', ['admin', await bcrypt.hash('admin123', 10), 'admin']);
  const [patientRows] = await pool.execute('SELECT id FROM users WHERE username = ?', ['9999999999']);
  if (!patientRows.length) {
    const [userResult] = await pool.execute('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', ['9999999999', await bcrypt.hash('patient123', 10), 'patient']);
    await pool.execute('INSERT INTO patients (user_id, patient_id, name, phone) VALUES (?, ?, ?, ?)', [userResult.insertId, 'PATIENT-DEMO', 'Demo Patient', '9999999999']);
  }
  const [doctorUserRows] = await pool.execute('SELECT id FROM users WHERE username = ?', ['doctor']);
  if (!doctorUserRows.length) await pool.execute('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', ['doctor', await bcrypt.hash('doctor123', 10), 'doctor']);
  const demoDoctors = [
    ['DOC-1001', 'Dr. Ananya Rao', 'Cardiology', 'MD, DM', 12, '9811122233'],
    ['DOC-1002', 'Dr. Vikram Mehta', 'Orthopedics', 'MS Ortho', 9, '9822233344'],
    ['DOC-1003', 'Dr. Neha Kapoor', 'General Medicine', 'MD Medicine', 8, '9833344455'],
    ['DOC-1004', 'Dr. Rohan Iyer', 'Neurology', 'DM Neurology', 14, '9844455566'],
    ['DOC-1005', 'Dr. Meera Shah', 'Pediatrics', 'MD Pediatrics', 11, '9855566677'],
    ['DOC-1006', 'Dr. Arjun Malhotra', 'Oncology', 'DM Oncology', 15, '9866677788'],
    ['DOC-1007', 'Dr. Kavya Menon', 'Gynecology', 'MS Gynecology', 10, '9877788899'],
    ['DOC-1008', 'Dr. Sameer Patel', 'Dermatology', 'MD Dermatology', 7, '9888899900']
  ];
  for (const doctor of demoDoctors) await pool.execute('INSERT IGNORE INTO doctors (doctor_id, name, department, qualification, experience, phone) VALUES (?, ?, ?, ?, ?, ?)', doctor);
  const [doctorUser] = await pool.execute('SELECT id FROM users WHERE username = ? LIMIT 1', ['doctor']);
  const [linkedDoctor] = await pool.execute('SELECT id FROM doctors WHERE doctor_id = ? LIMIT 1', ['DOC-1001']);
  if (doctorUser.length && linkedDoctor.length) await pool.execute('UPDATE doctors SET user_id = ? WHERE id = ? AND (user_id IS NULL OR user_id = ?)', [doctorUser[0].id, linkedDoctor[0].id, doctorUser[0].id]);
  const [scheduleDoctors] = await pool.execute('SELECT id FROM doctors');
  const defaultSchedules = [[1, '09:00:00', '13:00:00'], [1, '14:00:00', '17:00:00'], [2, '09:00:00', '13:00:00'], [2, '14:00:00', '17:00:00'], [3, '09:00:00', '13:00:00'], [3, '14:00:00', '17:00:00'], [4, '09:00:00', '13:00:00'], [4, '14:00:00', '17:00:00'], [5, '09:00:00', '13:00:00'], [5, '14:00:00', '17:00:00'], [6, '09:00:00', '12:00:00']];
  for (const doctor of scheduleDoctors) {
    for (const [dayOfWeek, startTime, endTime] of defaultSchedules) await pool.execute('INSERT IGNORE INTO doctor_schedules (doctor_id, day_of_week, start_time, end_time, slot_duration) VALUES (?, ?, ?, ?, ?)', [doctor.id, dayOfWeek, startTime, endTime, 30]);
  }
}

/* Apply additive schema changes when an older college-project database already exists. */
async function ensureSchemaUpgrades() {
  const statements = [
    'ALTER TABLE doctors ADD COLUMN user_id INT NULL UNIQUE',
    'ALTER TABLE doctors ADD CONSTRAINT fk_doctors_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL',
    'ALTER TABLE appointments ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
    "ALTER TABLE appointments ADD COLUMN active_slot_key VARCHAR(200) GENERATED ALWAYS AS (CASE WHEN status NOT IN ('Cancelled', 'No Show') THEN CONCAT(doctor_id, ':', appointment_date, ':', appointment_time) ELSE NULL END) STORED",
    'ALTER TABLE appointments ADD UNIQUE KEY uq_active_appointment_slot (active_slot_key)',
    'ALTER TABLE appointments ADD KEY idx_appointments_doctor_date (doctor_id, appointment_date)',
    `CREATE TABLE IF NOT EXISTS doctor_schedules (id INT AUTO_INCREMENT PRIMARY KEY, doctor_id INT NOT NULL, day_of_week TINYINT NOT NULL, start_time TIME NOT NULL, end_time TIME NOT NULL, slot_duration INT NOT NULL DEFAULT 30, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, CONSTRAINT fk_schedule_doctor FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE, UNIQUE KEY uq_doctor_schedule (doctor_id, day_of_week, start_time, end_time))`,
    `CREATE TABLE IF NOT EXISTS doctor_leaves (id INT AUTO_INCREMENT PRIMARY KEY, doctor_id INT NOT NULL, leave_date DATE NOT NULL, reason VARCHAR(255) NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, CONSTRAINT fk_leave_doctor FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE, UNIQUE KEY uq_doctor_leave (doctor_id, leave_date))`,
    `CREATE TABLE IF NOT EXISTS consultations (id INT AUTO_INCREMENT PRIMARY KEY, appointment_id INT NOT NULL UNIQUE, doctor_id INT NOT NULL, patient_id INT NOT NULL, symptoms TEXT NULL, diagnosis TEXT NULL, notes TEXT NULL, prescription TEXT NULL, recommended_tests TEXT NULL, follow_up_date DATE NULL, status VARCHAR(30) NOT NULL DEFAULT 'Draft', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, CONSTRAINT fk_consultation_appointment FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE, CONSTRAINT fk_consultation_doctor FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE, CONSTRAINT fk_consultation_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE)`
  ];
  for (const statement of statements) {
    try { await pool.execute(statement); } catch (error) {
      if (!['ER_DUP_FIELDNAME', 'ER_DUP_KEYNAME', 'ER_CANT_CREATE_TABLE', 'ER_TABLE_EXISTS_ERROR', 'ER_FK_DUP_NAME'].includes(error.code)) throw error;
    }
  }
}

app.get('/api/health', (req, res) => res.json({ status: 'ok', service: 'Heal Well Hospital API' }));
app.use('/api/public', publicRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/patients', authenticate, patientsRoutes);
app.use('/api/patient', authenticate, patientRoutes);
app.use('/api/doctors', authenticate, doctorsRoutes);
app.use('/api/appointments', authenticate, appointmentsRoutes);
app.use('/api/doctor', authenticate, doctorRoutes);
app.use('/api/emergency', authenticate, emergencyRoutes);
app.use('/api/medicines', authenticate, medicinesRoutes);
app.use('/api/laboratory', authenticate, laboratoryRoutes);
app.use('/api/billing', authenticate, billingRoutes);

/* Return dashboard counts from MySQL for administrators and doctors only. */
app.get('/api/dashboard', authenticate, async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'The management dashboard is restricted to administrators.' });
    const [[patients]] = await pool.execute('SELECT COUNT(*) AS total FROM patients');
    const [[doctors]] = await pool.execute('SELECT COUNT(*) AS total FROM doctors');
    const [[appointments]] = await pool.execute('SELECT COUNT(*) AS total FROM appointments');
    const [[medicines]] = await pool.execute('SELECT COUNT(*) AS total FROM medicines');
    const [[laboratory]] = await pool.execute('SELECT COUNT(*) AS total FROM laboratory');
    const [[revenue]] = await pool.execute('SELECT COALESCE(SUM(total), 0) AS total FROM billing');
    res.json({ patients: Number(patients.total), doctors: Number(doctors.total), appointments: Number(appointments.total), medicines: Number(medicines.total), laboratory: Number(laboratory.total), revenue: Number(revenue.total) });
  } catch (error) { next(error); }
});

/* Serve the static Heal Well website from the same port as the API. */
app.use(express.static(path.join(__dirname, '..')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '..', 'index.html')));

/* Convert unexpected errors into a consistent JSON response. */
app.use((error, req, res, next) => { console.error(error); if (res.headersSent) return next(error); res.status(error.status || 500).json({ message: 'Server error.', detail: process.env.NODE_ENV === 'development' ? error.message : undefined }); });

/* Start the website even when MySQL is not ready so LocalStorage fallback remains usable. */
async function start() {
  const port = Number(process.env.PORT || 5000);
  try {
    await testConnection();
    await ensureSchemaUpgrades();
    await initializeDemoAccounts();
    console.log('MySQL database connected. Demo accounts are ready.');
  } catch (error) {
    console.error(`MySQL is unavailable: ${error.message}`);
    console.error('The frontend will use LocalStorage fallback data until MySQL is configured.');
  }
  app.listen(port, () => console.log(`Heal Well website and backend running at http://localhost:${port}`));
}

if (require.main === module) start().catch((error) => { console.error('Unable to start API:', error.message); process.exitCode = 1; });
module.exports = { app, start };
