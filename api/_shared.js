// Hilfsfunktionen für die Vercel-Serverless-Funktionen.
import { PublicError } from '../lib/analyze.js';

export async function readBody(req, limit) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw new PublicError(413, 'Das Bild ist zu groß. Bitte wähle ein kleineres Foto.', 'too_large');
    chunks.push(c);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); }
  catch { throw new PublicError(400, 'Ungültige Anfrage.', 'bad_json'); }
}

export const ipOf = (req) => String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';

export function sendError(res, err) {
  res.setHeader('Cache-Control', 'no-store');
  if (err instanceof PublicError) return res.status(err.status).json({ ok: false, error: err.message, code: err.code });
  console.error('[NOMA] Unerwarteter Fehler:', err);
  return res.status(500).json({ ok: false, error: 'Unerwarteter Fehler. Bitte versuche es noch einmal.', code: 'internal' });
}
