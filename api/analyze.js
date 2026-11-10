// Vercel-Funktion: POST /api/analyze
import { analyzeImage, validateImagePayload, rateLimit, PublicError, LIMITS } from '../lib/analyze.js';
import { readBody, ipOf, sendError } from './_shared.js';

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') throw new PublicError(405, 'Methode nicht erlaubt.', 'method');
    rateLimit(ipOf(req));
    const body = await readBody(req, LIMITS.maxBodyBytes);
    const out = await analyzeImage(validateImagePayload(body));
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true, result: out.result, model: out.model });
  } catch (err) {
    return sendError(res, err);
  }
}
