// NOMA AI Photo Analyzer – Kernlogik (läuft nur auf dem Server).
// Wird vom lokalen Server (server.js) und von der Vercel-Funktion (api/analyze.js) genutzt.
// Keine externen Abhängigkeiten: nutzt das in Node 18+ eingebaute fetch.

export const LIMITS = {
  // Größe des (bereits im Browser verkleinerten) Bildes, das beim Server ankommt.
  maxImageBytes: 4 * 1024 * 1024,
  // Maximale Größe des gesamten JSON-Requests (Base64 ist ~33 % größer als die Datei).
  maxBodyBytes: 6 * 1024 * 1024,
  allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
};

const MODEL = () => process.env.OPENAI_MODEL || 'gpt-5-mini';
const API_BASE = () => (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');

// Fehler mit HTTP-Status und einer Meldung, die dem Besucher gezeigt werden darf.
export class PublicError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code || 'error';
  }
}

// Echten Dateityp anhand der ersten Bytes prüfen (nicht dem Dateinamen oder MIME-Header vertrauen).
function sniffImageType(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

export function validateImagePayload(body) {
  if (!body || typeof body.image !== 'string') {
    throw new PublicError(400, 'Es wurde kein Bild übermittelt. Bitte wähle zuerst ein Foto aus.', 'no_image');
  }
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(body.image);
  if (!match) {
    throw new PublicError(415, 'Dieses Format wird nicht unterstützt. Erlaubt sind JPG, PNG und WEBP.', 'bad_type');
  }
  const buf = Buffer.from(match[2], 'base64');
  if (buf.length > LIMITS.maxImageBytes) {
    throw new PublicError(413, 'Das Bild ist zu groß. Maximal 4 MB nach der automatischen Verkleinerung.', 'too_large');
  }
  const realType = sniffImageType(buf);
  if (!realType || !LIMITS.allowedTypes.includes(realType)) {
    throw new PublicError(415, 'Die Datei ist kein gültiges JPG-, PNG- oder WEBP-Bild.', 'bad_type');
  }
  return `data:${realType};base64,${match[2]}`;
}

// Antwortformat, das das Modell zwingend einhalten muss (Structured Outputs).
const category = {
  type: 'object',
  additionalProperties: false,
  required: ['score', 'verdict', 'analysis', 'tips'],
  properties: {
    score: { type: 'integer', description: 'Bewertung von 1 (schwach) bis 10 (herausragend)' },
    verdict: { type: 'string', description: 'Urteil in max. 6 Wörtern' },
    analysis: { type: 'string', description: '2–4 Sätze konkrete Analyse dieses Bildes' },
    tips: { type: 'array', items: { type: 'string' }, description: '1–3 konkrete Verbesserungstipps' },
  },
};

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'summary', 'overall_score', 'subject', 'composition', 'sharpness_exposure', 'color_contrast', 'strengths', 'improvements', 'camera_settings'],
  properties: {
    title: { type: 'string', description: 'Kurzer, sachlicher Bildtitel (max. 6 Wörter)' },
    summary: { type: 'string', description: 'Gesamteindruck in 2–3 Sätzen' },
    overall_score: { type: 'integer', description: 'Gesamtbewertung von 1 bis 100' },
    subject: {
      type: 'object',
      additionalProperties: false,
      required: ['description', 'genre', 'mood'],
      properties: {
        description: { type: 'string', description: 'Was ist auf dem Foto zu sehen? 2–3 Sätze' },
        genre: { type: 'string', description: 'Fotografisches Genre, z. B. Landschaft, Porträt, Makro, Architektur, Street, Produkt' },
        mood: { type: 'string', description: 'Bildstimmung in 2–4 Wörtern' },
      },
    },
    composition: category,
    sharpness_exposure: category,
    color_contrast: category,
    strengths: { type: 'array', items: { type: 'string' }, description: '2–4 fotografische Stärken' },
    improvements: {
      type: 'array',
      description: '2–4 Verbesserungsvorschläge, wichtigster zuerst',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'detail', 'priority'],
        properties: {
          title: { type: 'string' },
          detail: { type: 'string' },
          priority: { type: 'string', enum: ['hoch', 'mittel', 'niedrig'] },
        },
      },
    },
    camera_settings: {
      type: 'object',
      additionalProperties: false,
      required: ['aperture', 'shutter_speed', 'iso', 'focal_length', 'white_balance', 'focus_mode', 'metering', 'note'],
      properties: {
        aperture: { type: 'string', description: 'z. B. f/8' },
        shutter_speed: { type: 'string', description: 'z. B. 1/250 s' },
        iso: { type: 'string', description: 'z. B. ISO 100' },
        focal_length: { type: 'string', description: 'z. B. 35 mm (Kleinbild-äquivalent)' },
        white_balance: { type: 'string', description: 'z. B. Tageslicht 5500 K' },
        focus_mode: { type: 'string', description: 'z. B. AF-S, Einzelfeld' },
        metering: { type: 'string', description: 'z. B. Mehrfeld, Spot' },
        note: { type: 'string', description: 'Ein Satz, warum diese Einstellungen für dieses Motiv passen' },
      },
    },
  },
};

