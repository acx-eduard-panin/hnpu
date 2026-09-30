# CLAUDE.md — workspace root

Workspace for the master's studies of group **А4.08-Мз26-11** (ХНПУ імені Г.С. Сковороди, факультет математики, інформатики і природничої освіти; А4.08 Середня освіта (Фізика та астрономія), ОП «Фізика в закладах освіти», заочна форма, 2026–2027 н. р.). Communicate with the user in Ukrainian unless they write otherwise.

## Layout

- `physics-site/` — password-protected static site for the group (schedule, meeting links, teachers, recordings, academic calendar) on GitHub Pages. Its own git repo; read `physics-site/AGENTS.md` before touching it.
- `artifacts/` — source documents from the university: session schedules (`.docx`), the «Графік освітнього процесу» photo. **Private**: they contain teachers' phone numbers; never commit or publish them. They are not in any git repo.
- `.agents/skills/`, `.claude/skills/` — local `word-document-processor` skill (use it to read new `.docx` schedules).

## Common tasks

- **New schedule arrived** (`.docx`/photo in `artifacts/`): transcribe the classes into `physics-site/data.json` (`sessions`, new `teachers`/`subjects`), then `cd physics-site && node build.mjs`, commit `docs/index.html`, push.
- **New video recording**: append to `recordings` in `physics-site/data.json`, rebuild, commit, push.
- **Change the password**: edit `physics-site/.password`, rebuild, commit, push, tell the group.

`data.json` and `.password` exist only locally (gitignored). If `data.json` is lost: `node build.mjs --decrypt`.
