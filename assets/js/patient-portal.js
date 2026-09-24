/* Patient portal controller: live slots, personal records, appointment actions, and health journey. */
(() => {
  'use strict';
  const role = localStorage.getItem('hmsRole');
  if (localStorage.getItem('hmsLoggedIn') !== 'true' || role !== 'patient') { window.location.replace('login.html'); return; }

  const $ = (selector) => document.querySelector(selector);
  const account = JSON.parse(localStorage.getItem('hmsPatientAccount') || '{}');
  const profile = JSON.parse(localStorage.getItem('hmsPatientProfile') || '{}');
  const fallbackDoctors = [{ doctorId: 'DOC-1001', name: 'Dr. Ananya Rao', department: 'Cardiology', qualification: 'MD, DM', experience: 12 }, { doctorId: 'DOC-1002', name: 'Dr. Vikram Mehta', department: 'Orthopedics', qualification: 'MS Ortho', experience: 9 }, { doctorId: 'DOC-1003', name: 'Dr. Neha Kapoor', department: 'General Medicine', qualification: 'MD Medicine', experience: 8 }, { doctorId: 'DOC-1004', name: 'Dr. Rohan Iyer', department: 'Neurology', qualification: 'DM Neurology', experience: 14 }, { doctorId: 'DOC-1005', name: 'Dr. Meera Shah', department: 'Pediatrics', qualification: 'MD Pediatrics', experience: 11 }, { doctorId: 'DOC-1006', name: 'Dr. Arjun Malhotra', department: 'Oncology', qualification: 'DM Oncology', experience: 15 }, { doctorId: 'DOC-1007', name: 'Dr. Kavya Menon', department: 'Gynecology', qualification: 'MS Gynecology', experience: 10 }, { doctorId: 'DOC-1008', name: 'Dr. Sameer Patel', department: 'Dermatology', qualification: 'MD Dermatology', experience: 7 }];
  const state = { doctors: [], appointments: [], laboratory: [], billing: [], prescriptions: [], patient: {}, selectedSlot: '', backendAvailable: false, rescheduleId: null };

  function escapeHtml(value = '') { return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character])); }
  function getRecords(name) { try { return JSON.parse(localStorage.getItem(`hms_${name}`) || '[]'); } catch (error) { return []; } }
  function setRecords(name, records) { localStorage.setItem(`hms_${name}`, JSON.stringify(records)); window.HMS_API?.notifySync?.(`hms_${name}`); }
  function logPortalActivity(text, icon = 'fa-calendar-check') { const activities = JSON.parse(localStorage.getItem('hmsActivities') || '[]'); activities.unshift({ text, icon, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }); localStorage.setItem('hmsActivities', JSON.stringify(activities.slice(0, 8))); window.HMS_API?.notifySync?.('hmsActivities'); }
  function today() { return new Date().toISOString().slice(0, 10); }
  function timeValue(value) { return String(value || '').slice(0, 5); }
  function timeLabel(value) { const [hours, minutes] = timeValue(value).split(':').map(Number); if (!Number.isFinite(hours)) return '—'; const suffix = hours >= 12 ? 'PM' : 'AM'; return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${suffix}`; }
  function dateLabel(value) { if (!value) return '—'; const date = new Date(`${String(value).slice(0, 10)}T00:00:00`); return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); }
  function parseDisplayDate(value) { const match = String(value || '').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/); if (!match) return ''; const [, day, month, year] = match; const date = new Date(`${year}-${month}-${day}T00:00:00`); if (date.getFullYear() !== Number(year) || date.getMonth() + 1 !== Number(month) || date.getDate() !== Number(day)) return ''; return `${year}-${month}-${day}`; }
  function displayDate(value) { const match = String(value || '').slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/); return match ? `${match[3]}/${match[2]}/${match[1]}` : ''; }
  function showAlert(message, type = 'success') { const alert = $('#patientBookingAlert'); alert.textContent = message; alert.dataset.type = type; alert.classList.add('show'); }
  function clearAlert() { $('#patientBookingAlert').classList.remove('show'); }
  function localAppointments() { const name = state.patient.name || profile.name || account.name; const phone = state.patient.phone || profile.phone || account.phone; return getRecords('appointments').filter((appointment) => appointment.patientAccountId === account.patientId || (appointment.patientPortal && (appointment.patient === name || appointment.phone === phone))); }
  function mergeDoctors(doctors) { const merged = new Map(fallbackDoctors.map((doctor) => [doctor.doctorId, doctor])); doctors.forEach((doctor) => merged.set(doctor.doctorId || doctor.id || doctor.name, { ...merged.get(doctor.doctorId || doctor.id || doctor.name), ...doctor })); return [...merged.values()]; }

  function buildLocalSummary() {
    const patients = getRecords('patients');
    const localPatient = patients.find((patient) => patient.patientId === account.patientId || patient.phone === account.phone) || {};
    const appointments = localAppointments();
    return { patient: { patientId: account.patientId || localPatient.patientId || 'PATIENT-DEMO', name: account.name || profile.name || localPatient.name || 'Patient', phone: account.phone || profile.phone || localPatient.phone || '' }, appointments, laboratory: getRecords('laboratory').filter((item) => item.patientId === account.patientId || item.patient === localPatient.name), billing: getRecords('billing').filter((item) => item.patientId === account.patientId || item.patient === localPatient.name), prescriptions: getRecords('consultations').filter((item) => item.patientId === account.patientId && item.prescription) };
  }

  async function loadPortalData() {
    let summary;
    try { summary = await window.HMS_API.get('/patient/summary'); state.backendAvailable = true; } catch (error) { summary = buildLocalSummary(); }
    Object.assign(state, summary);
    try { state.doctors = mergeDoctors(await window.HMS_API.get('/doctors')); state.backendAvailable = true; } catch (error) { state.doctors = mergeDoctors(getRecords('doctors')); }
    renderPatientIdentity();
    populateDoctors();
    renderDashboardCards();
    renderAppointments();
    renderRecords();
    renderJourney();
  }

  function renderPatientIdentity() {
    const name = state.patient.name || account.name || profile.name || 'Patient';
    $('#patientNameHeading').textContent = name.split(' ')[0];
    $('#patientIdLabel').textContent = state.patient.patientId || account.patientId || 'PATIENT-DEMO';
    $('#patientAvatar').textContent = name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  }

  function populateDoctors() {
    const departmentSelect = $('#patientDepartment');
    const doctorSelect = $('#patientDoctor');
    const departments = [...new Set(state.doctors.map((doctor) => doctor.department).filter(Boolean))];
    departmentSelect.innerHTML = '<option value="">Choose department</option>' + departments.map((department) => `<option value="${escapeHtml(department)}">${escapeHtml(department)}</option>`).join('');
    const renderDoctors = () => {
      const selected = departmentSelect.value;
      const doctors = selected ? state.doctors.filter((doctor) => doctor.department === selected) : state.doctors;
      doctorSelect.innerHTML = '<option value="">Choose doctor</option>' + doctors.map((doctor) => `<option value="${escapeHtml(doctor.doctorId || doctor.id || doctor.name)}">${escapeHtml(doctor.name)}</option>`).join('');
      if (state.rescheduleId) {
        const appointment = state.appointments.find((item) => String(item.id || item.appointmentId) === String(state.rescheduleId));
        if (appointment) doctorSelect.value = appointment.doctorId || appointment.doctor;
      }
      loadAvailability();
    };
    departmentSelect.addEventListener('change', renderDoctors);
    doctorSelect.addEventListener('change', loadAvailability);
    const dateInput = $('#patientDate');
    dateInput.type = 'text'; dateInput.inputMode = 'numeric'; dateInput.maxLength = 10; dateInput.placeholder = 'DD/MM/YYYY'; dateInput.pattern = '\\d{2}/\\d{2}/\\d{4}'; dateInput.autocomplete = 'off'; dateInput.setAttribute('aria-label', 'Appointment date (DD/MM/YYYY)');
    dateInput.closest('label').firstChild.textContent = 'Date (DD/MM/YYYY)';
    dateInput.addEventListener('change', loadAvailability);
    renderDoctors();
  }

  function renderDashboardCards() {
    const upcoming = state.appointments.filter((appointment) => !['Cancelled', 'Completed', 'No Show'].includes(appointment.status) && `${appointment.date}`.slice(0, 10) >= today()).sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))[0];
    $('#upcomingAppointmentStat').textContent = upcoming ? dateLabel(upcoming.date) : '—';
    $('#upcomingAppointmentDetail').textContent = upcoming ? `${upcoming.doctor} · ${timeLabel(upcoming.time)}` : 'No appointment scheduled';
    $('#prescriptionStat').textContent = state.prescriptions.length;
    $('#labStat').textContent = state.laboratory.filter((test) => String(test.status).toLowerCase() !== 'completed').length;
    $('#billStat').textContent = `₹${state.billing.reduce((sum, bill) => sum + Number(bill.total || 0), 0).toLocaleString('en-IN')}`;
  }

  function statusClass(status) { return String(status || 'Pending').toLowerCase().replace(/\s+/g, '-'); }

  function renderAppointments() {
    const container = $('#patientAppointments');
    if (!state.appointments.length) { container.innerHTML = '<div class="portal-empty large-empty"><i class="fa-regular fa-calendar"></i><strong>No appointments yet</strong><span>Choose a doctor and time below to start your care journey.</span></div>'; return; }
    const sorted = [...state.appointments].sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`));
    container.innerHTML = sorted.map((appointment) => { const active = !['Cancelled', 'Completed', 'No Show'].includes(appointment.status); const id = appointment.id || appointment.appointmentId; return `<article class="patient-appointment-card"><div class="appointment-date-block"><strong>${escapeHtml(dateLabel(appointment.date).split(' ')[0])}</strong><span>${escapeHtml(dateLabel(appointment.date).split(' ').slice(1).join(' '))}</span></div><div class="appointment-main"><div class="appointment-heading"><span class="appointment-status ${statusClass(appointment.status)}">${escapeHtml(appointment.status || 'Pending')}</span><span class="appointment-id">${escapeHtml(appointment.appointmentId || id)}</span></div><h3>${escapeHtml(appointment.doctor || 'Care team')}</h3><p>${escapeHtml(appointment.department || 'Specialist consultation')} · ${escapeHtml(timeLabel(appointment.time))}</p><div class="appointment-actions"><button type="button" data-appointment-action="view" data-appointment-id="${escapeHtml(id)}">View details</button>${active ? `<button type="button" data-appointment-action="reschedule" data-appointment-id="${escapeHtml(id)}">Reschedule</button><button type="button" class="cancel-action" data-appointment-action="cancel" data-appointment-id="${escapeHtml(id)}">Cancel</button>` : ''}</div></div></article>`; }).join('');
  }

  function renderRecords() {
    $('#patientLabs').innerHTML = state.laboratory.length ? state.laboratory.slice(0, 4).map((test) => `<div class="record-row"><span class="record-row-icon lab"><i class="fa-solid fa-flask-vial"></i></span><span><strong>${escapeHtml(test.testName || 'Laboratory test')}</strong><small>${escapeHtml(test.result || 'Result pending')}</small></span><em class="record-status ${statusClass(test.status)}">${escapeHtml(test.status || 'Pending')}</em></div>`).join('') : '<div class="portal-empty">Your lab records will appear here.</div>';
    $('#patientPrescriptions').innerHTML = state.prescriptions.length ? state.prescriptions.slice(0, 4).map((item) => `<div class="record-row"><span class="record-row-icon prescription"><i class="fa-solid fa-pills"></i></span><span><strong>${escapeHtml(item.doctor || 'Doctor prescription')}</strong><small>${escapeHtml(item.prescription)}</small></span><em class="record-status completed">Active</em></div>`).join('') : '<div class="portal-empty">Your prescriptions will appear here.</div>';
    $('#patientBills').innerHTML = state.billing.length ? state.billing.slice(0, 4).map((bill) => `<div class="record-row"><span class="record-row-icon bill"><i class="fa-solid fa-file-invoice-dollar"></i></span><span><strong>${escapeHtml(bill.billId || 'Hospital bill')}</strong><small>${escapeHtml(dateLabel(bill.createdAt))}</small></span><em class="bill-amount">₹${Number(bill.total || 0).toLocaleString('en-IN')}</em></div>`).join('') : '<div class="portal-empty">Your bills will appear here.</div>';
  }

  function renderJourney() {
    const hasAppointment = state.appointments.length > 0;
    const hasConsultation = state.appointments.some((appointment) => appointment.status === 'Completed' || appointment.consultationStatus === 'Completed');
    const hasLabs = state.laboratory.length > 0;
    const hasPrescription = state.prescriptions.length > 0;
    const hasBilling = state.billing.length > 0;
    const completed = [hasAppointment, hasAppointment, hasConsultation, hasLabs, hasPrescription, hasBilling, hasBilling && hasConsultation];
    const stages = [...document.querySelectorAll('.journey-stage')];
    let activeFound = false; let completeCount = 0;
    stages.forEach((stage, index) => {
      stage.classList.remove('complete', 'active', 'upcoming');
      if (completed[index]) { stage.classList.add('complete'); completeCount += 1; } else if (!activeFound) { stage.classList.add('active'); activeFound = true; } else stage.classList.add('upcoming');
    });
    $('#journeyProgressLabel').textContent = `${completeCount} of ${stages.length} stages complete`;
  }

  async function loadAvailability() {
    const doctorReference = $('#patientDoctor').value;
    const rawDate = $('#patientDate').value.trim();
    const date = parseDisplayDate(rawDate);
    const slotsContainer = $('#appointmentSlots');
    state.selectedSlot = '';
    if (rawDate && !date) { $('#slotStatus').textContent = 'Enter a valid date as DD/MM/YYYY.'; slotsContainer.innerHTML = '<div class="slot-placeholder unavailable"><i class="fa-solid fa-calendar-xmark"></i><span>Use a real date such as 24/09/2026.</span></div>'; return; }
    if (!doctorReference || !date) { $('#slotStatus').textContent = 'Choose a doctor and date to see live slots.'; slotsContainer.innerHTML = '<div class="slot-placeholder"><i class="fa-regular fa-calendar"></i><span>Your available times will appear here.</span></div>'; return; }
    $('#slotStatus').textContent = 'Checking live availability...';
    let availability;
    const doctor = state.doctors.find((item) => String(item.doctorId || item.id || item.name) === String(doctorReference)) || state.doctors.find((item) => item.name === doctorReference);
    try { availability = await window.HMS_API.get(`/appointments/availability?doctorId=${encodeURIComponent(doctor?.doctorId || doctor?.id || doctorReference)}&date=${encodeURIComponent(date)}`); state.backendAvailable = true; } catch (error) { availability = localAvailability(doctor, date); }
    if (availability.unavailable) { $('#slotStatus').textContent = availability.unavailableReason || 'The doctor is unavailable on this date.'; slotsContainer.innerHTML = '<div class="slot-placeholder unavailable"><i class="fa-solid fa-calendar-xmark"></i><span>This doctor is unavailable on this date. Please choose another date.</span></div>'; return; }
    const availableCount = availability.slots.filter((slot) => slot.available).length;
    $('#slotStatus').textContent = `${availableCount} slots available · ${dateLabel(date)}`;
    slotsContainer.innerHTML = availability.slots.map((slot) => `<button type="button" class="appointment-slot ${slot.available ? 'available' : 'booked'}" data-slot="${slot.time}" ${slot.available ? '' : 'disabled'}><span>${slot.available ? '✓' : '×'}</span>${escapeHtml(timeLabel(slot.time))}</button>`).join('');
    slotsContainer.querySelectorAll('.appointment-slot.available').forEach((button) => button.addEventListener('click', () => { state.selectedSlot = button.dataset.slot; slotsContainer.querySelectorAll('.appointment-slot').forEach((item) => item.classList.remove('selected')); button.classList.add('selected'); }));
  }

  function localAvailability(doctor, date) {
    const day = new Date(`${date}T00:00:00`).getDay();
    if (day === 0) return { unavailable: true, unavailableReason: 'Doctors are unavailable on Sundays.', slots: [] };
    const ranges = day === 6 ? [['09:00', '12:00']] : [['09:00', '13:00'], ['14:00', '17:00']];
    const slots = [];
    ranges.forEach(([start, end]) => { for (let minutes = minutesFromTime(start); minutes + 30 <= minutesFromTime(end); minutes += 30) { const time = formatMinutes(minutes); const booked = state.appointments.some((item) => String(item.doctorId || item.doctor) === String(doctor?.doctorId || doctor?.id || doctor?.name) && String(item.date).slice(0, 10) === date && timeValue(item.time) === time && !['Cancelled', 'No Show'].includes(item.status)); const past = date === today() && minutes <= new Date().getHours() * 60 + new Date().getMinutes(); slots.push({ time, available: !booked && !past }); } });
    return { unavailable: false, slots };
  }
  function minutesFromTime(value) { const [hours, minutes] = value.split(':').map(Number); return hours * 60 + minutes; }
  function formatMinutes(value) { return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`; }

  async function submitAppointment(event) {
    event.preventDefault();
    const doctorReference = $('#patientDoctor').value; const date = parseDisplayDate($('#patientDate').value); const reason = $('#patientReason').value.trim();
    if ($('#patientDate').value.trim() && !date) { showAlert('Enter the appointment date as DD/MM/YYYY.', 'error'); return; }
    if (!doctorReference || !date || !state.selectedSlot || !reason) { showAlert('Choose a doctor, date, available time, and reason before confirming.', 'error'); return; }
    const doctor = state.doctors.find((item) => String(item.doctorId || item.id || item.name) === String(doctorReference)) || state.doctors.find((item) => item.name === doctorReference);
    const payload = { doctorId: doctor?.doctorId || doctor?.id || doctorReference, date, time: state.selectedSlot, reason, patient: state.patient.patientId || account.patientId };
    let saved;
    try {
      saved = state.rescheduleId ? await window.HMS_API.put(`/appointments/${encodeURIComponent(state.rescheduleId)}/reschedule`, payload) : await window.HMS_API.post('/appointments', payload);
      state.backendAvailable = true;
    } catch (error) {
      if (error.status === 409) { await loadAvailability(); showConflictModal(); return; }
      if (!error.isNetworkError && !error.isBackendUnavailable) { showAlert(error.message || 'Unable to save this appointment.', 'error'); return; }
      const existing = localAppointments();
      const conflict = existing.some((item) => String(item.doctorId || item.doctor) === String(payload.doctorId) && String(item.date).slice(0, 10) === date && timeValue(item.time) === state.selectedSlot && !['Cancelled', 'No Show'].includes(item.status) && String(item.appointmentId) !== String(state.rescheduleId));
      if (conflict) { await loadAvailability(); showConflictModal(); return; }
      const localAppointment = { id: state.rescheduleId || `APT-${Date.now()}`, appointmentId: state.rescheduleId || `APT-${Date.now()}`, patient: state.patient.name || account.name, patientAccountId: account.patientId || 'PATIENT-DEMO', doctorId: payload.doctorId, doctor: doctor?.name || doctorReference, department: doctor?.department || $('#patientDepartment').value, date, time: state.selectedSlot, reason, status: 'Pending', bookingSource: 'Patient Portal' };
      if (state.rescheduleId) { const all = getRecords('appointments').map((item) => String(item.appointmentId || item.id) === String(state.rescheduleId) ? { ...item, ...localAppointment } : item); setRecords('appointments', all); } else { setRecords('appointments', [localAppointment, ...getRecords('appointments')]); }
      saved = localAppointment;
    }
    const activityText = state.rescheduleId ? `Patient rescheduled an appointment with ${doctor?.name || doctorReference}` : `New appointment booked with ${doctor?.name || doctorReference}`;
    logPortalActivity(activityText);
    state.rescheduleId = null; state.selectedSlot = ''; $('#patientReason').value = ''; showAlert('Your appointment has been saved. You can see the latest status in My Appointments.'); await loadPortalData(); await loadAvailability();
  }

  function showConflictModal() { const choices = [...document.querySelectorAll('.appointment-slot.available')].slice(0, 4); $('#conflictAlternatives').innerHTML = choices.length ? choices.map((button) => `<button type="button" data-conflict-slot="${button.dataset.slot}">${escapeHtml(timeLabel(button.dataset.slot))} <i class="fa-solid fa-arrow-right"></i></button>`).join('') : '<p class="portal-empty">No nearby times are available. Try another date.</p>'; $('#conflictModal').classList.add('open'); $('#conflictModal').setAttribute('aria-hidden', 'false'); $('#conflictAlternatives').querySelectorAll('[data-conflict-slot]').forEach((button) => button.addEventListener('click', () => { state.selectedSlot = button.dataset.conflictSlot; document.querySelectorAll('.appointment-slot').forEach((item) => item.classList.toggle('selected', item.dataset.slot === state.selectedSlot)); closeModal('conflictModal'); })); }
  function openDetails(appointment) { $('#patientModalContent').innerHTML = `<span class="portal-eyebrow">APPOINTMENT DETAILS</span><h2>${escapeHtml(appointment.doctor || 'Care team')}</h2><p class="modal-subtitle">${escapeHtml(appointment.department || 'Specialist consultation')}</p><div class="modal-detail-grid"><span><small>Date</small><strong>${escapeHtml(dateLabel(appointment.date))}</strong></span><span><small>Time</small><strong>${escapeHtml(timeLabel(appointment.time))}</strong></span><span><small>Appointment ID</small><strong>${escapeHtml(appointment.appointmentId || appointment.id)}</strong></span><span><small>Status</small><strong>${escapeHtml(appointment.status || 'Pending')}</strong></span></div><div class="modal-note"><small>Reason for visit</small><p>${escapeHtml(appointment.reason || 'No reason was added.')}</p></div>`; $('#patientModal').classList.add('open'); $('#patientModal').setAttribute('aria-hidden', 'false'); }
  function closeModal(id) { const modal = $(`#${id}`); modal.classList.remove('open'); modal.setAttribute('aria-hidden', 'true'); }

  async function appointmentAction(action, id) {
    const appointment = state.appointments.find((item) => String(item.id || item.appointmentId) === String(id));
    if (!appointment) return;
    if (action === 'view') { openDetails(appointment); return; }
    if (action === 'reschedule') { state.rescheduleId = id; const doctor = state.doctors.find((item) => String(item.doctorId || item.id || item.name) === String(appointment.doctorId || appointment.doctor)); $('#patientDepartment').value = doctor?.department || appointment.department || ''; $('#patientDepartment').dispatchEvent(new Event('change')); $('#patientDate').value = displayDate(appointment.date); setTimeout(loadAvailability, 0); document.querySelector('#book-appointment').scrollIntoView({ behavior: 'smooth' }); showAlert('Choose a new available time to reschedule this appointment.'); return; }
    if (action === 'cancel' && !window.confirm('Cancel this appointment? Its time slot will become available again.')) return;
    if (action === 'cancel') {
      try { await window.HMS_API.put(`/appointments/${encodeURIComponent(id)}/cancel`, {}); } catch (error) { if (!error.isNetworkError && !error.isBackendUnavailable) { showAlert(error.message, 'error'); return; } const updated = getRecords('appointments').map((item) => String(item.appointmentId || item.id) === String(id) ? { ...item, status: 'Cancelled' } : item); setRecords('appointments', updated); }
      logPortalActivity(`Patient cancelled appointment with ${appointment.doctor || 'the care team'}`, 'fa-calendar-xmark'); showAlert('Appointment cancelled. The slot is available again.'); await loadPortalData(); await loadAvailability();
    }
  }

  function bindEvents() {
    const menuToggle = $('#patientMenuToggle'); const patientNav = $('#patientNav'); menuToggle.addEventListener('click', () => { const open = patientNav.classList.toggle('open'); menuToggle.setAttribute('aria-expanded', String(open)); menuToggle.innerHTML = `<i class="fa-solid fa-${open ? 'xmark' : 'bars'}"></i>`; }); patientNav.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => { patientNav.classList.remove('open'); menuToggle.setAttribute('aria-expanded', 'false'); menuToggle.innerHTML = '<i class="fa-solid fa-bars"></i>'; }));
    $('#patientBookingForm').addEventListener('submit', submitAppointment);
    $('#patientAppointments').addEventListener('click', (event) => { const button = event.target.closest('[data-appointment-action]'); if (button) appointmentAction(button.dataset.appointmentAction, button.dataset.appointmentId); });
    $('#patientLogout').addEventListener('click', () => { localStorage.removeItem('hmsLoggedIn'); localStorage.removeItem('hmsRole'); localStorage.removeItem('hmsUser'); localStorage.removeItem('hmsPatientAccount'); window.HMS_API.setToken(); window.location.href = 'index.html'; });
    document.querySelectorAll('[data-close-patient-modal]').forEach((button) => button.addEventListener('click', () => closeModal('patientModal')));
    document.querySelectorAll('[data-close-conflict-modal]').forEach((button) => button.addEventListener('click', () => closeModal('conflictModal')));
    document.querySelectorAll('.portal-modal').forEach((modal) => modal.addEventListener('click', (event) => { if (event.target === modal) closeModal(modal.id); }));
  }

  bindEvents();
  let syncRefreshTimer;
  window.HMS_API?.subscribeSync?.(({ key }) => {
    if (!['hms_appointments', 'hms_doctors', 'hms_laboratory', 'hms_billing', 'hms_consultations', 'hmsActivities'].includes(key)) return;
    clearTimeout(syncRefreshTimer);
    syncRefreshTimer = setTimeout(() => loadPortalData(), 150);
  });
  loadPortalData();
})();