const INSTRUCTIONS = `Du bist ein erfahrener Fotograf und Bildredakteur, der für die Kameramarke NOMA Fotos von Besuchern bewertet.
Analysiere das hochgeladene Foto ehrlich, präzise und freundlich auf Deutsch.
- Beziehe dich immer auf konkrete Details, die im Bild sichtbar sind (Bildbereiche, Licht, Linien, Farben). Keine Floskeln.
- Bewerte realistisch: 5/10 ist solide, 8/10 sehr gut, 10/10 nur für außergewöhnliche Aufnahmen.
- Verbesserungsvorschläge müssen umsetzbar sein (Aufnahme oder Bearbeitung).
- Kameraeinstellungen: Empfiehl Werte, mit denen man dieses Motiv bei vergleichbarem Licht optimal fotografiert. Brennweite als Kleinbild-Äquivalent.
- Erkennbare Personen nicht identifizieren und keine Vermutungen über Identität, Alter oder Herkunft äußern; nur fotografische Aspekte beschreiben.
- Wenn das Bild kein Foto ist (z. B. Screenshot, Grafik), sag das in der Zusammenfassung und bewerte es trotzdem nach fotografischen Kriterien.`;

function extractOutput(data) {
  if (typeof data.output_text === 'string' && data.output_text) return { text: data.output_text };
  for (const item of data.output || []) {
    if (item.type !== 'message') continue;
    for (const part of item.content || []) {
      if (part.type === 'refusal') return { refusal: part.refusal || 'Abgelehnt' };
      if (part.type === 'output_text' && part.text) return { text: part.text };
    }
  }
  return {};
}

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, Math.round(Number(n) || lo)));

function normalize(result) {
  for (const key of ['composition', 'sharpness_exposure', 'color_contrast']) {
    result[key].score = clamp(result[key].score, 1, 10);
  }
  result.overall_score = clamp(result.overall_score, 1, 100);
  return result;
}

