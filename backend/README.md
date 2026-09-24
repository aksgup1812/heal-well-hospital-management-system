# Heal Well Hospital Backend

Node.js, Express, and MySQL backend for the Heal Well Hospital Management System. The backend provides shared role-based data for the public site, patient portal, doctor portal, and admin dashboard.

## Requirements

- Node.js 18 or newer
- MySQL 8 or newer

## Setup

1. Start MySQL.
2. From this folder, create the database:

```bash
mysql -u root -p < database.sql
```

3. Copy `.env.example` to `.env` and set `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `JWT_SECRET`, and `PORT`.
4. Install dependencies and start the API:

```bash
npm install
npm start
```

Use `npm run dev` during development. The API runs at `http://localhost:5000` and serves the parent frontend directory. On first startup it creates demo administrator, doctor, patient, doctors, schedules, and sample operational records when they do not already exist.

## Authentication and Roles

Use the token returned by login on protected requests:

```text
Authorization: Bearer YOUR_JWT_TOKEN
```

- `admin`: full CRUD access and dashboard reports.
- `doctor`: assigned patient and appointment queue, consultation workflow, lab requests, schedule, and leave management.
- `patient`: own profile, appointments, live availability, laboratory results, prescriptions, and bills.

Patient and doctor routes are scoped in middleware and SQL queries. The admin dashboard endpoint returns `403` for non-admin users.

## Authentication Endpoints

- `POST /api/auth/login` — login with administrator/doctor username or patient phone plus password.
- `POST /api/auth/register` — create a patient account with `name`, `phone`, and `password`; no username is required.
- `GET /api/auth/me` — return the authenticated account and linked profile.

## Public and Portal Endpoints

- `GET /api/public/doctors` — public doctor cards without private account fields.
- `GET /api/public/stats` — safe public summary statistics.
- `GET /api/patient/summary` — patient profile, appointments, labs, bills, and prescriptions.
- `GET /api/doctor/summary` — doctor profile, today’s queue, schedule, leaves, and emergency cases.
- `GET /api/doctor/appointments` — doctor queue for a selected date.
- `GET /api/doctor/patients/:id` — assigned patient details and history.
- `GET /api/doctor/schedule` and `PUT /api/doctor/schedule` — read/update doctor working hours.
- `GET /api/doctor/leaves` and `POST|DELETE /api/doctor/leaves/:date` — manage doctor leave dates.
- `POST /api/doctor/appointments/:id/consultation` — save consultation notes, diagnosis, prescription, and lab requests.

## Appointment Contract

- `GET /api/appointments/availability?doctorId=1&date=2026-09-09` returns 30-minute slots with `booked`, `available`, and `reason` fields.
- `POST /api/appointments` creates a patient booking after validating date, working hours, leave, and slot availability.
- `PUT /api/appointments/:id/cancel` cancels an owned patient appointment while preserving history.
- `PUT /api/appointments/:id/reschedule` reschedules an owned patient appointment through the same availability checks.
- Staff may use `PUT /api/appointments/:id` for operational updates.

If another user books the same doctor/date/time between the availability check and insert, the database unique index rejects the duplicate and the API returns HTTP `409` with an actionable conflict message. Cancelled and no-show appointments do not reserve the slot.

## Operational Endpoints

- `GET|POST|PUT|DELETE /api/patients` and `GET|PUT|DELETE /api/patients/:id`
- `GET|POST|PUT|DELETE /api/doctors` and `GET|PUT|DELETE /api/doctors/:id`
- `GET|POST|PUT|DELETE /api/appointments` and `GET|PUT|DELETE /api/appointments/:id`
- `GET|POST|PUT|DELETE /api/emergency` and `PUT|DELETE /api/emergency/:id`
- `GET|POST|PUT|DELETE /api/medicines` and `PUT|DELETE /api/medicines/:id`
- `GET|POST|PUT|DELETE /api/laboratory` and `PUT|DELETE /api/laboratory/:id`
- `GET|POST|PUT /api/billing` and `GET|PUT /api/billing/:id`
- `GET /api/dashboard` — admin-only statistics and activity.
- `GET /api/health` — database/API health check.

## Schema Notes

`database.sql` includes `doctor_schedules`, `doctor_leaves`, and `consultations`. The appointments table contains an indexed generated `active_slot_key` built from doctor, date, and time only when status is not `Cancelled` or `No Show`. Existing databases receive additive schema upgrades on startup where possible.
