// Galerie: Filter, Lightbox mit Tastatur- und Wischsteuerung, Vorher-Nachher-Regler.
(() => {
  const BASE = 'https://images.unsplash.com/photo-';
  // Eigene Fotos: Einfach "src" durch einen Pfad wie "assets/img/gallery/meinbild.jpg" ersetzen.
  const PHOTOS = [
    { id: '1499336315816-097655dcfbda', cat: 'landschaft', title: 'Schneebedeckter Gipfel', r: '4/5' },
    { id: '1534528741775-53994a69daeb', cat: 'portraet', title: 'Porträt im Seitenlicht', r: '4/5' },
    { id: '1705674076072-41db4ff670e8', cat: 'makro', title: 'Wassertropfen auf Blüte', r: '1/1' },
    { id: '1531149376654-4b84808dcfa8', cat: 'landschaft', title: 'Berg im Nebel', r: '3/2' },
    { id: '1506863530036-1efeddceb993', cat: 'portraet', title: 'Schwarzweiß-Porträt', r: '2/3' },
    { id: '1532614208657-10b8d7815f40', cat: 'makro', title: 'Blütenblätter in Lagen', r: '4/5' },
    { id: '1450387635522-8ecb968079bf', cat: 'landschaft', title: 'Felsformationen unter Wolken', r: '3/2' },
    { id: '1516117525866-d85459db7457', cat: 'portraet', title: 'Geringe Schärfentiefe', r: '4/5' },
    { id: '1603353139254-70e25b77b8f2', cat: 'makro', title: 'Gelb und Violett', r: '1/1' },
    { id: '1711708700663-4c35102fc4b8', cat: 'landschaft', title: 'Bergkette bei Nacht', r: '3/2' },
    { id: '1614606290414-41c139b5fae9', cat: 'portraet', title: 'Kerzenlicht', r: '2/3' },
    { id: '1778779213335-52baac00aed8', cat: 'makro', title: 'Pfingstrose, Staubgefäße', r: '4/5' },
    { id: '1729151365395-230cd2603b5e', cat: 'landschaft', title: 'Bergsee im Herbst', r: '3/2' },
    { id: '1499155286265-79a9dc9c6380', cat: 'portraet', title: 'Selektiver Fokus', r: '4/5' },
    { id: '1620062317671-ef6441546d7d', cat: 'makro', title: 'Dahlie', r: '1/1' },
  ];
  const CAT = { landschaft: 'Landschaft', portraet: 'Porträt', makro: 'Makro' };
  const dims = (r, w) => { const [a, b] = r.split('/').map(Number); return { w, h: Math.round((w * b) / a) }; };
  const url = (p, w, crop = true) => {
    if (p.src) return p.src;
    const d = dims(p.r, w);
    return `${BASE}${p.id}?auto=format&q=80&w=${d.w}${crop ? `&h=${d.h}&fit=crop` : ''}`;
  };

  const grid = document.getElementById('gallery');
  if (!grid) return;
  PHOTOS.forEach((p, i) => {
    const b = document.createElement('button');
    b.className = 'gallery-item';
    b.dataset.cat = p.cat;
    b.dataset.index = i;
    b.style.aspectRatio = p.r;
    b.setAttribute('aria-label', `${p.title} vergrößern`);
    const img = new Image();
    img.loading = 'lazy';
    img.decoding = 'async';
    img.alt = p.title;
    const d = dims(p.r, 800);
    img.width = d.w; img.height = d.h;
    img.src = url(p, 800);
    img.srcset = `${url(p, 500)} 500w, ${url(p, 800)} 800w, ${url(p, 1200)} 1200w`;
    img.sizes = '(max-width: 640px) 100vw, (max-width: 1000px) 50vw, 400px';
    img.addEventListener('load', () => img.classList.add('is-loaded'));
    img.addEventListener('error', () => b.classList.add('img-fallback'));
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.innerHTML = '<span></span><span></span>';
    meta.children[0].textContent = p.title;
    meta.children[1].textContent = CAT[p.cat];
    b.append(img, meta);
    grid.append(b);
  });

  // Filter
  const chips = document.querySelectorAll('.chip[data-filter]');
  chips.forEach((c) => c.addEventListener('click', () => {
    chips.forEach((x) => x.setAttribute('aria-pressed', String(x === c)));
    const f = c.dataset.filter;
    grid.querySelectorAll('.gallery-item').forEach((it) => (it.hidden = f !== 'alle' && it.dataset.cat !== f));
  }));

  // Lightbox
  const lb = document.getElementById('lightbox');
  const lbImg = document.getElementById('lb-img');
  const lbTitle = document.getElementById('lb-title');
  const lbCount = document.getElementById('lb-count');
  let current = 0, lastFocus = null;
  const visible = () => [...grid.querySelectorAll('.gallery-item:not([hidden])')].map((b) => Number(b.dataset.index));
  function show(i) {
    const list = visible();
    current = i;
    const p = PHOTOS[i];
    lbImg.src = url(p, 2000, false);
    lbImg.alt = p.title;
    lbTitle.textContent = p.title;
    lbCount.textContent = `${list.indexOf(i) + 1} / ${list.length}  ${CAT[p.cat]}`;
  }
  function open(i) { lastFocus = document.activeElement; show(i); lb.classList.add('is-open'); document.body.style.overflow = 'hidden'; lb.querySelector('.lb-close').focus(); }
  function close() { lb.classList.remove('is-open'); document.body.style.overflow = ''; lbImg.removeAttribute('src'); lastFocus?.focus(); }
  function step(d) { const list = visible(); const k = list.indexOf(current); show(list[(k + d + list.length) % list.length]); }
  grid.addEventListener('click', (e) => { const b = e.target.closest('.gallery-item'); if (b) open(Number(b.dataset.index)); });
  lb.addEventListener('click', (e) => {
    const a = e.target.closest('[data-lb]')?.dataset.lb;
    if (a === 'close') close(); else if (a === 'prev') step(-1); else if (a === 'next') step(1);
    else if (e.target === lb || e.target.classList.contains('lightbox-stage')) close();
  });
  document.addEventListener('keydown', (e) => {
    if (!lb.classList.contains('is-open')) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowRight') step(1);
    if (e.key === 'ArrowLeft') step(-1);
    if (e.key === 'Tab') { // Fokus im Dialog halten
      const f = [...lb.querySelectorAll('button')]; const i = f.indexOf(document.activeElement);
      e.preventDefault(); f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
    }
  });
  let tx = null;
  lb.addEventListener('touchstart', (e) => (tx = e.touches[0].clientX), { passive: true });
  lb.addEventListener('touchend', (e) => {
    if (tx === null) return;
    const dx = e.changedTouches[0].clientX - tx;
    if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
    tx = null;
  });

  // Vorher / Nachher
  const cmp = document.getElementById('compare');
  if (cmp) {
    const range = cmp.querySelector('input');
    const set = () => cmp.style.setProperty('--pos', `${range.value}%`);
    range.addEventListener('input', set);
    set();
  }
})();