export async function analyzeImage(dataUrl) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // Für Besucher neutral formulieren, im Server-Log deutlich.
    console.error('[NOMA] OPENAI_API_KEY fehlt. Siehe README, Schritt 3.');
    throw new PublicError(503, 'Die Bildanalyse ist gerade nicht eingerichtet. Bitte versuche es später erneut.', 'not_configured');
  }

  const model = MODEL();
  const body = {
    model,
    instructions: INSTRUCTIONS,
    input: [
      {
        role: 'user',
        content: [
          { type: 'input_text', text: 'Analysiere dieses Foto.' },
          { type: 'input_image', image_url: dataUrl, detail: 'high' },
        ],
      },
    ],
    text: { format: { type: 'json_schema', name: 'photo_analysis', strict: true, schema: SCHEMA } },
    max_output_tokens: 6000,
    store: false,
  };
  // GPT-5- und o-Modelle sind Reasoning-Modelle: niedriger Aufwand = schneller und günstiger.
  if (/^(gpt-5|o\d)/.test(model)) body.reasoning = { effort: 'low' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90_000);
  let res;
  try {
    res = await fetch(`${API_BASE()}/responses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new PublicError(504, 'Die Analyse hat zu lange gedauert. Bitte versuche es noch einmal.', 'timeout');
    }
    console.error('[NOMA] Verbindung zu OpenAI fehlgeschlagen:', err.message);
    throw new PublicError(502, 'Der Analysedienst ist nicht erreichbar. Bitte versuche es gleich noch einmal.', 'upstream_unreachable');
  } finally {
    clearTimeout(timer);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || res.statusText;
    console.error(`[NOMA] OpenAI-Fehler ${res.status}: ${msg}`);
    if (res.status === 401) throw new PublicError(503, 'Die Bildanalyse ist falsch konfiguriert (API-Schlüssel ungültig).', 'bad_key');
    if (res.status === 429) {
      const quota = /quota|billing|credit/i.test(msg);
      throw new PublicError(
        quota ? 503 : 429,
        quota ? 'Das Analyse-Kontingent ist aufgebraucht. Bitte versuche es später erneut.' : 'Gerade analysieren sehr viele Besucher Bilder. Bitte warte kurz und versuche es erneut.',
        quota ? 'quota' : 'rate_limited'
      );
    }
    if (res.status === 400 && /image/i.test(msg)) throw new PublicError(422, 'Das Bild konnte nicht gelesen werden. Bitte versuche ein anderes Foto.', 'unreadable');
    if (res.status === 404) throw new PublicError(503, 'Das eingestellte KI-Modell ist nicht verfügbar (OPENAI_MODEL prüfen).', 'bad_model');
    throw new PublicError(502, 'Die Analyse ist fehlgeschlagen. Bitte versuche es noch einmal.', 'upstream_error');
  }

  const out = extractOutput(data);
  if (out.refusal) {
    throw new PublicError(422, 'Dieses Bild kann nicht analysiert werden. Bitte wähle ein anderes Foto.', 'refused');
  }
  if (!out.text) {
    console.error('[NOMA] Leere Antwort von OpenAI, Status:', data.status, data.incomplete_details);
    throw new PublicError(502, 'Die Analyse kam unvollständig zurück. Bitte versuche es noch einmal.', 'incomplete');
  }
  try {
    return { model, usage: data.usage || null, result: normalize(JSON.parse(out.text)) };
  } catch {
    console.error('[NOMA] Antwort war kein gültiges JSON:', out.text.slice(0, 300));
    throw new PublicError(502, 'Die Analyse kam in einem unerwarteten Format zurück. Bitte versuche es noch einmal.', 'bad_output');
  }
}

// Einfache Begrenzung pro IP (im Speicher). Schützt vor Missbrauch und hohen API-Kosten.
const buckets = new Map();
export function rateLimit(ip, { max = Number(process.env.RATE_LIMIT_MAX || 8), windowMs = 10 * 60 * 1000 } = {}) {
  const now = Date.now();
  const hits = (buckets.get(ip) || []).filter((t) => now - t < windowMs);
  if (hits.length >= max) {
    const retry = Math.ceil((windowMs - (now - hits[0])) / 60000);
    throw new PublicError(429, `Du hast das Limit von ${max} Analysen erreicht. Bitte versuche es in ${retry} Minute${retry === 1 ? '' : 'n'} erneut.`, 'rate_limited');
  }
  hits.push(now);
  buckets.set(ip, hits);
  if (buckets.size > 5000) for (const [k, v] of buckets) if (!v.some((t) => now - t < windowMs)) buckets.delete(k);
}

// Kontaktformular: leitet an einen Webhook weiter (z. B. Make.com, Zapier, n8n), wenn konfiguriert.
export async function handleContact(body) {
  const name = String(body?.name || '').trim().slice(0, 120);
  const email = String(body?.email || '').trim().slice(0, 200);
  const topic = String(body?.topic || 'Allgemein').trim().slice(0, 60);
  const message = String(body?.message || '').trim().slice(0, 5000);
  if (body?.website) return { ok: true }; // Honeypot gegen Spam-Bots
  if (!name || !message || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new PublicError(400, 'Bitte fülle Name, eine gültige E-Mail-Adresse und deine Nachricht aus.', 'invalid');
  }
  const hook = process.env.CONTACT_WEBHOOK_URL;
  if (!hook) throw new PublicError(501, 'Kontakt per Formular ist noch nicht eingerichtet.', 'contact_not_configured');
  const res = await fetch(hook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, topic, message, received_at: new Date().toISOString() }),
  }).catch(() => null);
  if (!res || !res.ok) throw new PublicError(502, 'Deine Nachricht konnte nicht gesendet werden. Bitte schreib uns direkt per E-Mail.', 'contact_failed');
  return { ok: true };
}
