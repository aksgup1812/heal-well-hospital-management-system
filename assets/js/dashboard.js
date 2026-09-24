/* Hospital Management System: client-side data layer and dashboard controller. */
(() => {
  'use strict';
  if (localStorage.getItem('hmsLoggedIn') !== 'true') { window.location.replace('index.html'); return; }
  if (localStorage.getItem('hmsRole') === 'patient') { window.location.replace('patient-portal.html'); return; }
  if (localStorage.getItem('hmsRole') === 'doctor') { window.location.replace('doctor-portal.html'); return; }

  const $ = (selector, parent = document) => parent.querySelector(selector);
  const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];
  const storeKey = (name) => `hms_${name}`;
  const getRecords = (name) => JSON.parse(localStorage.getItem(storeKey(name)) || '[]');
  const setRecords = (name, data) => { localStorage.setItem(storeKey(name), JSON.stringify(data)); window.HMS_API?.notifySync?.(storeKey(name)); };
  const apiPaths = { patients: '/patients', doctors: '/doctors', appointments: '/appointments', emergency: '/emergency', laboratory: '/laboratory', pharmacy: '/medicines', billing: '/billing' };
  const isPatientUser = localStorage.getItem('hmsRole') === 'patient';
  const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  const humanize = (text) => text.replace(/([A-Z])/g, ' $1').replace(/^./, char => char.toUpperCase());
  /* Local modal controller avoids any dependency on Bootstrap's JavaScript bundle. */
  const setModalState = (selector, isOpen) => {
    const element = $(selector);
    element.classList.toggle('hms-modal-open', isOpen);
    element.setAttribute('aria-hidden', String(!isOpen));
  };
  const modal = { show: () => setModalState('#recordModal', true), hide: () => setModalState('#recordModal', false) };
  const invoiceModal = { show: () => setModalState('#invoiceModal', true), hide: () => setModalState('#invoiceModal', false) };
  let activeView = 'dashboard';
  let activeEditId = null;
  let chartInstances = [];
  let backendAvailable = false;
  let syncInFlight = false;

  const modules = {
    patients: { title: 'Patient Management', icon: 'fa-bed-pulse', id: 'patientId', prefix: 'PAT', singular: 'Patient', description: 'Register and manage patient records.', fields: [
      ['name', 'Full Name', 'text', true], ['age', 'Age', 'number', true], ['gender', 'Gender', 'select', true, ['Male', 'Female', 'Other']], ['phone', 'Phone', 'tel', true], ['address', 'Address', 'text', true], ['disease', 'Disease / Condition', 'text', true]
    ], columns: ['patientId', 'name', 'age', 'gender', 'phone', 'disease'] },
    doctors: { title: 'Doctor Management', icon: 'fa-user-doctor', id: 'doctorId', prefix: 'DOC', singular: 'Doctor', description: 'Maintain doctor profiles and departments.', fields: [
      ['name', 'Full Name', 'text', true], ['department', 'Department', 'text', true], ['qualification', 'Qualification', 'text', true], ['experience', 'Experience (Years)', 'number', true], ['phone', 'Phone', 'tel', true]
    ], columns: ['doctorId', 'name', 'department', 'qualification', 'experience', 'phone'] },
    appointments: { title: 'Appointment Management', icon: 'fa-calendar-check', id: 'appointmentId', prefix: 'APT', singular: 'Appointment', description: 'Schedule and track patient consultations.', fields: [
      ['patient', 'Patient', 'patientSelect', true], ['doctor', 'Doctor', 'doctorSelect', true], ['date', 'Date', 'date', true], ['time', 'Time', 'time', true], ['status', 'Status', 'select', true, ['Pending', 'Completed', 'Cancelled']]
    ], columns: ['appointmentId', 'patient', 'department', 'doctor', 'date', 'time', 'reason', 'status', 'bookingSource'] },
    emergency: { title: 'Emergency Queue', icon: 'fa-truck-medical', id: 'emergencyId', prefix: 'EMR', singular: 'Emergency Case', description: 'Priority queue — high priority cases are displayed first.', fields: [
      ['patient', 'Patient Name', 'text', true], ['priority', 'Priority', 'select', true, ['High', 'Medium', 'Low']], ['condition', 'Emergency Condition', 'text', true], ['phone', 'Contact Phone', 'tel', true]
    ], columns: ['emergencyId', 'patient', 'priority', 'condition', 'phone'], priority: true },
    laboratory: { title: 'Laboratory', icon: 'fa-flask-vial', id: 'testId', prefix: 'LAB', singular: 'Lab Test', description: 'Record diagnostic tests and their results.', fields: [
      ['patient', 'Patient', 'patientSelect', true], ['testName', 'Test Name', 'text', true], ['status', 'Status', 'select', true, ['Pending', 'Completed']], ['result', 'Result', 'text', false]
    ], columns: ['testId', 'patient', 'testName', 'status', 'result'] },
    pharmacy: { title: 'Pharmacy Inventory', icon: 'fa-pills', id: 'medicineId', prefix: 'MED', singular: 'Medicine', description: 'Manage medicine inventory and stock quantities.', fields: [
      ['medicineName', 'Medicine Name', 'text', true], ['company', 'Company', 'text', true], ['price', 'Unit Price (₹)', 'number', true, null, '0.01'], ['quantity', 'Quantity in Stock', 'number', true, null, '1']
    ], columns: ['medicineId', 'medicineName', 'company', 'price', 'quantity'] },
    billing: { title: 'Billing', icon: 'fa-file-invoice-dollar', id: 'billId', prefix: 'BIL', singular: 'Bill', description: 'Create patient bills and print detailed invoices.', fields: [
      ['patient', 'Patient', 'patientSelect', true], ['consultationFee', 'Consultation Fee (₹)', 'number', true, null, '0'], ['medicineFee', 'Medicine Fee (₹)', 'number', true, null, '0'], ['laboratoryFee', 'Laboratory Fee (₹)', 'number', true, null, '0']
    ], columns: ['billId', 'patient', 'consultationFee', 'medicineFee', 'laboratoryFee', 'total'], bill: true }
  };

  /* Seed a few records once so the project opens with a useful dashboard. */
  function seedData() {
    const demoDoctors = [{ doctorId: 'DOC-1001', name: 'Dr. Ananya Rao', department: 'Cardiology', qualification: 'MD, DM', experience: '12', phone: '9811122233' }, { doctorId: 'DOC-1002', name: 'Dr. Vikram Mehta', department: 'Orthopedics', qualification: 'MS Ortho', experience: '9', phone: '9822233344' }, { doctorId: 'DOC-1003', name: 'Dr. Neha Kapoor', department: 'General Medicine', qualification: 'MD Medicine', experience: '8', phone: '9833344455' }, { doctorId: 'DOC-1004', name: 'Dr. Rohan Iyer', department: 'Neurology', qualification: 'DM Neurology', experience: '14', phone: '9844455566' }, { doctorId: 'DOC-1005', name: 'Dr. Meera Shah', department: 'Pediatrics', qualification: 'MD Pediatrics', experience: '11', phone: '9855566677' }, { doctorId: 'DOC-1006', name: 'Dr. Arjun Malhotra', department: 'Oncology', qualification: 'DM Oncology', experience: '15', phone: '9866677788' }, { doctorId: 'DOC-1007', name: 'Dr. Kavya Menon', department: 'Gynecology', qualification: 'MS Gynecology', experience: '10', phone: '9877788899' }, { doctorId: 'DOC-1008', name: 'Dr. Sameer Patel', department: 'Dermatology', qualification: 'MD Dermatology', experience: '7', phone: '9888899900' }];
    if (localStorage.getItem('hmsSeeded')) {
      const doctors = getRecords('doctors'); const existingIds = new Set(doctors.map(doctor => doctor.doctorId)); const missingDoctors = demoDoctors.filter(doctor => !existingIds.has(doctor.doctorId));
      if (missingDoctors.length) setRecords('doctors', [...doctors, ...missingDoctors]);
      return;
    }
    if (!getRecords('patients').length) setRecords('patients', [{ patientId: 'PAT-1001', name: 'Aarav Sharma', age: '34', gender: 'Male', phone: '9876543210', address: 'MG Road, Bengaluru', disease: 'Viral Fever' }, { patientId: 'PAT-1002', name: 'Priya Nair', age: '28', gender: 'Female', phone: '9898989898', address: 'Kochi, Kerala', disease: 'Migraine' }]);
    if (!getRecords('doctors').length) setRecords('doctors', demoDoctors);
    if (!getRecords('appointments').length) setRecords('appointments', [{ appointmentId: 'APT-1001', patient: 'Aarav Sharma', doctor: 'Dr. Ananya Rao', date: new Date().toISOString().slice(0, 10), time: '10:30', status: 'Pending' }]);
    setRecords('emergency', [{ emergencyId: 'EMR-1001', patient: 'Rahul Verma', priority: 'High', condition: 'Chest Pain', phone: '9797979797' }]);
    setRecords('laboratory', [{ testId: 'LAB-1001', patient: 'Priya Nair', testName: 'Complete Blood Count', status: 'Completed', result: 'Normal' }]);
    setRecords('pharmacy', [{ medicineId: 'MED-1001', medicineName: 'Paracetamol 500mg', company: 'Cipla', price: '4.50', quantity: '120' }, { medicineId: 'MED-1002', medicineName: 'Amoxicillin 250mg', company: 'Sun Pharma', price: '12.00', quantity: '55' }]);
    setRecords('billing', [{ billId: 'BIL-1001', patient: 'Aarav Sharma', consultationFee: '500', medicineFee: '250', laboratoryFee: '350', total: '1100', createdAt: new Date().toLocaleDateString('en-IN') }]);
    localStorage.setItem('hmsActivities', JSON.stringify([{ text: 'System initialized with demo records', icon: 'fa-circle-check', time: 'Just now' }])); window.HMS_API?.notifySync?.('hmsActivities');
    localStorage.setItem('hmsSeeded', 'true');
  }

  /* Make a collision-free human-readable record identifier. */
  function nextId(name, prefix) {
    const values = getRecords(name).map(record => Number(String(record[modules[name].id]).split('-')[1]) || 1000);
    return `${prefix}-${Math.max(1000, ...values) + 1}`;
  }

  /* Add a timestamped activity to the small dashboard feed. */
  function logActivity(text, icon = 'fa-pen-to-square') {
    const activities = JSON.parse(localStorage.getItem('hmsActivities') || '[]');
    activities.unshift({ text, icon, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) });
    localStorage.setItem('hmsActivities', JSON.stringify(activities.slice(0, 8))); window.HMS_API?.notifySync?.('hmsActivities');
    renderNotifications();
  }

  function dataSignature() { return Object.keys(apiPaths).map(name => `${name}:${localStorage.getItem(storeKey(name)) || '[]'}`).join('|'); }
  function adminModalOpen() { return Boolean(document.querySelector('.hms-modal-open')); }
  function setLiveSyncStatus(message, state = 'online') { const element = $('#liveSyncStatus'); if (element) { element.innerHTML = `<i class="fa-solid fa-circle"></i> ${escapeHtml(message)}`; element.dataset.state = state; } }
  function sharedDataKey(key) { return key === 'hmsActivities' || Object.keys(apiPaths).some(name => key === storeKey(name)); }
  function renderNotifications() {
    const activities = JSON.parse(localStorage.getItem('hmsActivities') || '[]');
    const activityNotices = activities.slice(0, 3).map(item => `<div class="notice"><i class="fa-solid ${escapeHtml(item.icon || 'fa-circle-info')} text-primary me-1"></i>${escapeHtml(item.text)} <small class="d-block text-muted mt-1">${escapeHtml(item.time || 'Recently')}</small></div>`);
    const standardNotices = ['<div class="notice"><i class="fa-solid fa-circle-info text-primary me-1"></i> Hospital system is running normally.</div>', '<div class="notice"><i class="fa-solid fa-flask text-warning me-1"></i> Review pending laboratory results.</div>', '<div class="notice"><i class="fa-solid fa-calendar text-success me-1"></i> Check today’s appointment schedule.</div>'];
    $('#notificationList').innerHTML = [...activityNotices, ...standardNotices].join('');
  }

  /* Display a Bootstrap toast for user feedback. */
  function toast(message, type = 'success') {
    const id = `toast-${Date.now()}`;
    $('#toastArea').insertAdjacentHTML('beforeend', `<div id="${id}" class="toast" role="status"><i class="fa-solid fa-circle-${type === 'success' ? 'check' : 'exclamation'} me-2"></i>${escapeHtml(message)}</div>`);
    const element = $(`#${id}`); setTimeout(() => element?.remove(), 2600);
  }

  /* Format numbers consistently for currency cells and totals. */
  const currency = value => `₹${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const statusBadge = value => `<span class="badge-status ${value === 'High' ? 'priority-high' : value === 'Medium' ? 'priority-medium' : value === 'Low' ? 'priority-low' : `status-${String(value).toLowerCase()}`}">${escapeHtml(value)}</span>`;

  /* Produce the dashboard overview view. */
  function renderDashboard() {
    const stats = dashboardStats();
    const today = new Date().toISOString().slice(0, 10);
    const todayAppointments = getRecords('appointments').filter(item => item.date === today).length;
    const pendingLabs = getRecords('laboratory').filter(item => String(item.status).toLowerCase() !== 'completed').length;
    const lowStock = getRecords('pharmacy').filter(item => Number(item.quantity || 0) <= 20).length;
    const quickActions = isPatientUser
      ? '<div class="alert alert-info mb-0"><i class="fa-solid fa-eye me-2"></i>You are using patient view. Hospital data is available to read, but cannot be changed.</div>'
      : '<div class="row g-3"><div class="col-sm-6"><button class="quick-action" data-quick="patients"><i class="fa-solid fa-user-plus"></i> Add new patient</button></div><div class="col-sm-6"><button class="quick-action" data-quick="appointments"><i class="fa-regular fa-calendar-plus"></i> Schedule appointment</button></div><div class="col-sm-6"><button class="quick-action" data-quick="emergency"><i class="fa-solid fa-truck-medical"></i> Register emergency case</button></div><div class="col-sm-6"><button class="quick-action" data-quick="billing"><i class="fa-solid fa-file-circle-plus"></i> Create patient bill</button></div></div>';
    $('#viewContent').innerHTML = `
      <div class="welcome-card admin-hero mb-4"><div class="position-relative" style="z-index:1"><div class="d-flex justify-content-between flex-wrap gap-3"><div><span class="welcome-kicker"><i class="fa-solid fa-circle"></i> LIVE OPERATIONS OVERVIEW</span><p class="mb-1 mt-3 opacity-75">GOOD DAY, ADMINISTRATOR</p><h2 class="mb-2">Welcome to Heal Well Hospital</h2><p class="welcome-note mb-0 opacity-75">Here is a quick look at today's hospital activity and the actions that need your attention.</p><div class="welcome-insights"><div class="welcome-insight"><strong>${todayAppointments}</strong><span>Today's appointments</span></div><div class="welcome-insight"><strong>${pendingLabs}</strong><span>Pending lab tests</span></div><div class="welcome-insight"><strong>${lowStock}</strong><span>Low-stock medicines</span></div></div></div><div class="text-lg-end"><div class="clock" id="liveClock"></div><small class="opacity-75">Live system time</small></div></div></div></div>
      <div class="row g-3 my-1">${statCard('fa-bed-pulse', '#e3f5f3', '#137b86', stats.patients, 'Total Patients')}${statCard('fa-user-doctor', '#e9edff', '#5865c8', stats.doctors, 'Doctors')}${statCard('fa-calendar-check', '#fff1dc', '#d68b19', stats.appointments, 'Appointments')}${statCard('fa-indian-rupee-sign', '#e6f7e9', '#28904d', currency(stats.revenue), 'Total Revenue')}</div>
      <div class="row g-4 mt-1"><div class="col-xl-7"><div class="panel-card h-100"><div class="d-flex justify-content-between align-items-start mb-3"><div><h3 class="section-heading">${isPatientUser ? 'Patient Access' : 'Quick Actions'}</h3><p class="section-subtitle">${isPatientUser ? 'Read-only access to hospital information' : 'Frequently used hospital operations'}</p></div></div>${quickActions}<div class="chart-wrap mt-4"><canvas id="overviewChart"></canvas></div></div></div><div class="col-xl-5"><div class="panel-card h-100"><h3 class="section-heading">Recent Activity</h3><p class="section-subtitle mb-2">Latest changes in the system</p>${renderActivities()}</div></div></div>`;
    $$('.quick-action').forEach(button => button.addEventListener('click', () => { navigate(button.dataset.quick); openForm(button.dataset.quick); }));
    startClock(); renderOverviewChart(stats);
  }
  function statCard(icon, background, color, value, label) { return `<div class="col-sm-6 col-xl-3"><div class="stat-card dashboard-stat-card"><span class="stat-icon" style="background:${background};color:${color}"><i class="fa-solid ${icon}"></i></span><div><div class="stat-value">${value}</div><div class="stat-label">${label}</div></div></div></div>`; }
  function renderActivities() { const list = JSON.parse(localStorage.getItem('hmsActivities') || '[]'); return list.length ? list.slice(0, 5).map(item => `<div class="activity-item"><span class="activity-icon"><i class="fa-solid ${item.icon}"></i></span><div><div>${escapeHtml(item.text)}</div><span class="activity-time">${escapeHtml(item.time)}</span></div></div>`).join('') : '<div class="text-muted small py-4 text-center">No recent activity.</div>'; }
  function dashboardStats() { return { patients: getRecords('patients').length, doctors: getRecords('doctors').length, appointments: getRecords('appointments').length, emergency: getRecords('emergency').length, lab: getRecords('laboratory').length, medicines: getRecords('pharmacy').length, bills: getRecords('billing').length, revenue: getRecords('billing').reduce((sum, bill) => sum + Number(bill.total || 0), 0) }; }

  /* Convert backend records to the field names used by the existing UI. */
  function fromApiRecord(name, record) {
    if (name === 'billing') return { ...record, consultationFee: record.consultationFee ?? record.consultation ?? 0, medicineFee: record.medicineFee ?? record.medicine ?? 0, laboratoryFee: record.laboratoryFee ?? record.laboratory ?? 0 };
    return record;
  }

  /* Convert existing UI form fields to the backend request shape. */
  function toApiRecord(name, data) {
    if (name === 'billing') return { ...data, consultation: data.consultationFee, medicine: data.medicineFee, laboratory: data.laboratoryFee };
    if (name === 'pharmacy') return { ...data, name: data.medicineName };
    return data;
  }

  /* Load all management records from MySQL into the UI cache at startup. */
  async function syncBackendData() {
    if (!window.HMS_API) return false;
    try {
      await window.HMS_API.get('/dashboard');
      for (const [name, path] of Object.entries(apiPaths)) setRecords(name, (await window.HMS_API.get(path)).map((record) => fromApiRecord(name, record)));
      backendAvailable = true;
      return true;
    } catch (error) {
      backendAvailable = false;
      return false;
    }
  }
  async function refreshAdminData() {
    if (syncInFlight) return;
    syncInFlight = true;
    const before = dataSignature();
    const wasBackendAvailable = backendAvailable;
    const available = await syncBackendData();
    const changed = before !== dataSignature();
    syncInFlight = false;
    setLiveSyncStatus(available ? 'Live updates on' : 'Offline data sync', available ? 'online' : 'offline');
    if (changed && available) logActivity('Patient or doctor portal updated hospital records', 'fa-arrows-rotate');
    if ((changed || (!available && !wasBackendAvailable)) && !adminModalOpen()) { renderCurrent(); renderNotifications(); }
  }
  function startLiveSync() {
    const handleSync = ({ key }) => { if (!sharedDataKey(key)) return; if (key === 'hmsActivities') renderNotifications(); if (backendAvailable) refreshAdminData(); else if (!adminModalOpen()) renderCurrent(); };
    window.hmsAdminSyncCleanup?.();
    window.hmsAdminSyncCleanup = window.HMS_API?.subscribeSync?.(handleSync);
    if (!window.hmsAdminSyncCleanup) window.addEventListener('storage', event => handleSync({ key: event.key }));
    clearInterval(window.hmsAdminSync);
    window.hmsAdminSync = setInterval(refreshAdminData, 5000);
  }
  function startClock() { const update = () => { const clock = $('#liveClock'); if (clock) clock.textContent = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }; update(); clearInterval(window.hmsClock); window.hmsClock = setInterval(update, 1000); }

  /* Render one of the CRUD module data tables with an independent search field. */
  function renderModule(name) {
    const config = modules[name]; let records = getRecords(name);
    if (config.priority) { const rank = { High: 0, Medium: 1, Low: 2 }; records.sort((a, b) => rank[a.priority] - rank[b.priority]); }
    const heading = config.priority ? '<span class="priority-high badge-status ms-2">Priority Queue</span>' : '';
    const readOnlyNotice = isPatientUser ? '<span class="badge bg-info text-dark"><i class="fa-solid fa-eye me-1"></i>Read-only</span>' : `<button class="btn btn-primary" id="addRecord"><i class="fa-solid fa-plus me-1"></i> Add ${config.singular}</button>`;
    $('#viewContent').innerHTML = `<div class="view-header"><div><h2><i class="fa-solid ${config.icon} text-primary me-2"></i>${config.title}${heading}</h2><p>${config.description}</p></div>${readOnlyNotice}</div><div class="panel-card p-0 overflow-hidden"><div class="p-3 border-bottom d-flex justify-content-between align-items-center flex-wrap gap-2"><span class="small text-muted"><i class="fa-solid fa-database me-1"></i>${records.length} record${records.length === 1 ? '' : 's'}</span><div class="input-group search-box"><span class="input-group-text"><i class="fa-solid fa-magnifying-glass"></i></span><input id="moduleSearch" class="form-control" placeholder="Search ${config.singular.toLowerCase()}..." aria-label="Search records"></div></div><div class="table-wrap"><table class="table data-table"><thead><tr>${config.columns.map(column => `<th>${humanize(column)}</th>`).join('')}<th class="text-end">Actions</th></tr></thead><tbody id="tableBody">${tableRows(name, records)}</tbody></table></div></div>`;
    $('#addRecord')?.addEventListener('click', () => openForm(name));
    $('#moduleSearch').addEventListener('input', event => { const term = event.target.value.toLowerCase(); $('#tableBody').innerHTML = tableRows(name, records.filter(record => Object.values(record).some(value => String(value).toLowerCase().includes(term)))); bindTableActions(name); });
    bindTableActions(name);
  }
  function tableRows(name, records) {
    const config = modules[name]; if (!records.length) return `<tr><td colspan="${config.columns.length + 1}" class="empty-state"><i class="fa-regular fa-folder-open"></i>No records found. Add your first ${config.singular.toLowerCase()}.</td></tr>`;
    return records.map(record => `<tr>${config.columns.map(column => `<td>${cellValue(name, column, record[column])}</td>`).join('')}<td class="text-end">${isPatientUser ? (config.bill ? `<button class="btn-action invoice-record" data-id="${record[config.id]}" title="View invoice"><i class="fa-solid fa-print"></i></button>` : '<span class="text-muted small">View only</span>') : `<button class="btn-action edit-record" data-id="${record[config.id]}" title="Edit"><i class="fa-solid fa-pen"></i></button>${config.bill ? `<button class="btn-action invoice-record" data-id="${record[config.id]}" title="Invoice"><i class="fa-solid fa-print"></i></button>` : ''}<button class="btn-action delete delete-record" data-id="${record[config.id]}" title="Delete"><i class="fa-solid fa-trash"></i></button>`}</td></tr>`).join('');
  }
  function cellValue(name, column, value) { if (['status', 'priority'].includes(column)) return statusBadge(value); if (['price', 'consultationFee', 'medicineFee', 'laboratoryFee', 'total'].includes(column)) return currency(value); if (column === 'quantity') return `<span class="fw-semibold">${escapeHtml(value)}</span>`; return escapeHtml(value || '—'); }
  function bindTableActions(name) { $$('.edit-record').forEach(button => button.addEventListener('click', () => openForm(name, button.dataset.id))); $$('.delete-record').forEach(button => button.addEventListener('click', () => deleteRecord(name, button.dataset.id))); $$('.invoice-record').forEach(button => button.addEventListener('click', () => showInvoice(button.dataset.id))); }

  /* Build a reusable modal form, including dynamic patient and doctor options. */
  function openForm(name, id = null) {
    if (isPatientUser) { toast('Patient access is read-only.', 'dark'); return; }
    const config = modules[name]; const record = id ? getRecords(name).find(item => item[config.id] === id) : null; activeEditId = id;
    $('#recordModalTitle').textContent = `${record ? 'Edit' : 'Add'} ${config.singular}`;
    $('#recordModal').dataset.module = name;
    $('#recordModalBody').innerHTML = `<div class="row g-3">${config.fields.map(field => formField(field, record?.[field[0]] || '')).join('')}${config.bill ? '<div class="col-12"><div class="alert alert-info mb-0 small"><i class="fa-solid fa-calculator me-1"></i> The total is calculated automatically when you save.</div></div>' : ''}</div>`;
    modal.show();
  }
  function formField([key, label, type, required, options, step], value) {
    const requiredMark = required ? ' required' : ''; const safe = escapeHtml(value);
    if (type === 'select') return `<div class="col-md-6"><label class="form-label">${label}</label><select class="form-select" name="${key}"${requiredMark}><option value="">Select ${label}</option>${options.map(option => `<option value="${option}" ${value === option ? 'selected' : ''}>${option}</option>`).join('')}</select><div class="invalid-feedback">Please select ${label.toLowerCase()}.</div></div>`;
    if (type === 'patientSelect' || type === 'doctorSelect') { const source = type === 'patientSelect' ? getRecords('patients').map(item => item.name) : getRecords('doctors').map(item => item.name); return `<div class="col-md-6"><label class="form-label">${label}</label><select class="form-select" name="${key}"${requiredMark}><option value="">Select ${label}</option>${source.map(option => `<option value="${escapeHtml(option)}" ${value === option ? 'selected' : ''}>${escapeHtml(option)}</option>`).join('')}</select><div class="invalid-feedback">Please select ${label.toLowerCase()}.</div></div>`; }
    return `<div class="col-md-6"><label class="form-label">${label}</label><input class="form-control" name="${key}" type="${type}" value="${safe}"${step ? ` step="${step}"` : ''}${requiredMark}><div class="invalid-feedback">Please enter ${label.toLowerCase()}.</div></div>`;
  }

  /* Validate and save the active form to localStorage. */
  $('#recordForm').addEventListener('submit', async event => {
    event.preventDefault(); const form = event.currentTarget; if (!form.checkValidity()) { form.classList.add('was-validated'); return; }
    if (isPatientUser) { toast('Patient access cannot save changes.', 'dark'); modal.hide(); return; }
    const name = $('#recordModal').dataset.module; const config = modules[name]; const data = Object.fromEntries(new FormData(form).entries()); const records = getRecords(name);
    if (config.bill) data.total = ['consultationFee', 'medicineFee', 'laboratoryFee'].reduce((sum, key) => sum + Number(data[key] || 0), 0).toFixed(2);
    let savedData = data;
    if (backendAvailable) {
      try {
        const response = activeEditId ? await window.HMS_API.put(`${apiPaths[name]}/${encodeURIComponent(activeEditId)}`, toApiRecord(name, data)) : await window.HMS_API.post(apiPaths[name], toApiRecord(name, data));
        savedData = fromApiRecord(name, response);
      } catch (error) {
        if (!error.isNetworkError) { toast(error.message, 'dark'); return; }
        backendAvailable = false;
      }
    }
    if (activeEditId) { const index = records.findIndex(item => item[config.id] === activeEditId); savedData[config.id] = activeEditId; savedData.createdAt = records[index]?.createdAt; records[index] = { ...records[index], ...savedData }; logActivity(`${config.singular} ${activeEditId} updated`); toast(`${config.singular} updated successfully.`); }
    else { savedData[config.id] = savedData[config.id] || nextId(name, config.prefix); if (config.bill && !savedData.createdAt) savedData.createdAt = new Date().toLocaleDateString('en-IN'); records.unshift(savedData); logActivity(`New ${config.singular.toLowerCase()} added: ${savedData[config.id]}`, config.icon); toast(`${config.singular} added successfully.`); }
    setRecords(name, records); modal.hide(); renderCurrent();
  });

  /* Confirm and delete a selected record. */
  async function deleteRecord(name, id) { if (isPatientUser) { toast('Patient access cannot delete records.', 'dark'); return; } const config = modules[name]; if (!confirm(`Delete this ${config.singular.toLowerCase()} record? This cannot be undone.`)) return; if (backendAvailable) { try { await window.HMS_API.delete(`${apiPaths[name]}/${encodeURIComponent(id)}`); } catch (error) { if (!error.isNetworkError) { toast(error.message, 'dark'); return; } backendAvailable = false; } } setRecords(name, getRecords(name).filter(record => record[config.id] !== id)); logActivity(`${config.singular} ${id} deleted`, 'fa-trash'); toast(`${config.singular} deleted.`, 'dark'); renderCurrent(); }

  /* Create a printer-friendly invoice for an existing bill. */
  function showInvoice(id) { const bill = getRecords('billing').find(item => item.billId === id); if (!bill) return; $('#invoiceContent').innerHTML = `<article class="invoice"><header class="invoice-header d-flex justify-content-between"><div><h3 class="invoice-title mb-1"><i class="fa-solid fa-heart-pulse me-2"></i>Heal Well Hospital</h3><p class="small text-muted mb-0">Compassionate care. Clear billing.</p></div><div class="text-end"><h5 class="mb-1">INVOICE</h5><span class="small text-muted">${escapeHtml(bill.billId)}<br>${escapeHtml(bill.createdAt || new Date().toLocaleDateString('en-IN'))}</span></div></header><section class="py-4"><div class="row"><div class="col-6"><small class="text-muted">BILLED TO</small><h6 class="mt-1">${escapeHtml(bill.patient)}</h6></div><div class="col-6 text-end"><small class="text-muted">PAYMENT STATUS</small><h6 class="mt-1 text-success">Paid / Recorded</h6></div></div></section><table class="table"><thead><tr><th>Description</th><th class="text-end">Amount</th></tr></thead><tbody><tr><td>Consultation Fee</td><td class="text-end">${currency(bill.consultationFee)}</td></tr><tr><td>Medicine Fee</td><td class="text-end">${currency(bill.medicineFee)}</td></tr><tr><td>Laboratory Fee</td><td class="text-end">${currency(bill.laboratoryFee)}</td></tr><tr class="invoice-total"><td>Total Payable</td><td class="text-end">${currency(bill.total)}</td></tr></tbody></table><p class="small text-muted mt-4 mb-0">Thank you for choosing Heal Well Hospital. This is a computer-generated invoice.</p></article>`; invoiceModal.show(); }
  $('#printInvoice').addEventListener('click', () => window.print());

  /* Draw compact overview and report charts from live localStorage records. */
  function makeChart(canvas, config) { if (typeof Chart !== 'function') { canvas.parentElement.innerHTML = '<div class="text-center text-muted pt-5">Charts are unavailable offline, but all report statistics remain available above.</div>'; return; } chartInstances.forEach(chart => chart.destroy()); chartInstances = [new Chart(canvas, config)]; }
  function renderOverviewChart(stats) { const canvas = $('#overviewChart'); if (!canvas) return; makeChart(canvas, { type: 'bar', data: { labels: ['Patients', 'Doctors', 'Appointments', 'Emergency', 'Lab Tests'], datasets: [{ label: 'Records', data: [stats.patients, stats.doctors, stats.appointments, stats.emergency, stats.lab], backgroundColor: ['#137b86', '#6575c7', '#db9a32', '#dd6571', '#31b59f'], borderRadius: 7 }] }, options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { grid: { display: false } } } } }); }
  function renderReports() { const stats = dashboardStats(); $('#viewContent').innerHTML = `<div class="view-header"><div><h2><i class="fa-solid fa-chart-pie text-primary me-2"></i>Reports & Analytics</h2><p>Live statistics calculated from the hospital records.</p></div></div><div class="row g-3 mb-4">${statCard('fa-bed-pulse', '#e3f5f3', '#137b86', stats.patients, 'Patients')}${statCard('fa-user-doctor', '#e9edff', '#5865c8', stats.doctors, 'Doctors')}${statCard('fa-calendar-check', '#fff1dc', '#d68b19', stats.appointments, 'Appointments')}${statCard('fa-truck-medical', '#ffe9ea', '#d84f62', stats.emergency, 'Emergency Cases')}${statCard('fa-flask-vial', '#e9e8ff', '#725ac6', stats.lab, 'Lab Tests')}${statCard('fa-pills', '#ddf7f0', '#168370', stats.medicines, 'Medicines')}${statCard('fa-file-invoice-dollar', '#f3e9ff', '#8c55b1', stats.bills, 'Bills')}${statCard('fa-indian-rupee-sign', '#e6f7e9', '#28904d', currency(stats.revenue), 'Revenue')}</div><div class="row g-4"><div class="col-lg-7"><div class="panel-card"><h3 class="section-heading">Hospital Records</h3><p class="section-subtitle mb-3">Number of records per operational area</p><div class="chart-wrap"><canvas id="barChart"></canvas></div></div></div><div class="col-lg-5"><div class="panel-card"><h3 class="section-heading">Appointment Status</h3><p class="section-subtitle mb-3">Current appointment distribution</p><div class="chart-wrap"><canvas id="pieChart"></canvas></div></div></div></div>`;
    if (typeof Chart !== 'function') { $$('.chart-wrap').forEach(wrap => { wrap.innerHTML = '<div class="text-center text-muted pt-5">Charts are unavailable offline.</div>'; }); return; }
    const statusCounts = ['Pending', 'Completed', 'Cancelled'].map(status => getRecords('appointments').filter(item => item.status === status).length);
    chartInstances.forEach(chart => chart.destroy()); chartInstances = [];
    chartInstances.push(new Chart($('#barChart'), { type: 'bar', data: { labels: ['Patients', 'Doctors', 'Appointments', 'Emergency', 'Lab Tests', 'Medicines', 'Bills'], datasets: [{ label: 'Records', data: [stats.patients, stats.doctors, stats.appointments, stats.emergency, stats.lab, stats.medicines, stats.bills], backgroundColor: '#137b86', borderRadius: 7 }] }, options: { maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { grid: { display: false } } } } }));
    chartInstances.push(new Chart($('#pieChart'), { type: 'pie', data: { labels: ['Pending', 'Completed', 'Cancelled'], datasets: [{ data: statusCounts, backgroundColor: ['#e2a33a', '#32a765', '#db6872'], borderWidth: 0 }] }, options: { maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } } }));
  }

  /* Switch visible page and update navigation state. */
  function navigate(view) { activeView = view; $$('.sidebar .nav-link').forEach(link => link.classList.toggle('active', link.dataset.view === view)); $('#pageTitle').textContent = view === 'dashboard' ? 'Dashboard' : modules[view].title; closeSidebar(); renderCurrent(); }
  function renderCurrent() { if (activeView === 'dashboard') renderDashboard(); else if (activeView === 'reports') renderReports(); else renderModule(activeView); }
  function closeSidebar() { $('#sidebar').classList.remove('open'); $('#sidebarBackdrop').classList.remove('show'); }

  /* Attach persistent UI event handlers. */
  $$('.sidebar .nav-link').forEach(link => link.addEventListener('click', event => { event.preventDefault(); navigate(link.dataset.view); }));
  $('#menuToggle').addEventListener('click', () => { $('#sidebar').classList.add('open'); $('#sidebarBackdrop').classList.add('show'); });
  $('.btn-close-sidebar').addEventListener('click', closeSidebar); $('#sidebarBackdrop').addEventListener('click', closeSidebar);
  $('#logoutBtn').addEventListener('click', () => { localStorage.removeItem('hmsLoggedIn'); localStorage.removeItem('hmsRole'); localStorage.removeItem('hmsUser'); window.HMS_API.setToken(); window.location.href = 'index.html'; });
  $$('[data-modal-close]').forEach(button => button.addEventListener('click', () => setModalState(`#${button.dataset.modalClose}`, false)));
  $$('.hms-modal').forEach(element => element.addEventListener('click', event => { if (event.target === element) setModalState(`#${element.id}`, false); }));
  $('#notificationToggle').addEventListener('click', event => { event.stopPropagation(); $('#notificationMenu').classList.toggle('show'); });
  document.addEventListener('click', event => { if (!event.target.closest('.dropdown')) $('#notificationMenu').classList.remove('show'); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') { modal.hide(); invoiceModal.hide(); } });
  renderNotifications();
  $('#currentUser').textContent = isPatientUser ? 'Patient' : (localStorage.getItem('hmsUser') || 'Administrator');
  $('#liveDate').textContent = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  setLiveSyncStatus('Starting live sync', 'pending');
  if (localStorage.getItem('hmsDarkMode') === 'true') { document.body.classList.add('dark-mode'); $('#darkToggle i').className = 'fa-solid fa-sun'; }
  /* Prefer MySQL-backed records and retain the original demo cache when offline. */
  (async function initializeDashboard() { if (!(await syncBackendData())) seedData(); renderCurrent(); renderNotifications(); startLiveSync(); setLiveSyncStatus(backendAvailable ? 'Live updates on' : 'Offline data sync', backendAvailable ? 'online' : 'offline'); }());
})();
