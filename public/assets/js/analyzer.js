// AI Photo Analyzer – Upload, Vorschau, Verkleinerung im Browser, Aufruf des eigenen Backends, Ergebnisdarstellung.
// Der OpenAI-Schlüssel ist NICHT hier: der Browser spricht nur mit /api/analyze auf dem eigenen Server.
(() => {
  const MAX_FILE = 15 * 1024 * 1024;      // erlaubte Originalgröße
  const MAX_SIDE = 2048;                   // längste Kante nach Verkleinerung
  const MAX_UPLOAD = 3.8 * 1024 * 1024;    // Zielgröße für den Upload
  const TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  const TIMEOUT = 110_000;

  const $ = (id) => document.getElementById(id);
  const dz = $('dropzone'), input = $('file-input'), preview = $('preview');
  const info = $('file-info'), change = $('file-change'), btn = $('analyze-btn');
  const progress = $('progress'), bar = $('progress-bar'), ptext = $('progress-text'), ptime = $('progress-time');
  const errorBox = $('error'), results = $('results');
  if (!dz) return;

  let file = null, previewUrl = null, busy = false;

  const fmtSize = (b) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : `${Math.round(b / 1024)} KB`);
  function showError(msg) { errorBox.textContent = msg; errorBox.classList.add('is-visible'); }
  function clearError() { errorBox.classList.remove('is-visible'); errorBox.textContent = ''; }

  function setFile(f) {
    clearError();
    if (!f) return;
    const okType = TYPES.includes(f.type) || /\.(jpe?g|png|webp)$/i.test(f.name);
    if (!okType) return showError('Dieses Format wird nicht unterstützt. Bitte wähle ein JPG-, PNG- oder WEBP-Bild.');
    if (f.size > MAX_FILE) return showError(`Das Foto ist ${fmtSize(f.size)} groß. Erlaubt sind maximal 15 MB.`);
    if (f.size === 0) return showError('Die Datei ist leer. Bitte wähle ein anderes Foto.');
    file = f;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(f);
    preview.src = previewUrl;
    preview.onerror = () => { reset(); showError('Das Bild konnte nicht geöffnet werden. Die Datei ist möglicherweise beschädigt.'); };
    dz.classList.add('has-image');
    info.textContent = `${f.name}  ${fmtSize(f.size)}`;
    change.hidden = false;
    btn.disabled = false;
    results.classList.remove('is-visible');
  }
  function reset() {
    file = null;
    dz.classList.remove('has-image');
    preview.removeAttribute('src');
    info.textContent = '';
    change.hidden = true;
    btn.disabled = true;
    input.value = '';
  }

  input.addEventListener('change', () => setFile(input.files[0]));
  change.addEventListener('click', () => { if (!busy) input.click(); });
  dz.addEventListener('click', (e) => { if (dz.classList.contains('has-image') || busy) e.preventDefault(); });
  ['dragenter', 'dragover'].forEach((t) => dz.addEventListener(t, (e) => { e.preventDefault(); if (!busy) dz.classList.add('is-drag'); }));
  ['dragleave', 'drop'].forEach((t) => dz.addEventListener(t, (e) => { e.preventDefault(); dz.classList.remove('is-drag'); }));
  dz.addEventListener('drop', (e) => { if (!busy && e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]); });
  document.addEventListener('paste', (e) => { const f = [...(e.clipboardData?.files || [])][0]; if (f && !busy) setFile(f); });

  // Bild im Browser verkleinern: spart Upload-Zeit und API-Kosten, entfernt nebenbei EXIF-Daten (z. B. GPS).
  async function prepare(f) {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Das Bild konnte nicht gelesen werden. Bitte versuche ein anderes Foto.'));
      i.src = previewUrl;
    });
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale)), h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff'; // transparente PNGs bekommen einen weißen Hintergrund
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    for (const q of [0.88, 0.78, 0.66, 0.5]) {
      const dataUrl = canvas.toDataURL('image/jpeg', q);
      if (dataUrl.length * 0.75 <= MAX_UPLOAD) return dataUrl;
    }
    throw new Error('Das Bild ist auch nach dem Verkleinern zu groß. Bitte wähle ein anderes Foto.');
  }

  // Ladeanzeige: Fortschritt ist geschätzt, die Texte zeigen, was gerade passiert.
  const STAGES = [
    [0, 'Bild wird vorbereitet'], [8, 'Bild wird sicher übertragen'], [18, 'Motiv wird erkannt'],
    [34, 'Komposition wird bewertet'], [52, 'Schärfe und Belichtung werden geprüft'],
    [68, 'Farben und Kontraste werden analysiert'], [82, 'Empfehlungen werden formuliert'],
  ];
  let timer = null, started = 0;
  function startProgress() {
    started = Date.now();
    progress.classList.add('is-visible');
    bar.style.width = '2%';
    let pct = 2;
    timer = setInterval(() => {
      const s = (Date.now() - started) / 1000;
      pct = Math.min(94, 94 * (1 - Math.exp(-s / 16)));
      bar.style.width = `${pct}%`;
      ptext.textContent = STAGES.filter(([p]) => pct >= p).pop()[1];
      ptime.textContent = `${Math.floor(s)} s`;
    }, 250);
  }
  function stopProgress(ok) {
    clearInterval(timer);
    bar.style.width = ok ? '100%' : '0%';
    setTimeout(() => progress.classList.remove('is-visible'), ok ? 500 : 0);
  }

  async function analyze() {
    if (!file || busy) return;
    busy = true;
    clearError();
    results.classList.remove('is-visible');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner" aria-hidden="true"></span> Analyse läuft';
    dz.classList.add('is-analyzing');
    startProgress();
    const controller = new AbortController();
    const to = setTimeout(() => controller.abort(), TIMEOUT);
    try {
      const image = await prepare(file);
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image }),
        signal: controller.signal,
      });
      let data = null;
      try { data = await res.json(); } catch { /* z. B. HTML-Fehlerseite des Hosters */ }
      if (!res.ok || !data?.ok) {
        if (data?.error) throw new Error(data.error);
        if (res.status === 413) throw new Error('Das Bild ist zu groß für den Server. Bitte wähle ein kleineres Foto.');
        if (res.status === 404) throw new Error('Die Analyse-Schnittstelle wurde nicht gefunden. Läuft die Seite über den NOMA-Server (siehe Anleitung)?');
        throw new Error(`Die Analyse ist fehlgeschlagen (Fehler ${res.status}). Bitte versuche es noch einmal.`);
      }
      stopProgress(true);
      renderResults(data.result);
    } catch (err) {
      stopProgress(false);
      if (err.name === 'AbortError') showError('Die Analyse hat zu lange gedauert. Bitte versuche es noch einmal.');
      else if (err instanceof TypeError) showError('Keine Verbindung zum Server. Prüfe deine Internetverbindung und versuche es erneut.');
      else showError(err.message);
    } finally {
      clearTimeout(to);
      busy = false;
      dz.classList.remove('is-analyzing');
      btn.disabled = !file;
      btn.textContent = 'Bild analysieren';
    }
  }
  btn.addEventListener('click', analyze);

  // ---------- Ergebnis ----------
  // Alle KI-Texte werden per textContent eingesetzt (kein HTML aus der Antwort).
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function ring(val, sm) {
    const w = el('div', `score-ring${sm ? ' sm' : ''}`);
    w.innerHTML = '<svg viewBox="0 0 120 120" aria-hidden="true"><circle class="track" cx="60" cy="60" r="54"/><circle class="fill" cx="60" cy="60" r="54"/></svg>';
    const l = el('div', 'label');
    l.append(el('b', null, String(val)), el('span', null, 'von 100'));
    w.append(l);
    w.setAttribute('role', 'img');
    w.setAttribute('aria-label', `Gesamtbewertung ${val} von 100`);
    requestAnimationFrame(() => requestAnimationFrame(() => w.style.setProperty('--val', val)));
    return w;
  }
  function category(title, c) {
    const box = el('article', 'category');
    const head = el('header');
    head.append(el('h3', null, title));
    const sc = el('div', 'cat-score');
    sc.append(String(c.score), el('small', null, ' / 10'));
    head.append(sc);
    const meter = el('div', 'meter');
    meter.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 10; i++) meter.append(el('i', i < c.score ? 'on' : ''));
    const tips = el('ul', 'tips');
    (c.tips || []).forEach((t) => tips.append(el('li', null, t)));
    box.append(head, meter, el('p', 'verdict', c.verdict), el('p', null, c.analysis), tips);
    return box;
  }
  const check = () => {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('width', '14'); s.setAttribute('height', '14'); s.setAttribute('viewBox', '0 0 16 16');
    s.innerHTML = '<path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" stroke-width="1.8"/>';
    return s;
  };

  function renderResults(r) {
    results.replaceChildren();

    const head = el('div', 'result-head');
    const txt = el('div');
    txt.append(el('span', 'kicker', 'Ergebnis'), el('h2', null, r.title), el('p', null, r.summary));
    const tags = el('div', 'result-tags');
    [r.subject?.genre, r.subject?.mood].filter(Boolean).forEach((t) => tags.append(el('span', 'tag', t)));
    txt.append(tags);
    head.append(ring(r.overall_score), txt);

    const cats = el('div', 'categories');
    cats.append(
      category('Bildkomposition', r.composition),
      category('Schärfe und Belichtung', r.sharpness_exposure),
      category('Farben und Kontraste', r.color_contrast)
    );

    const grid1 = el('div', 'result-grid');
    const subj = el('div');
    subj.append(el('h3', null, 'Was ist auf dem Foto zu sehen?'), el('p', 'subject-text', r.subject?.description));
    const str = el('div');
    const ul = el('ul', 'strengths');
    (r.strengths || []).forEach((s) => { const li = el('li'); li.append(check(), el('span', null, s)); ul.append(li); });
    str.append(el('h3', null, 'Fotografische Stärken'), ul);
    grid1.append(subj, str);

    const grid2 = el('div', 'result-grid');
    const imp = el('div');
    const list = el('div', 'improvements');
    (r.improvements || []).forEach((i) => {
      const row = el('div', 'improvement');
      row.append(el('strong', null, i.title), el('span', `prio ${i.priority}`, `Priorität ${i.priority}`), el('p', null, i.detail));
      list.append(row);
    });
    imp.append(el('h3', null, 'Was könnte verbessert werden?'), list);
    grid2.append(imp);
    const thumb = el('figure', 'figure');
    thumb.style.margin = '0';
    thumb.style.maxHeight = '420px';
    const ti = el('img');
    ti.src = previewUrl; ti.alt = 'Dein analysiertes Foto';
    ti.style.maxHeight = '420px';
    ti.style.objectFit = 'contain';
    ti.style.background = '#08090b';
    thumb.append(ti);
    grid2.append(thumb);

    const cs = r.camera_settings || {};
    const set = el('div', 'settings-panel');
    set.append(el('h3', null, 'Empfohlene Kameraeinstellungen'));
    set.lastChild.style.cssText = 'font-size:var(--fs-md);margin-bottom:20px';
    const sg = el('div', 'settings-grid');
    [['Blende', cs.aperture], ['Verschlusszeit', cs.shutter_speed], ['ISO', cs.iso], ['Brennweite', cs.focal_length],
     ['Weißabgleich', cs.white_balance], ['Fokusmodus', cs.focus_mode], ['Belichtungsmessung', cs.metering], ['Kamera', 'NOMA F1']]
      .forEach(([k, v]) => { const d = el('div', 'setting'); d.append(el('span', null, k), el('b', null, v || '–')); sg.append(d); });
    set.append(sg, el('p', 'settings-note', cs.note));

    const foot = el('div', 'result-foot');
    foot.append(el('span', null, 'KI-Auswertung. Bewertungen sind Einschätzungen, keine absolute Wahrheit.'));
    const again = el('button', 'btn', 'Weiteres Foto analysieren');
    again.type = 'button';
    again.addEventListener('click', () => { reset(); results.classList.remove('is-visible'); document.getElementById('analyzer').scrollIntoView({ behavior: 'smooth' }); });
    foot.append(again);

    results.append(head, cats, grid1, grid2, set, foot);
    results.classList.add('is-visible');
    results.scrollIntoView({ behavior: 'smooth', block: 'start' });
    results.focus({ preventScroll: true });
  }
})();
