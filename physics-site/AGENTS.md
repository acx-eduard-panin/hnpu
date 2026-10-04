# AGENTS.md

Password-protected static site for the master's group **А4.08-Мз26-11** (Фізика в закладах освіти, ХНПУ, заочна форма). Shows the class schedule with meeting links, teachers' contacts, video recordings of past classes, and the academic-year timetable. Hosted on GitHub Pages: `../.github/workflows/pages.yml` publishes `docs/` on every push to `main` that touches it. There is no build in CI, so the plaintext never leaves this machine. UI language is Ukrainian.

## How it works

- `data.json` — **the only content source** (plaintext, gitignored). Edit this, never `docs/index.html`.
- `src/template.html` — the whole UI: login form, rendering, styles. Single file, no dependencies, no framework.
- `build.mjs` — validates `data.json`, encrypts it (PBKDF2-SHA256 310k iterations → AES-256-GCM) and injects the payload into the template → `docs/index.html`. Decryption happens in the browser via Web Crypto.
- `.password` — site password, first line (gitignored). `SITE_PASSWORD` env var overrides it.

- `pdf.mjs` — renders the same data as a 3-page A4 PDF via headless Chrome/Edge, then encrypts it with the site password (pypdf, AES-256) → `docs/rozklad.pdf` (published, linked by the «PDF» button). Also leaves an unencrypted `out/rozklad.pdf` (gitignored) for sending privately.

```sh
node build.mjs && node pdf.mjs   # rebuild site + PDF after any change (keep them in sync)
node build.mjs --decrypt   # recover data.json from docs/index.html
```

Changing the password = edit `.password`, rebuild, commit, and tell the group.

## Security rules (treat the repo as public)

- Never commit `out/` — it holds the **unencrypted** PDF and the print HTML.
- Never commit `data.json`, `.password`, or anything under `../artifacts/` (source docs contain phone numbers).
- Never put content in plaintext in the template, README, or commit messages — only inside the encrypted payload.
- Rebuilding changes the salt/IV, so `docs/index.html` diffs on every build; that's expected.

## data.json format

- `teachers`: `{ id: { name, phone, link, code?, note? } }` — `link` is the teacher's default meeting URL; `code` is its passcode (e.g. Zoom), shown next to the link in the schedule, subject cards and PDF.
- `showPhones`: `false` strips all `phone` fields from the published site payload and the PDF (kept in local `data.json`); set `true` to show them again.
- `subjects`: `{ id: { name, teachers: [teacherId] } }`
- `sessions`: `[{ date: "YYYY-MM-DD", time: "HH:MM", subject, teacher, kind?: "л"|"пр"|"лаб", link?, code? }]` — `link` overrides the teacher's link for that one class (with its own optional `code`). Each slot lasts `slotMinutes` (80).
- `recordings`: `[{ date, subject, title?, url, time? }]` — add after each class once the video is uploaded.
- `links`: `[{ title, url, note? }]` — group chat, drives, course pages.
- `calendar`: `[{ name, type, from?, to }]` — `type`: `session` (blue), `practice` (amber), `deadline` (red outline, marks only `to`). Rendered as month grids — sessions, practice, deadlines from the official «Графік освітнього процесу».

The build fails on unknown ids, malformed dates, or non-http(s) URLs — fix `data.json` rather than weakening the checks.

## Sources

The schedule was transcribed from `../artifacts/Настановна Магістри Фізика.docx` (настановча сесія 05–12.10.2026) and the timetable photo in `../artifacts/` (row «1 м»). When a new session schedule arrives, add its sessions and any new teachers/subjects to `data.json`.

## Conventions

- Keep it a single self-contained HTML file; must work on phones (≥320px) and in dark mode.
- All user-facing text in Ukrainian. Dates rendered as `05.10.2026` / `5 жовтня`.
- Times are local (Kyiv); the browser's clock decides "now"/"live" highlighting.
