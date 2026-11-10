// Gemeinsame Funktionen für alle Seiten: Navigation, Header, Bild-Fallbacks.
(() => {
  const header = document.querySelector('.site-header');
  const onScroll = () => header && header.classList.toggle('is-scrolled', window.scrollY > 12);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  const toggle = document.querySelector('.menu-toggle');
  const links = document.getElementById('nav-links');
  if (toggle && links) {
    toggle.addEventListener('click', () => {
      const open = toggle.getAttribute('aria-expanded') !== 'true';
      toggle.setAttribute('aria-expanded', String(open));
      links.classList.toggle('is-open', open);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && links.classList.contains('is-open')) { toggle.click(); toggle.focus(); }
    });
  }

  // Muster unter dem Glas: bewegt sich beim Scrollen in die Gegenrichtung (nach unten, wenn die Seite nach oben läuft).
  const pattern = document.querySelector('.bg-pattern');
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (pattern && !still) {
    const TILE = 1680; // Kachelhöhe des Musters: nahtlose Wiederholung
    const SPEED = 0.32;
    let ticking = false;
    const move = () => {
      pattern.style.setProperty('--py', `${(window.scrollY * SPEED) % TILE}px`);
      ticking = false;
    };
    window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(move); } }, { passive: true });
    move();
  }

  document.querySelectorAll('[data-year]').forEach((el) => (el.textContent = new Date().getFullYear()));

  // Falls ein externes Bild nicht lädt: ruhige Fläche statt kaputtem Bildsymbol.
  document.querySelectorAll('img[data-fallback]').forEach((img) => {
    const fail = () => { img.style.visibility = 'hidden'; img.parentElement?.classList.add('img-fallback'); };
    if (img.complete && img.naturalWidth === 0 && img.src) fail();
    img.addEventListener('error', fail, { once: true });
  });
})();
