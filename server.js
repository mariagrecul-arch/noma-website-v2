// NOMA – lokaler Webserver: liefert die Website aus und stellt die sichere API bereit.
// Start:  node server.js   (Node.js 18 oder neuer, keine Installation von Paketen nötig)
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeImage, validateImagePayload, rateLimit, handleContact, PublicError, LIMITS } from './lib/analyze.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');

// .env-Datei einlesen (nur lokal). Der API-Schlüssel bleibt auf dem Server und wird nie an den Browser geschickt.
const envFile = path.join(ROOT, '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  }
}

const PORT = Number(process.env.PORT || 3000);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': [
    "default-src 'self'",
    "img-src 'self' data: blob: https://images.unsplash.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "script-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'self' https://webdesign.wallutt.com",
  ].join('; '),
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, ...headers });
  res.end(body);
}
const sendJson = (res, status, obj) => send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });

function readJsonBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new PublicError(413, 'Das Bild ist zu groß. Bitte wähle ein kleineres Foto.', 'too_large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch { reject(new PublicError(400, 'Ungültige Anfrage.', 'bad_json')); }
    });
    req.on('error', reject);
  });
}

const clientIp = (req) => (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'unknown';

async function handleApi(req, res, pathname) {
  try {
    if (req.method !== 'POST') throw new PublicError(405, 'Methode nicht erlaubt.', 'method');
    if (!String(req.headers['content-type'] || '').includes('application/json')) throw new PublicError(415, 'Ungültige Anfrage.', 'content_type');

    if (pathname === '/api/analyze') {
      rateLimit(clientIp(req));
      const body = await readJsonBody(req, LIMITS.maxBodyBytes);
      const dataUrl = validateImagePayload(body);
      const t0 = Date.now();
      const out = await analyzeImage(dataUrl);
      console.log(`[NOMA] Analyse ok · ${out.model} · ${((Date.now() - t0) / 1000).toFixed(1)} s · Tokens: ${out.usage?.total_tokens ?? '?'}`);
      return sendJson(res, 200, { ok: true, result: out.result, model: out.model });
    }
    if (pathname === '/api/contact') {
      rateLimit('contact:' + clientIp(req), { max: 5 });
      const body = await readJsonBody(req, 64 * 1024);
      return sendJson(res, 200, await handleContact(body));
    }
    if (pathname === '/api/health') return sendJson(res, 200, { ok: true });
    throw new PublicError(404, 'Nicht gefunden.', 'not_found');
  } catch (err) {
    if (err instanceof PublicError) return sendJson(res, err.status, { ok: false, error: err.message, code: err.code });
    console.error('[NOMA] Unerwarteter Fehler:', err);
    return sendJson(res, 500, { ok: false, error: 'Unerwarteter Fehler. Bitte versuche es noch einmal.', code: 'internal' });
  }
}

async function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  let file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC)) return send(res, 403, 'Forbidden');
  try {
    let s = await stat(file).catch(() => null);
    if (!s && !path.extname(file)) { file += '.html'; s = await stat(file).catch(() => null); }
    if (!s || !s.isFile()) {
      const notFound = await readFile(path.join(PUBLIC, '404.html')).catch(() => 'Seite nicht gefunden');
      return send(res, 404, notFound, { 'Content-Type': TYPES['.html'] });
    }
    const ext = path.extname(file).toLowerCase();
    send(res, 200, await readFile(file), {
      'Content-Type': TYPES[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
    });
  } catch (err) {
    console.error(err);
    send(res, 500, 'Serverfehler');
  }
}

http
  .createServer((req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    if (pathname.startsWith('/api/')) return handleApi(req, res, pathname);
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method Not Allowed');
    return serveStatic(req, res, pathname);
  })
  .listen(PORT, () => {
    console.log(`\n  NOMA läuft auf  http://localhost:${PORT}`);
    console.log(`  Modell: ${process.env.OPENAI_MODEL || 'gpt-5-mini'} · API-Schlüssel ${process.env.OPENAI_API_KEY ? 'gefunden ✓' : 'FEHLT – siehe README Schritt 3'}\n`);
  });
