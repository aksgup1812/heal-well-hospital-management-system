/* Create a unique local patient account for the appointment portal. */
if (localStorage.getItem('hmsLoggedIn') === 'true') {
  const role = localStorage.getItem('hmsRole');
  window.location.replace(role === 'patient' ? 'patient-portal.html' : role === 'doctor' ? 'doctor-portal.html' : 'dashboard.html');
}

document.getElementById('registerForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.checkValidity()) { form.classList.add('was-validated'); return; }
  const alert = document.getElementById('registerAlert');
  const name = document.getElementById('registerName').value.trim();
  const phone = document.getElementById('registerPhone').value.trim().replace(/\D/g, '');
  const password = document.getElementById('registerPassword').value;
  const accounts = JSON.parse(localStorage.getItem('hmsPatientAccounts') || '[]');
  if (accounts.some((account) => account.phone === phone) || phone === '9999999999') {
    alert.textContent = 'An account already exists with this phone number.';
    alert.classList.remove('d-none');
    return;
  }
  let account;
  try {
    const result = await window.HMS_API.post('/auth/register', { name, phone, password });
    account = { ...result.user, phone, password, role: 'patient' };
    window.HMS_API.setToken(result.token);
  } catch (error) {
    if (!error.isNetworkError && !error.isBackendUnavailable) { alert.textContent = error.message; alert.classList.remove('d-none'); return; }
    const patientId = `PATIENT-${Date.now()}`;
    account = { patientId, password, name, phone, role: 'patient' };
  }
  const patientId = account.patientId || `PATIENT-${Date.now()}`;
  account.patientId = patientId;
  accounts.push(account);
  localStorage.setItem('hmsPatientAccounts', JSON.stringify(accounts));
  localStorage.setItem('hmsLoggedIn', 'true');
  localStorage.setItem('hmsUser', name);
  localStorage.setItem('hmsRole', 'patient');
  localStorage.setItem('hmsPatientAccount', JSON.stringify({ patientId, name, phone }));
  localStorage.setItem('hmsPatientProfile', JSON.stringify({ name, phone }));
  window.location.href = 'patient-portal.html';
});
