# NOMA – Kamera-Website mit AI Photo Analyzer · Design-Version 2

Gleiche Technik, Inhalte, Unterseiten, interaktive Kamera und AI Photo Analyzer wie Version 1. Neu ist der Look:

- **Farben:** Weiß als Primärfarbe, Lila `#6f2193` und Schwarz als Sekundärfarben (alle Werte oben in `public/assets/css/style.css` unter `:root`).
- **Schriften:** Unbounded (Überschriften) und Nunito (Text), rund und weich. Beide liegen lokal in `public/assets/fonts/` (keine Google-Fonts-Verbindung, gut für DSGVO; Lizenz: SIL Open Font License).
- **Hintergrund:** Punktmuster unter körnigem Milchglas. Beim Scrollen bewegt sich das Muster in die Gegenrichtung. Im Kamerabereich oben ist das Glas fast blickdicht.
  - Stärke des Musters: `.bg-glass` → `background: rgba(245, 244, 247, 0.925)` (höher = weniger sichtbar)
  - Größe der Kreise: `.bg-pattern` → letzter Wert in `background-size` (168px)
  - Tempo der Gegenbewegung: `SPEED` in `public/assets/js/site.js`

Eine fertige Website für die fiktive Kameramarke NOMA (Modell F1) mit einer echten KI-Bildanalyse über die OpenAI API.

**Seiten:** Home · Kamera · Galerie · AI Photo Analyzer · Über uns & Kontakt · Impressum · Datenschutz · 404

**So funktioniert die Analyse (sicher):**

```
Browser  ──Foto (verkleinert, ohne EXIF/GPS)──►  dein Server /api/analyze  ──mit geheimem Key──►  OpenAI
Browser  ◄────────── fertige Auswertung (JSON) ───────────  dein Server  ◄──────────────────────  OpenAI
```

Der API-Schlüssel liegt nur auf dem Server (`.env` lokal bzw. als Secret bei Vercel). Er steht nie im HTML/JavaScript und ist für Besucher nicht sichtbar.

---

## Schritt für Schritt (Windows)

### 1. Node.js installieren (einmalig)
1. Öffne https://nodejs.org und lade die **LTS-Version** herunter.
2. Installieren (alle Standardoptionen).
3. Prüfen: PowerShell öffnen → `node -v` → es sollte `v20…` oder höher erscheinen.

> Es müssen **keine Pakete** installiert werden (`npm install` ist nicht nötig). Der Server nutzt nur Bordmittel von Node.js.

### 2. Projekt ablegen
ZIP entpacken, z. B. nach `F:\NOMA`.

### 3. OpenAI-API-Schlüssel besorgen
Das ist **nicht** dein ChatGPT-Abo – die API wird separat abgerechnet.

1. https://platform.openai.com aufrufen und einloggen/registrieren.
2. **Settings → Billing**: Zahlungsmethode hinterlegen und Guthaben aufladen (5 $ reichen für sehr viele Analysen).
3. **Settings → Limits**: ein monatliches Budget-Limit setzen (z. B. 10 $). So kann nie mehr ausgegeben werden.
4. **API keys → „Create new secret key"**: Name z. B. `noma-website`, erstellen, Schlüssel (beginnt mit `sk-`) **sofort kopieren** – er wird nur einmal angezeigt.

