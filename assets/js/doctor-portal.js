/* Doctor portal controller: scoped queues, patient context, consultations, emergency visibility, and schedule tools. */
(() => {
  'use strict';
  if (localStorage.getItem('hmsLoggedIn') !== 'true' || localStorage.getItem('hmsRole') !== 'doctor') { window.location.replace('login.html'); return; }

  const $ = (selector) => document.querySelector(selector);
  const state = { doctor: {}, appointments: [], emergencies: [], schedules: [], leaves: [], backendAvailable: false };
  const today = () => new Date().toISOString().slice(0, 10);
  const accountName = localStorage.getItem('hmsUser') || 'Doctor';
  const isDemoDoctor = accountName.toLowerCase() === 'doctor';

  function escapeHtml(value = '') { return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character])); }
  function logPortalActivity(text, icon = 'fa-user-doctor') { const activities = JSON.parse(localStorage.getItem('hmsActivities') || '[]'); activities.unshift({ text, icon, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }); localStorage.setItem('hmsActivities', JSON.stringify(activities.slice(0, 8))); }
  function timeValue(value) { return String(value || '').slice(0, 5); }
  function timeLabel(value) { const [hours, minutes] = timeValue(value).split(':').map(Number); if (!Number.isFinite(hours)) return '—'; return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`; }
  function dateLabel(value) { return value ? new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'; }
  function getRecords(name) { try { return JSON.parse(localStorage.getItem(`hms_${name}`) || '[]'); } catch (error) { return []; } }
  function setRecords(name, data) { localStorage.setItem(`hms_${name}`, JSON.stringify(data)); }
  function openModal(id) { const modal = $(`#${id}`); modal.classList.add('open'); modal.setAttribute('aria-hidden', 'false'); }
  function closeModal(id) { const modal = $(`#${id}`); modal.classList.remove('open'); modal.setAttribute('aria-hidden', 'true'); }
  function showAlert(selector, message, type = 'success') { const element = $(selector); element.textContent = message; element.dataset.type = type; element.classList.add('show'); }
  function setEmergencyVisibility() {
    const panel = document.querySelector('.emergency-panel');
    const stat = document.querySelector('.doctor-stat-grid .doctor-stat-icon.red')?.closest('article');
    if (panel) panel.hidden = true;
    if (stat) stat.hidden = true;
  }
  function configureQueueLabels() {
    const panel = document.querySelector('.priority-panel');
    if (!panel) return;
    const eyebrow = panel.querySelector('.doctor-eyebrow');
    const heading = panel.querySelector('h2');
    const note = panel.querySelector('.panel-note');
    if (eyebrow) eyebrow.textContent = 'PATIENT QUEUE';
    if (heading) heading.textContent = 'Patient queue';
    if (note) note.textContent = "Prioritized patient list for today's appointments.";
  }

  async function loadSummary() {
    try { const summary = await window.HMS_API.get('/doctor/summary'); state.doctor = summary.doctor; state.backendAvailable = true; $('#doctorTodayPatients').textContent = summary.todayPatients; $('#doctorTodayAppointments').textContent = summary.todayAppointments; $('#doctorPendingCases').textContent = summary.pendingCases; $('#doctorEmergencyCases').textContent = summary.emergencyCases; setEmergencyVisibility(Number(summary.emergencyCases) > 0); } catch (error) { state.doctor = { name: accountName, department: 'Specialist Care', qualification: 'Heal Well clinical team', experience: 'On duty' }; const localAppointments = getRecords('appointments').filter((item) => isDemoDoctor || item.doctor === accountName || item.doctorName === accountName); $('#doctorTodayPatients').textContent = localAppointments.filter((item) => item.date === today()).length; $('#doctorTodayAppointments').textContent = localAppointments.filter((item) => item.date === today()).length; $('#doctorPendingCases').textContent = localAppointments.filter((item) => ['Pending', 'Confirmed'].includes(item.status)).length; const emergencyCount = getRecords('emergency').filter((item) => ['Critical', 'High'].includes(item.priority)).length; $('#doctorEmergencyCases').textContent = emergencyCount; setEmergencyVisibility(emergencyCount > 0); }
    renderIdentity();
  }

  async function loadAppointments() {
    const date = $('#doctorQueueDate').value || today();
    try { state.appointments = await window.HMS_API.get(`/doctor/appointments?date=${encodeURIComponent(date)}`); state.backendAvailable = true; } catch (error) { state.appointments = getRecords('appointments').filter((item) => String(item.date).slice(0, 10) === date && (isDemoDoctor || !state.doctor.name || item.doctor === state.doctor.name || item.doctorName === state.doctor.name)); }
    renderAppointments();
    renderPriorityQueue();
  }

  async function loadEmergencies() {
    try { state.emergencies = await window.HMS_API.get('/emergency'); } catch (error) { state.emergencies = getRecords('emergency'); }
    renderEmergencies();
  }

  async function loadSchedule() {
    try { const data = await window.HMS_API.get('/doctor/schedule'); state.schedules = data.schedules; state.leaves = data.leaves; state.backendAvailable = true; } catch (error) { state.schedules = [{ dayOfWeek: 1, startTime: '09:00', endTime: '13:00', slotDuration: 30 }, { dayOfWeek: 1, startTime: '14:00', endTime: '17:00', slotDuration: 30 }, { dayOfWeek: 2, startTime: '09:00', endTime: '13:00', slotDuration: 30 }, { dayOfWeek: 3, startTime: '09:00', endTime: '13:00', slotDuration: 30 }, { dayOfWeek: 4, startTime: '09:00', endTime: '13:00', slotDuration: 30 }, { dayOfWeek: 5, startTime: '09:00', endTime: '13:00', slotDuration: 30 }, { dayOfWeek: 6, startTime: '09:00', endTime: '12:00', slotDuration: 30 }]; state.leaves = []; }
    renderSchedule();
  }

  function renderIdentity() {
    const name = state.doctor.name || accountName; const firstName = name.replace(/^Dr\.\s*/i, '').split(' ')[0];
    $('#doctorNameHeading').textContent = firstName;
    $('#doctorDepartmentHeading').textContent = `${state.doctor.department || 'Specialist Care'} · Your appointments, patient context and care tools in one focused workspace.`;
    $('#doctorQualification').textContent = state.doctor.qualification || 'Specialist care';
    $('#doctorExperience').textContent = state.doctor.experience ? `${state.doctor.experience}+ years experience` : 'Heal Well Hospital';
    $('#doctorAvatar').textContent = name.replace(/^Dr\.\s*/i, '').split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  }

  function priorityFor(appointment) { if (appointment.priority) return appointment.priority; const text = `${appointment.reason || ''} ${appointment.condition || ''}`.toLowerCase(); if (/critical|chest pain|breathless|accident|stroke/.test(text)) return 'Critical'; if (/urgent|severe|high/.test(text)) return 'High'; if (/follow|review|pain/.test(text)) return 'Medium'; return 'Normal'; }
  function priorityClass(priority) { return String(priority).toLowerCase(); }
  function statusClass(status) { return String(status || 'Pending').toLowerCase().replace(/\s+/g, '-'); }

  function renderAppointments() {
    const container = $('#doctorAppointments');
    if (!state.appointments.length) { container.innerHTML = '<div class="doctor-empty"><i class="fa-regular fa-calendar"></i><strong>No appointments for this date</strong><span>Choose another date or review your schedule.</span></div>'; return; }
    container.innerHTML = [...state.appointments].sort((a, b) => timeValue(a.time).localeCompare(timeValue(b.time))).map((appointment) => { const id = appointment.id || appointment.appointmentId; const priority = priorityFor(appointment); return `<article class="doctor-appointment-row"><div class="queue-time"><strong>${escapeHtml(timeLabel(appointment.time))}</strong><span>${escapeHtml(priority)}</span></div><div class="queue-patient"><div class="queue-patient-top"><strong>${escapeHtml(appointment.patient || 'Patient')}</strong><span class="doctor-status ${statusClass(appointment.status)}">${escapeHtml(appointment.status || 'Pending')}</span></div><p>${escapeHtml(appointment.age ? `${appointment.age} yrs` : 'Age not recorded')} · ${escapeHtml(appointment.gender || 'Gender not recorded')} · ${escapeHtml(appointment.reason || 'Consultation')}</p><small>${escapeHtml(appointment.appointmentId || id)}</small></div><div class="queue-actions"><button type="button" data-doctor-action="view" data-doctor-id="${escapeHtml(id)}"><i class="fa-regular fa-eye"></i><span>View</span></button><button type="button" data-doctor-action="consult" data-doctor-id="${escapeHtml(id)}"><i class="fa-solid fa-stethoscope"></i><span>Consult</span></button><button type="button" data-doctor-action="complete" data-doctor-id="${escapeHtml(id)}"><i class="fa-solid fa-check"></i><span>Complete</span></button><button type="button" data-doctor-action="no-show" data-doctor-id="${escapeHtml(id)}"><i class="fa-solid fa-user-xmark"></i><span>No show</span></button></div></article>`; }).join('');
  }

  function renderPriorityQueue() {
    const priorityOrder = { Critical: 0, High: 1, Medium: 2, Normal: 3 }; const queue = [...state.appointments].sort((a, b) => priorityOrder[priorityFor(a)] - priorityOrder[priorityFor(b)] || timeValue(a.time).localeCompare(timeValue(b.time))).slice(0, 5);
    $('#priorityQueue').innerHTML = queue.length ? queue.map((appointment) => `<div class="priority-row"><i class="priority-dot ${priorityClass(priorityFor(appointment))}"></i><span><strong>${escapeHtml(appointment.patient || 'Patient')}</strong><small>${escapeHtml(priorityFor(appointment))} · ${escapeHtml(timeLabel(appointment.time))}</small></span><i class="fa-solid fa-arrow-right"></i></div>`).join('') : '<div class="doctor-empty compact-empty">No queue items.</div>';
  }

  function renderEmergencies() {
    const cases = [...state.emergencies].sort((a, b) => ({ Critical: 0, High: 1, Medium: 2, Low: 3 }[a.priority] ?? 4) - ({ Critical: 0, High: 1, Medium: 2, Low: 3 }[b.priority] ?? 4)).slice(0, 4);
    setEmergencyVisibility(cases.length > 0);
    $('#doctorEmergencies').innerHTML = cases.length ? cases.map((item) => `<div class="emergency-row"><span class="priority-dot ${priorityClass(item.priority)}"></span><span><strong>${escapeHtml(item.patient)}</strong><small>${escapeHtml(item.priority)} · ${escapeHtml(item.condition)}</small></span></div>`).join('') : '';
  }

  function renderSchedule() {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    $('#doctorScheduleList').innerHTML = state.schedules.length ? state.schedules.map((schedule) => `<div class="schedule-row"><span class="schedule-day">${days[schedule.dayOfWeek] || 'Working day'}</span><span class="schedule-hours"><i class="fa-regular fa-clock"></i> ${escapeHtml(timeLabel(schedule.startTime))} – ${escapeHtml(timeLabel(schedule.endTime))}</span><span class="schedule-duration">${Number(schedule.slotDuration || 30)} min slots</span></div>`).join('') : '<div class="doctor-empty compact-empty">No schedule configured.</div>';
    $('#doctorLeaves').innerHTML = state.leaves.length ? state.leaves.map((leave) => `<div class="leave-row"><span><i class="fa-solid fa-calendar-xmark"></i><strong>${escapeHtml(dateLabel(leave.leaveDate))}</strong><small>${escapeHtml(leave.reason || 'Doctor unavailable')}</small></span><button type="button" data-remove-leave="${escapeHtml(leave.id)}" aria-label="Remove leave"><i class="fa-solid fa-xmark"></i></button></div>`).join('') : '<div class="doctor-empty compact-empty">No upcoming leave dates.</div>';
  }

  function findAppointment(id) { return state.appointments.find((appointment) => String(appointment.id || appointment.appointmentId) === String(id)); }

  async function viewPatient(appointment) {
    let data;
    try { data = await window.HMS_API.get(`/doctor/patients/${encodeURIComponent(appointment.patientDbId || appointment.patientId)}`); } catch (error) { data = { patient: appointment, appointments: state.appointments.filter((item) => item.patient === appointment.patient), laboratory: getRecords('laboratory').filter((item) => item.patient === appointment.patient), consultations: [] }; }
    const patient = data.patient || appointment; $('#doctorModalContent').innerHTML = `<span class="doctor-eyebrow">PATIENT CONTEXT</span><h2>${escapeHtml(patient.name || patient.patient)}</h2><p class="modal-subtitle">${escapeHtml(patient.patientId || 'Patient profile')} · ${escapeHtml(patient.phone || 'Contact not recorded')}</p><div class="patient-detail-chips"><span><strong>${escapeHtml(patient.age || '—')}</strong><small>Age</small></span><span><strong>${escapeHtml(patient.gender || '—')}</strong><small>Gender</small></span><span><strong>${escapeHtml(patient.disease || '—')}</strong><small>Condition</small></span></div><div class="doctor-detail-section"><h3>Appointment history</h3>${(data.appointments || []).slice(0, 4).map((item) => `<p><strong>${escapeHtml(dateLabel(item.date))}</strong> · ${escapeHtml(item.doctor || '')} · ${escapeHtml(item.status || 'Pending')}</p>`).join('') || '<p>No previous visits recorded.</p>'}</div><div class="doctor-detail-section"><h3>Lab results</h3>${(data.laboratory || []).slice(0, 4).map((item) => `<p><strong>${escapeHtml(item.testName)}</strong> · ${escapeHtml(item.status)} · ${escapeHtml(item.result || 'Result pending')}</p>`).join('') || '<p>No lab results available.</p>'}</div>`; openModal('doctorModal');
  }

  function openConsultation(appointment) {
    $('#consultationAppointmentId').value = appointment.id || appointment.appointmentId;
    $('#consultationTitle').textContent = `Consultation · ${appointment.patient || 'Patient'}`;
    $('#consultationSubtitle').textContent = `${dateLabel(appointment.date)} at ${timeLabel(appointment.time)} · ${appointment.appointmentId || appointment.id}`;
    $('#consultationSymptoms').value = appointment.symptoms || '';
    $('#consultationDiagnosis').value = appointment.diagnosis || '';
    $('#consultationNotes').value = appointment.notes || '';
    $('#consultationPrescription').value = appointment.prescription || '';
    $('#consultationTests').value = appointment.recommendedTests || '';
    $('#consultationFollowUp').value = appointment.followUpDate || '';
    $('#consultationAlert').classList.remove('show'); openModal('consultationModal');
  }

  async function saveConsultation(event) {
    event.preventDefault(); const id = $('#consultationAppointmentId').value; const body = { symptoms: $('#consultationSymptoms').value.trim(), diagnosis: $('#consultationDiagnosis').value.trim(), notes: $('#consultationNotes').value.trim(), prescription: $('#consultationPrescription').value.trim(), recommendedTests: $('#consultationTests').value.trim(), followUpDate: $('#consultationFollowUp').value, complete: true };
    try { await window.HMS_API.post(`/doctor/appointments/${encodeURIComponent(id)}/consultation`, body); } catch (error) { if (!error.isNetworkError && !error.isBackendUnavailable) { showAlert('#consultationAlert', error.message, 'error'); return; } const records = getRecords('appointments').map((item) => String(item.id || item.appointmentId) === String(id) ? { ...item, ...body, status: 'Completed' } : item); setRecords('appointments', records); }
    logPortalActivity(`Doctor completed consultation for ${findAppointment(id)?.patient || 'a patient'}`, 'fa-stethoscope'); closeModal('consultationModal'); await loadAppointments(); await loadSummary();
  }

  async function completeAppointment(id) { const appointment = findAppointment(id); if (!appointment) return; openConsultation(appointment); }

  async function noShowAppointment(id) { if (!window.confirm('Mark this appointment as No Show?')) return; const appointment = findAppointment(id); try { await window.HMS_API.put(`/appointments/${encodeURIComponent(id)}`, { status: 'No Show' }); } catch (error) { if (!error.isNetworkError && !error.isBackendUnavailable) return; setRecords('appointments', getRecords('appointments').map((item) => String(item.id || item.appointmentId) === String(id) ? { ...item, status: 'No Show' } : item)); } logPortalActivity(`Doctor marked ${appointment?.patient || 'an appointment'} as No Show`, 'fa-user-xmark'); await loadAppointments(); }

  async function saveLeave(event) { event.preventDefault(); const leaveDate = $('#leaveDate').value; if (leaveDate < today()) { showAlert('#leaveAlert', 'Choose a future leave date.', 'error'); return; } try { await window.HMS_API.post('/doctor/leave', { leaveDate, reason: $('#leaveReason').value.trim() }); } catch (error) { if (!error.isNetworkError && !error.isBackendUnavailable) { showAlert('#leaveAlert', error.message, 'error'); return; } } closeModal('leaveModal'); await loadSchedule(); }

  async function removeLeave(id) { if (!window.confirm('Remove this leave date?')) return; try { await window.HMS_API.delete(`/doctor/leave/${encodeURIComponent(id)}`); } catch (error) { if (!error.isNetworkError && !error.isBackendUnavailable) return; } await loadSchedule(); }

  function bindEvents() {
    configureQueueLabels(); setEmergencyVisibility(false);
    const menuToggle = $('#doctorMenuToggle'); const doctorNav = $('#doctorNav'); menuToggle.addEventListener('click', () => { const open = doctorNav.classList.toggle('open'); menuToggle.setAttribute('aria-expanded', String(open)); menuToggle.innerHTML = `<i class="fa-solid fa-${open ? 'xmark' : 'bars'}"></i>`; }); doctorNav.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => { doctorNav.classList.remove('open'); menuToggle.setAttribute('aria-expanded', 'false'); menuToggle.innerHTML = '<i class="fa-solid fa-bars"></i>'; }));
    $('#doctorQueueDate').value = today(); $('#doctorQueueDate').addEventListener('change', loadAppointments);
    $('#doctorAppointments').addEventListener('click', async (event) => { const button = event.target.closest('[data-doctor-action]'); if (!button) return; const appointment = findAppointment(button.dataset.doctorId); if (!appointment) return; if (button.dataset.doctorAction === 'view') viewPatient(appointment); if (button.dataset.doctorAction === 'consult') openConsultation(appointment); if (button.dataset.doctorAction === 'complete') completeAppointment(button.dataset.doctorId); if (button.dataset.doctorAction === 'no-show') noShowAppointment(button.dataset.doctorId); });
    $('#doctorLeaves').addEventListener('click', (event) => { const button = event.target.closest('[data-remove-leave]'); if (button) removeLeave(button.dataset.removeLeave); });
    $('#consultationForm').addEventListener('submit', saveConsultation); $('#leaveForm').addEventListener('submit', saveLeave);
    $('#addLeaveButton').addEventListener('click', () => { $('#leaveDate').min = today(); $('#leaveDate').value = ''; $('#leaveReason').value = ''; $('#leaveAlert').classList.remove('show'); openModal('leaveModal'); });
    document.querySelectorAll('[data-close-doctor-modal]').forEach((button) => button.addEventListener('click', () => closeModal('doctorModal'))); document.querySelectorAll('[data-close-consultation-modal]').forEach((button) => button.addEventListener('click', () => closeModal('consultationModal'))); document.querySelectorAll('[data-close-leave-modal]').forEach((button) => button.addEventListener('click', () => closeModal('leaveModal')));
    document.querySelectorAll('.doctor-modal').forEach((modal) => modal.addEventListener('click', (event) => { if (event.target === modal) closeModal(modal.id); }));
    $('#doctorLogout').addEventListener('click', () => { localStorage.removeItem('hmsLoggedIn'); localStorage.removeItem('hmsRole'); localStorage.removeItem('hmsUser'); window.HMS_API.setToken(); window.location.href = 'index.html'; });
  }

  bindEvents();
  (async function initializeDoctorPortal() { await loadSummary(); await loadAppointments(); await loadEmergencies(); await loadSchedule(); }());
})();
