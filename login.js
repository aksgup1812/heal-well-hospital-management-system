/* Redirect authenticated users away from the login page. */
if (localStorage.getItem('hmsLoggedIn') === 'true') {
  const role = localStorage.getItem('hmsRole');
  window.location.replace(role === 'patient' ? 'patient-portal.html' : role === 'doctor' ? 'doctor-portal.html' : 'dashboard.html');
}

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
    const accounts = { admin: { password: 'admin123', name: 'Administrator', role: 'admin' }, doctor: { password: 'doctor123', name: 'Doctor', role: 'doctor' } };
    const registeredPatients = JSON.parse(localStorage.getItem('hmsPatientAccounts') || '[]');
    const demoPatient = { password: 'patient123', name: 'Demo Patient', role: 'patient', patientId: 'PATIENT-DEMO', phone: '9999999999' };
    account = error.isNetworkError || error.isBackendUnavailable ? (accounts[loginId] || (normalizedPhone === demoPatient.phone ? demoPatient : registeredPatients.find((patient) => patient.phone === normalizedPhone || patient.phone === loginId))) : null;
  }
  if (account && (authenticatedByApi || password === account.password)) {
    localStorage.setItem('hmsLoggedIn', 'true');
    localStorage.setItem('hmsUser', account.name);
    localStorage.setItem('hmsRole', account.role);
    if (account.role === 'patient') localStorage.setItem('hmsPatientAccount', JSON.stringify({ patientId: account.patientId, name: account.name, phone: account.phone || '' }));
    else localStorage.removeItem('hmsPatientAccount');
    window.location.href = account.role === 'patient' ? 'patient-portal.html' : account.role === 'doctor' ? 'doctor-portal.html' : 'dashboard.html';
  } else {
    alert.textContent = 'Invalid credentials. Please use one of the accounts shown below.';
    alert.classList.remove('d-none');
  }
});
