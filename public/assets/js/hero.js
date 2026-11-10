// Interaktive Kamera im Hero: Finger statt Mauszeiger, Tasten lassen sich drücken.
(() => {
  const stage = document.getElementById('hero-stage');
  const camera = document.getElementById('camera');
  const finger = document.getElementById('finger');
  const tip = document.getElementById('ctrl-tip');
  const hud = document.getElementById('hud');
  const flash = document.getElementById('flash');
  if (!stage || !camera) return;

  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (!finePointer) document.querySelector('.pointer-hint')?.replaceChildren('Tippe auf die Bedienelemente und probiere sie aus.');

  const state = { on: true, mode: 0, ap: 0, ss: 3, iso: 0, ev: 3, af: 0, shot: 0 };
  const MODES = ['A', 'S', 'M', 'P'];
  const APS = ['f/1.4', 'f/2', 'f/2.8', 'f/4', 'f/5.6', 'f/8', 'f/11', 'f/16'];
  const SSS = ['1/30 s', '1/60 s', '1/125 s', '1/250 s', '1/500 s', '1/1000 s', '1/4000 s'];
  const ISOS = ['100', '200', '400', '800', '1600', '3200', '6400'];
  const EVS = ['−1', '−2/3', '−1/3', '±0', '+1/3', '+2/3', '+1'];
  const AFS = ['AF-S', 'AF-C', 'MF'];

  const LABELS = {
    shutter: ['Auslöser', 'halb gedrückt fokussiert, klicken löst aus'],
    power: ['Ein/Aus', 'klicken zum Schalten'],
    ev: ['Belichtungskorrektur', 'klicken für +1/3'],
    mode: ['Moduswahlrad', 'klicken: A, S, M, P'],
    front: ['Vorderes Einstellrad', 'klicken ändert Blende oder Zeit'],
    focus: ['Fokusmodus', 'klicken: AF-S, AF-C, MF'],
    fn: ['Fn-Taste', 'belegt mit ISO'],
    release: ['Objektiventriegelung', 'Objektiv ist fest verbaut'],
  };

  const hudSet = (k, v) => { const el = hud.querySelector(`[data-hud="${k}"]`); if (el) el.textContent = v; };
  function render() {
    const m = MODES[state.mode];
    hudSet('mode', m);
    hudSet('ap', m === 'S' || m === 'P' ? 'auto' : APS[state.ap]);
    hudSet('ss', m === 'A' || m === 'P' ? 'auto' : SSS[state.ss]);
    hudSet('iso', ISOS[state.iso]);
    hudSet('ev', EVS[state.ev]);
    hudSet('af', AFS[state.af]);
    hudSet('shot', String(state.shot).padStart(4, '0'));
    hud.classList.toggle('is-off', !state.on);
    camera.classList.toggle('is-off', !state.on);
  }

  const actions = {
    shutter() {
      if (!state.on) return;
      state.shot++;
      camera.classList.add('is-firing');
      setTimeout(() => camera.classList.remove('is-firing'), 140);
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        flash.classList.remove('is-on'); void flash.offsetWidth; flash.classList.add('is-on');
      }
    },
    power() { state.on = !state.on; },
    ev() { state.ev = (state.ev + 1) % EVS.length; },
    mode() { state.mode = (state.mode + 1) % MODES.length; },
    front() {
      const m = MODES[state.mode];
      if (m === 'S') state.ss = (state.ss + 1) % SSS.length;
      else state.ap = (state.ap + 1) % APS.length;
    },
    focus() { state.af = (state.af + 1) % AFS.length; },
    fn() { state.iso = (state.iso + 1) % ISOS.length; },
    release() {
      const lens = document.getElementById('lens');
      lens.style.transformBox = 'view-box';
      lens.style.transformOrigin = '450px 318px';
      lens.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(-7deg)' }, { transform: 'rotate(0)' }],
        { duration: 600, easing: 'cubic-bezier(.22,1,.36,1)' });
    },
  };

  let active = null;
  function press(ctrl) {
    if (active === ctrl) return;
    release();
    active = ctrl;
    ctrl.classList.add('is-pressed');
    finger.classList.add('is-pressing');
    if (ctrl.dataset.ctrl === 'shutter' && state.on && state.af !== 2) camera.classList.add('is-focused');
    const [name, hint] = LABELS[ctrl.dataset.ctrl] || [];
    tip.innerHTML = '';
    tip.append(name || '');
    const s = document.createElement('small'); s.textContent = hint || ''; tip.append(s);
    const r = ctrl.getBoundingClientRect(), sr = stage.getBoundingClientRect();
    tip.style.left = `${r.left + r.width / 2 - sr.left}px`;
    tip.style.top = `${r.top - sr.top}px`;
    tip.classList.add('is-visible');
  }
  function release() {
    if (!active) return;
    active.classList.remove('is-pressed');
    finger.classList.remove('is-pressing');
    camera.classList.remove('is-focused');
    tip.classList.remove('is-visible');
    active = null;
  }
  function trigger(ctrl) { actions[ctrl.dataset.ctrl]?.(); render(); }

  const ctrls = camera.querySelectorAll('.cam-ctrl');
  const wrap = document.getElementById('camera-wrap');

  if (finePointer) {
    wrap.addEventListener('pointerenter', () => { stage.classList.add('finger-on'); finger.classList.add('is-visible'); });
    wrap.addEventListener('pointerleave', () => { stage.classList.remove('finger-on'); finger.classList.remove('is-visible'); release(); });
    let raf = 0, x = 0, y = 0;
    wrap.addEventListener('pointermove', (e) => {
      const sr = stage.getBoundingClientRect();
      x = e.clientX - sr.left - 17; y = e.clientY - sr.top - 2;
      if (!raf) raf = requestAnimationFrame(() => { finger.style.transform = `translate3d(${x}px, ${y}px, 0)`; raf = 0; });
      const ctrl = e.target.closest?.('.cam-ctrl');
      if (ctrl) press(ctrl); else release();
    });
    ctrls.forEach((c) => c.addEventListener('click', () => {
      trigger(c);
      c.classList.remove('is-pressed'); void c.getBoundingClientRect(); c.classList.add('is-pressed');
    }));
  } else {
    // Touch: antippen drückt die Taste sichtbar und löst die Funktion aus.
    ctrls.forEach((c) => {
      c.addEventListener('pointerdown', () => press(c));
      c.addEventListener('pointerup', () => { trigger(c); setTimeout(release, 650); });
      c.addEventListener('pointercancel', release);
    });
  }

  // Tastatur: Tab zu einem Bedienelement, Enter oder Leertaste drückt es.
  ctrls.forEach((c) => {
    c.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault(); press(c); trigger(c); setTimeout(release, 220);
    });
    c.addEventListener('blur', release);
  });

  render();
})();