### 4. Schlüssel eintragen
1. Im Projektordner die Datei `.env.example` kopieren und die Kopie in **`.env`** umbenennen.
   (Im Explorer ggf. „Ansicht → Dateinamenerweiterungen" aktivieren, damit sie nicht `.env.txt` heißt.)
2. `.env` mit dem Editor öffnen und eintragen:
   ```
   OPENAI_API_KEY=sk-dein-schluessel
   ```
3. Speichern. Diese Datei niemals weitergeben oder hochladen.

### 5. Lokal starten
PowerShell im Projektordner öffnen (im Explorer in die Adressleiste `powershell` tippen, Enter) und ausführen:
```
node server.js
```
Dann im Browser: **http://localhost:3000**
In der Konsole steht „API-Schlüssel gefunden ✓". Auf der Seite **AI Photo Analyzer** ein Foto hochladen → **Bild analysieren**.

> Die Seiten **nicht** per Doppelklick auf die HTML-Datei öffnen – dann fehlt der Server und die Analyse kann nicht funktionieren.

### 6. Online stellen (empfohlen: Vercel, kostenloser Tarif reicht)
Das Projekt ist für Vercel vorbereitet (`api/` = Serverfunktionen, `public/` = Website, `vercel.json` = Sicherheits-Header).

1. Konto bei https://github.com anlegen, neues **privates** Repository erstellen und den Projektordner hochladen (ohne `.env`; die `.gitignore` schließt sie automatisch aus, wenn du Git oder GitHub Desktop nutzt).
2. Bei https://vercel.com mit GitHub anmelden → **Add New → Project** → Repository importieren.
3. Framework Preset: **Other**. Build-Einstellungen leer lassen.
4. Unter **Environment Variables** eintragen:
   - `OPENAI_API_KEY` = dein Schlüssel (als **Sensitive** markieren)
   - optional `OPENAI_MODEL` = `gpt-5-mini`
5. **Deploy**. Nach ca. 1 Minute ist die Seite unter `https://dein-projekt.vercel.app` erreichbar.
6. Eigene Domain: im Vercel-Projekt unter **Settings → Domains**.

Wird der Schlüssel später geändert: in Vercel ersetzen und **Redeploy** auslösen.

### 7. Optional: Kontaktformular aktivieren
Ohne weitere Einrichtung öffnet das Formular das E-Mail-Programm des Besuchers (Adresse in `public/ueber-uns.html` anpassen: `hallo@noma-kamera.de`).
Für echten Versand: in Make.com ein Szenario mit **Webhooks → Custom webhook** anlegen (danach z. B. Gmail „Send an email"), die Webhook-URL als `CONTACT_WEBHOOK_URL` in `.env` bzw. bei Vercel eintragen.

### 8. Vor dem Livegang
- **Impressum** und **Datenschutz** (`public/impressum.html`, `public/datenschutz.html`): alle blau markierten Platzhalter durch echte Daten ersetzen.
- **Galerie-Bilder**: Die Beispielfotos werden von Unsplash geladen. Eigene Fotos in `public/assets/img/gallery/` legen und in `public/assets/js/gallery.js` bei einem Eintrag `src: 'assets/img/gallery/bild.jpg'` ergänzen.
- **DSGVO**: Die Schriften sind bereits lokal eingebunden. Für die Bilder gilt: eigene Fotos lokal ablegen statt Unsplash zu laden.

---

## Technik

| Thema | Umsetzung |
|---|---|
| KI-Modell | `gpt-5-mini` (bildfähig, schnell, günstig) über die **Responses API**; per `OPENAI_MODEL` änderbar, z. B. `gpt-5.5` für noch genauere Analysen |
| Antwortformat | Structured Outputs (JSON-Schema, `strict`), daher immer vollständige Kategorien mit Bewertung |
| Kosten | ca. 0,5–1 Cent pro Analyse mit gpt-5-mini |
| Dateitypen | JPG, PNG, WEBP; Prüfung im Browser **und** auf dem Server anhand der Datei-Signatur |
| Dateigröße | Original max. 15 MB; der Browser verkleinert auf max. 2048 px (entfernt EXIF/GPS), Server akzeptiert max. 4 MB |
| Missbrauchsschutz | max. 8 Analysen pro IP in 10 Minuten (`RATE_LIMIT_MAX`), Budget-Limit bei OpenAI |
| Datenschutz | Bilder werden nicht gespeichert; Anfrage mit `store: false` |
| Fehler | verständliche Meldungen für Format, Größe, Zeitüberschreitung, Limit, Kontingent, fehlende Konfiguration |
| Sicherheit | Content-Security-Policy, nosniff, kein HTML aus KI-Antworten (nur `textContent`) |

```
noma/
├─ server.js          lokaler Server (Website + API)
├─ lib/analyze.js     OpenAI-Aufruf, Validierung, Rate-Limit, Kontakt
├─ api/               dieselben Endpunkte als Vercel-Funktionen
├─ public/            alle Seiten, CSS, JS, Bilder
├─ .env.example       Vorlage für den API-Schlüssel
└─ vercel.json        Hosting-Konfiguration
```

## Fehlerbehebung

| Meldung | Lösung |
|---|---|
| „Die Bildanalyse ist gerade nicht eingerichtet" | `OPENAI_API_KEY` fehlt (Schritt 4) bzw. bei Vercel nicht gesetzt → setzen und neu deployen |
| „falsch konfiguriert (API-Schlüssel ungültig)" | Schlüssel neu erstellen und eintragen |
| „Analyse-Kontingent ist aufgebraucht" | Guthaben bei OpenAI aufladen oder Limit erhöhen |
| „Modell nicht verfügbar" | `OPENAI_MODEL` prüfen oder Zeile entfernen (Standard `gpt-5-mini`) |
| „Schnittstelle wurde nicht gefunden" | Seite über `node server.js` bzw. Vercel aufrufen, nicht als Datei öffnen |
| Port belegt | in `.env` z. B. `PORT=3001` setzen |

Die genaue Ursache steht immer in der Server-Konsole (lokal) bzw. unter **Vercel → Logs**.

## In eine bestehende Website übernehmen
`api/`, `lib/` und `vercel.json` ins bestehende Projekt kopieren, dazu `public/analyzer.html`, `public/assets/js/analyzer.js` und die Analyzer-Abschnitte aus `style.css`. Die bestehende Seite muss auf Vercel (oder einem Node-Server) laufen, damit `/api/analyze` erreichbar ist.
