CREATE DATABASE IF NOT EXISTS heal_well_hospital CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE heal_well_hospital;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(100) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  role ENUM('admin', 'doctor', 'patient') NOT NULL DEFAULT 'patient',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS patients (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL UNIQUE,
  patient_id VARCHAR(60) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  age INT NULL,
  gender VARCHAR(30) NULL,
  phone VARCHAR(30) NOT NULL,
  address VARCHAR(255) NULL,
  disease VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_patients_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS doctors (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL UNIQUE,
  doctor_id VARCHAR(60) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  department VARCHAR(120) NOT NULL,
  qualification VARCHAR(120) NULL,
  experience INT NULL,
  phone VARCHAR(30) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_doctors_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS appointments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  appointment_id VARCHAR(60) NOT NULL UNIQUE,
  patient_id INT NOT NULL,
  doctor_id INT NOT NULL,
  appointment_date DATE NOT NULL,
  appointment_time TIME NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'Pending',
  reason VARCHAR(255) NULL,
  booking_source VARCHAR(60) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  active_slot_key VARCHAR(200) GENERATED ALWAYS AS (CASE WHEN status NOT IN ('Cancelled', 'No Show') THEN CONCAT(doctor_id, ':', appointment_date, ':', appointment_time) ELSE NULL END) STORED,
  CONSTRAINT fk_appointments_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  CONSTRAINT fk_appointments_doctor FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE RESTRICT,
  UNIQUE KEY uq_active_appointment_slot (active_slot_key),
  KEY idx_appointments_doctor_date (doctor_id, appointment_date)
);

CREATE TABLE IF NOT EXISTS doctor_schedules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  doctor_id INT NOT NULL,
  day_of_week TINYINT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  slot_duration INT NOT NULL DEFAULT 30,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_schedule_doctor FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE,
  UNIQUE KEY uq_doctor_schedule (doctor_id, day_of_week, start_time, end_time)
);

CREATE TABLE IF NOT EXISTS doctor_leaves (
  id INT AUTO_INCREMENT PRIMARY KEY,
  doctor_id INT NOT NULL,
  leave_date DATE NOT NULL,
  reason VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_leave_doctor FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE,
  UNIQUE KEY uq_doctor_leave (doctor_id, leave_date)
);

CREATE TABLE IF NOT EXISTS consultations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  appointment_id INT NOT NULL UNIQUE,
  doctor_id INT NOT NULL,
  patient_id INT NOT NULL,
  symptoms TEXT NULL,
  diagnosis TEXT NULL,
  notes TEXT NULL,
  prescription TEXT NULL,
  recommended_tests TEXT NULL,
  follow_up_date DATE NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'Draft',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_consultation_appointment FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
  CONSTRAINT fk_consultation_doctor FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE,
  CONSTRAINT fk_consultation_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS emergency_cases (
  id INT AUTO_INCREMENT PRIMARY KEY,
  emergency_id VARCHAR(60) NOT NULL UNIQUE,
  patient VARCHAR(150) NOT NULL,
  priority VARCHAR(20) NOT NULL,
  `condition` VARCHAR(255) NOT NULL,
  phone VARCHAR(30) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS medicines (
  id INT AUTO_INCREMENT PRIMARY KEY,
  medicine_id VARCHAR(60) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  company VARCHAR(150) NULL,
  price DECIMAL(10, 2) NOT NULL DEFAULT 0,
  quantity INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS laboratory (
  id INT AUTO_INCREMENT PRIMARY KEY,
  test_id VARCHAR(60) NOT NULL UNIQUE,
  patient_id INT NOT NULL,
  test_name VARCHAR(150) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'Pending',
  result VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_laboratory_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS billing (
  id INT AUTO_INCREMENT PRIMARY KEY,
  bill_id VARCHAR(60) NOT NULL UNIQUE,
  patient_id INT NOT NULL,
  consultation DECIMAL(10, 2) NOT NULL DEFAULT 0,
  medicine DECIMAL(10, 2) NOT NULL DEFAULT 0,
  laboratory DECIMAL(10, 2) NOT NULL DEFAULT 0,
  total DECIMAL(10, 2) NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'Recorded',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_billing_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
);
