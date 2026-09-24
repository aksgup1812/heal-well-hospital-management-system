/* Premium homepage interactions: navigation, search, live doctor cards, counters, and testimonials. */
(() => {
  'use strict';

  const fallbackDoctors = [
    { doctorId: 'DOC-1001', name: 'Dr. Ananya Rao', department: 'Cardiology', qualification: 'MD, DM', experience: 12 },
    { doctorId: 'DOC-1002', name: 'Dr. Vikram Mehta', department: 'Orthopedics', qualification: 'MS Ortho', experience: 9 },
    { doctorId: 'DOC-1003', name: 'Dr. Neha Kapoor', department: 'General Medicine', qualification: 'MD Medicine', experience: 8 },
    { doctorId: 'DOC-1004', name: 'Dr. Rohan Iyer', department: 'Neurology', qualification: 'DM Neurology', experience: 14 }
  ];
  const testimonials = [
    { initials: 'AS', name: 'Aarav S.', quote: 'The team made every step feel simple and reassuring. I always knew who to speak with next.' },
    { initials: 'MR', name: 'Meera R.', quote: 'The appointment process was clear, and the doctors took time to answer every question.' },
    { initials: 'KV', name: 'Kavya V.', quote: 'A calm, thoughtful experience from reception to follow-up. Heal Well feels genuinely patient-first.' }
  ];
  let testimonialIndex = 0;

  function escapeHtml(value = '') { return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character])); }

  function setupNavigation() {
    const header = document.querySelector('#siteHeader');
    const toggle = document.querySelector('#mobileNavToggle');
    const nav = document.querySelector('#siteNav');
    const closeMenu = () => { nav.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); toggle.innerHTML = '<i class="fa-solid fa-bars"></i>'; };
    toggle.addEventListener('click', () => {
      const isOpen = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(isOpen));
      toggle.innerHTML = `<i class="fa-solid fa-${isOpen ? 'xmark' : 'bars'}"></i>`;
    });
    nav.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeMenu));
    window.addEventListener('scroll', () => header.classList.toggle('compact', window.scrollY > 24), { passive: true });
  }

  function setupSearch(doctors) {
    const input = document.querySelector('#siteSearch');
    const results = document.querySelector('#searchResults');
    const clearButton = document.querySelector('#clearSearch');
    const items = [
      ...doctors.map((doctor) => ({ title: doctor.name, detail: `${doctor.department} · ${doctor.qualification || 'Specialist'}`, target: '#doctors', search: `${doctor.name} ${doctor.department} ${doctor.qualification}` })),
      ...[...document.querySelectorAll('.specialty-card')].map((card) => ({ title: card.querySelector('strong').textContent, detail: card.querySelector('span').textContent, target: '#departments', search: card.dataset.search })),
      ...[...document.querySelectorAll('.quick-action-card')].map((card) => ({ title: card.querySelector('strong').textContent, detail: card.querySelector('p').textContent, target: '#services', search: card.textContent }))
    ];
    const render = () => {
      const term = input.value.trim().toLowerCase();
      clearButton.classList.toggle('visible', Boolean(term));
      if (!term) { results.classList.remove('show'); results.innerHTML = ''; return; }
      const matches = items.filter((item) => item.search.toLowerCase().includes(term)).slice(0, 6);
      results.innerHTML = matches.length ? matches.map((item) => `<button type="button" data-target="${item.target}"><span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.detail)}</small></span><i class="fa-solid fa-arrow-up-right-from-square"></i></button>`).join('') : '<p class="search-empty">No matching care option found. Try a doctor, specialty or service.</p>';
      results.classList.add('show');
      results.querySelectorAll('button').forEach((button) => button.addEventListener('click', () => { document.querySelector(button.dataset.target)?.scrollIntoView({ behavior: 'smooth' }); input.value = ''; render(); }));
    };
    input.addEventListener('input', render);
    clearButton.addEventListener('click', () => { input.value = ''; render(); input.focus(); });
    document.addEventListener('click', (event) => { if (!event.target.closest('.smart-search')) results.classList.remove('show'); });
  }

  function renderDoctors(doctors) {
    const container = document.querySelector('#featuredDoctors');
    container.innerHTML = doctors.slice(0, 4).map((doctor, index) => `<article class="doctor-card searchable-item" data-search="${escapeHtml(`${doctor.name} ${doctor.department} ${doctor.qualification || ''}`)}"><div class="doctor-photo"><span>${escapeHtml(doctor.name.split(' ').filter(Boolean).slice(-2).map((word) => word[0]).join(''))}</span><small><i class="fa-solid fa-circle"></i> Available</small></div><div class="doctor-card-body"><span class="doctor-department">${escapeHtml(doctor.department || 'Specialist Care')}</span><h3>${escapeHtml(doctor.name)}</h3><p>${escapeHtml(doctor.qualification || 'Experienced Specialist')}</p><div class="doctor-meta"><span><i class="fa-solid fa-star"></i> ${(4.8 - index * 0.1).toFixed(1)}</span><span><i class="fa-regular fa-clock"></i> ${Number(doctor.experience || 5)}+ yrs</span></div><div class="doctor-actions"><a href="login.html?service=Book%20an%20Appointment">Book Appointment</a></div></div></article>`).join('');
  }

  async function loadDoctors() {
    let doctors = fallbackDoctors;
    renderDoctors(doctors);
    setupSearch(doctors);
    try {
      const baseUrl = window.HMS_API_URL || 'http://localhost:5000/api';
      const response = await fetch(`${baseUrl}/public/doctors`);
      if (response.ok) { const data = await response.json(); if (data.length) doctors = data; }
    } catch (error) { /* The static homepage intentionally retains safe demo doctors offline. */ }
    if (doctors !== fallbackDoctors) renderDoctors(doctors);
  }

  function setupRevealAnimations() {
    const elements = document.querySelectorAll('.reveal-on-scroll, .feature-grid article, .specialty-card, .package-card, .journey-track > div');
    if (!('IntersectionObserver' in window)) { elements.forEach((element) => element.classList.add('is-visible')); return; }
    const observer = new IntersectionObserver((entries, currentObserver) => entries.forEach((entry) => { if (entry.isIntersecting) { entry.target.classList.add('is-visible'); currentObserver.unobserve(entry.target); } }), { threshold: 0.12 });
    elements.forEach((element) => observer.observe(element));
  }

  function setupCounters() {
    const counters = document.querySelectorAll('[data-count]');
    const animate = (element) => {
      const target = Number(element.dataset.count); let value = 0; const step = Math.max(1, Math.ceil(target / 35));
      const timer = window.setInterval(() => { value = Math.min(target, value + step); element.textContent = `${value}${target > 20 ? '+' : ''}`; if (value >= target) window.clearInterval(timer); }, 32);
    };
    if (!('IntersectionObserver' in window)) { counters.forEach(animate); return; }
    const observer = new IntersectionObserver((entries, currentObserver) => entries.forEach((entry) => { if (entry.isIntersecting) { animate(entry.target); currentObserver.unobserve(entry.target); } }), { threshold: 0.6 });
    counters.forEach((counter) => observer.observe(counter));
  }

  function renderTestimonial() {
    const item = testimonials[testimonialIndex];
    document.querySelector('#testimonialQuote').textContent = `“${item.quote}”`;
    document.querySelector('#testimonialName').textContent = item.name;
    document.querySelector('#testimonialAvatar').textContent = item.initials;
  }

  function setupTestimonials() {
    document.querySelector('#testimonialPrev').addEventListener('click', () => { testimonialIndex = (testimonialIndex - 1 + testimonials.length) % testimonials.length; renderTestimonial(); });
    document.querySelector('#testimonialNext').addEventListener('click', () => { testimonialIndex = (testimonialIndex + 1) % testimonials.length; renderTestimonial(); });
  }

  document.addEventListener('DOMContentLoaded', () => {
    setupNavigation();
    const doctorDirectoryLink = document.querySelector('.doctors-section .dark-button');
    if (doctorDirectoryLink) doctorDirectoryLink.href = '#doctors';
    setupTestimonials();
    setupRevealAnimations();
    setupCounters();
    loadDoctors();
  });
})();
