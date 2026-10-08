/* Redirect authenticated users away from the login page. */
if (localStorage.getItem('hmsLoggedIn') === 'true') {
  const role = localStorage.getItem('hmsRole');
  window.location.replace(role === 'patient' ? 'patient-portal.html' : role === 'doctor' ? 'doctor-portal.html' : 'dashboard.html');
}

const doctorDemoCredentials = [
  ['Dr. Ananya Rao', 'ananya.rao', 'HealWell@1001'],
  ['Dr. Vikram Mehta', 'vikram.mehta', 'HealWell@1002'],
  ['Dr. Neha Kapoor', 'neha.kapoor', 'HealWell@1003'],
  ['Dr. Rohan Iyer', 'rohan.iyer', 'HealWell@1004'],
  ['Dr. Meera Shah', 'meera.shah', 'HealWell@1005'],
  ['Dr. Arjun Malhotra', 'arjun.malhotra', 'HealWell@1006'],
  ['Dr. Kavya Menon', 'kavya.menon', 'HealWell@1007'],
  ['Dr. Sameer Patel', 'sameer.patel', 'HealWell@1008']
];
const demoAccountBox = document.querySelector('.demo-box');
if (demoAccountBox) demoAccountBox.insertAdjacentHTML('beforeend', doctorDemoCredentials.map(([name, username, password]) => `<span><b>${name}:</b> <code>${username}</code> / <code>${password}</code></span>`).join(''));

/* Toggle password visibility without changing the stored value. */
document.getElementById('togglePassword').addEventListener('click', () => {
  const password = document.getElementById('password');
  password.type = password.type === 'password' ? 'text' : 'password';
  document.querySelector('#togglePassword i').classList.toggle('fa-eye-slash');
});

/* Validate credentials against the API, with the original demo fallback for offline use. */
document.getElementById('loginForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const loginId = document.getElementById('username').value.trim();
  const accountKey = loginId.toLowerCase();
  const normalizedPhone = loginId.replace(/\D/g, '');
  const password = document.getElementById('password').value;
  const alert = document.getElementById('loginAlert');
  let account;
  let authenticatedByApi = false;
  try {
    const result = await window.HMS_API.post('/auth/login', { username: loginId, phone: normalizedPhone, password });
    account = result.user;
    authenticatedByApi = true;
    window.HMS_API.setToken(result.token);
  } catch (error) {
    const accounts = {
      admin: { password: 'admin123', name: 'Administrator', role: 'admin' },
      doctor: { password: 'doctor123', name: 'Doctor', role: 'doctor', allBookings: true },
      'ananya.rao': { password: 'HealWell@1001', name: 'Dr. Ananya Rao', role: 'doctor', doctorId: 'DOC-1001' },
      'vikram.mehta': { password: 'HealWell@1002', name: 'Dr. Vikram Mehta', role: 'doctor', doctorId: 'DOC-1002' },
      'neha.kapoor': { password: 'HealWell@1003', name: 'Dr. Neha Kapoor', role: 'doctor', doctorId: 'DOC-1003' },
      'rohan.iyer': { password: 'HealWell@1004', name: 'Dr. Rohan Iyer', role: 'doctor', doctorId: 'DOC-1004' },
      'meera.shah': { password: 'HealWell@1005', name: 'Dr. Meera Shah', role: 'doctor', doctorId: 'DOC-1005' },
      'arjun.malhotra': { password: 'HealWell@1006', name: 'Dr. Arjun Malhotra', role: 'doctor', doctorId: 'DOC-1006' },
      'kavya.menon': { password: 'HealWell@1007', name: 'Dr. Kavya Menon', role: 'doctor', doctorId: 'DOC-1007' },
      'sameer.patel': { password: 'HealWell@1008', name: 'Dr. Sameer Patel', role: 'doctor', doctorId: 'DOC-1008' }
    };
    const registeredPatients = JSON.parse(localStorage.getItem('hmsPatientAccounts') || '[]');
    const demoPatient = { password: 'patient123', name: 'Demo Patient', role: 'patient', patientId: 'PATIENT-DEMO', phone: '9999999999' };
    account = error.isNetworkError || error.isBackendUnavailable ? (accounts[accountKey] || (normalizedPhone === demoPatient.phone ? demoPatient : registeredPatients.find((patient) => patient.phone === normalizedPhone || patient.phone === loginId))) : null;
  }
  if (account && (authenticatedByApi || password === account.password)) {
    localStorage.setItem('hmsLoggedIn', 'true');
    localStorage.setItem('hmsUser', account.name);
    localStorage.setItem('hmsRole', account.role);
    if (account.role === 'doctor') localStorage.setItem('hmsDoctorAccount', JSON.stringify({ doctorId: account.doctorId || null, name: account.name, allBookings: Boolean(account.allBookings) }));
    else localStorage.removeItem('hmsDoctorAccount');
    if (account.role === 'patient') localStorage.setItem('hmsPatientAccount', JSON.stringify({ patientId: account.patientId, name: account.name, phone: account.phone || '' }));
    else localStorage.removeItem('hmsPatientAccount');
    window.location.href = account.role === 'patient' ? 'patient-portal.html' : account.role === 'doctor' ? 'doctor-portal.html' : 'dashboard.html';
  } else {
    alert.textContent = 'Invalid credentials. Please use one of the accounts shown below.';
    alert.classList.remove('d-none');
  }
});

