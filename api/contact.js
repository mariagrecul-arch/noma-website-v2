// Vercel-Funktion: POST /api/contact
import { handleContact, rateLimit, PublicError } from '../lib/analyze.js';
import { readBody, ipOf, sendError } from './_shared.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') throw new PublicError(405, 'Methode nicht erlaubt.', 'method');
    rateLimit('contact:' + ipOf(req), { max: 5 });
    return res.status(200).json(await handleContact(await readBody(req, 64 * 1024)));
  } catch (err) {
    return sendError(res, err);
  }
}
