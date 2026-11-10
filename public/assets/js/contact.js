// Kontaktformular: sendet an /api/contact. Ist kein Webhook eingerichtet, öffnet sich das E-Mail-Programm.
(() => {
  const form = document.getElementById('contact-form');
  const status = document.getElementById('form-status');
  if (!form) return;
  const mail = document.querySelector('[data-contact-mail]')?.getAttribute('href')?.replace('mailto:', '') || '';
  const say = (t, cls) => { status.textContent = t; status.className = `form-status ${cls || ''}`; };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(form));
    if (!d.name?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email || '') || !d.message?.trim()) {
      return say('Bitte fülle Name, eine gültige E-Mail-Adresse und deine Nachricht aus.', 'err');
    }
    if (!form.consent.checked) return say('Bitte bestätige die Einwilligung zur Verarbeitung deiner Angaben.', 'err');
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    say('Nachricht wird gesendet');
    try {
      const res = await fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) { form.reset(); return say('Danke. Deine Nachricht ist bei uns angekommen.', 'ok'); }
      if (data.code === 'contact_not_configured' || res.status === 404) {
        const body = `${d.message}\n\n${d.name}\n${d.email}`;
        window.location.href = `mailto:${mail}?subject=${encodeURIComponent(`[${d.topic}] Anfrage über noma-kamera.de`)}&body=${encodeURIComponent(body)}`;
        return say('Dein E-Mail-Programm wurde mit deiner Nachricht geöffnet. Bitte dort absenden.', 'ok');
      }
      say(data.error || 'Deine Nachricht konnte nicht gesendet werden. Bitte schreib uns per E-Mail.', 'err');
    } catch {
      say('Keine Verbindung. Bitte prüfe deine Internetverbindung.', 'err');
    } finally {
      btn.disabled = false;
    }
  });
})();
