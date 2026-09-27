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


/* Start the website immediately, then initialize the hosted database without blocking health checks. */
function start() {
  const port = Number(process.env.PORT || 5000);
  const server = app.listen(port, () => console.log(`Heal Well website and backend running at http://localhost:${port}`));
  (async () => {
    try {
      await testConnection();
      await initializeDatabase();
      await ensureSchemaUpgrades();
      await initializeDemoAccounts();
      console.log('MySQL database connected. Demo accounts are ready.');
    } catch (error) {
      console.error(`MySQL is unavailable: ${error.message}`);
      console.error('The frontend will use LocalStorage fallback data until MySQL is configured.');
    }
  })();
  return server;
}

if (require.main === module) start();
module.exports = { app, start };

