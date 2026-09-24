/* Shared Heal Well theme controller: persists one readable light/dark choice across every portal. */
(() => {
  'use strict';

  const storageKey = 'healWellTheme';
  const root = document.documentElement;

  /* Read the saved preference, preserving the older admin-only preference when present. */
  function getInitialTheme() {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved === 'light' || saved === 'dark') return saved;
      if (localStorage.getItem('hmsDarkMode') === 'true') return 'dark';
    } catch (error) {
      // Use the system preference when browser storage is unavailable.
    }
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  /* Apply the theme before the page renders and update every visible switch. */
  function applyTheme(theme, persist = true) {
    const nextTheme = theme === 'dark' ? 'dark' : 'light';
    const isDark = nextTheme === 'dark';
    root.dataset.theme = nextTheme;
    root.style.colorScheme = nextTheme;
    document.body?.classList.toggle('dark-mode', isDark);

    document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
      const icon = button.querySelector('[data-theme-icon]') || button.querySelector('i');
      const label = button.querySelector('[data-theme-label]');
      if (icon) icon.className = isDark ? 'fa-solid fa-sun' : 'fa-regular fa-moon';
      if (label) label.textContent = isDark ? 'Light mode' : 'Dark mode';
      button.title = isDark ? 'Switch to light mode' : 'Switch to dark mode';
      button.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
      button.setAttribute('aria-pressed', String(isDark));
    });

    if (persist) {
      try {
        localStorage.setItem(storageKey, nextTheme);
        localStorage.setItem('hmsDarkMode', String(isDark));
      } catch (error) {
        // The UI still works when storage is blocked.
      }
    }
    window.dispatchEvent(new CustomEvent('healwellthemechange', { detail: { theme: nextTheme } }));
  }

  applyTheme(getInitialTheme(), false);

  document.addEventListener('DOMContentLoaded', () => applyTheme(root.dataset.theme || getInitialTheme(), false), { once: true });

  document.addEventListener('click', (event) => {
    const toggle = event.target.closest('[data-theme-toggle]');
    if (!toggle) return;
    event.preventDefault();
    applyTheme(root.dataset.theme === 'dark' ? 'light' : 'dark');
  });

  window.addEventListener('storage', (event) => {
    if (event.key === storageKey && (event.newValue === 'light' || event.newValue === 'dark')) applyTheme(event.newValue, false);
  });

  window.HMS_THEME = { apply: applyTheme, get: () => root.dataset.theme || 'light' };
})();
