// Builds a printable PDF of the site's content for people who don't want to use the site.
//
//   node pdf.mjs
//
// Outputs:
//   docs/rozklad.pdf  encrypted (AES-256) with the site password; published and linked from the site
//   out/rozklad.pdf   unencrypted copy for sending privately (gitignored, never publish it)
//
// Needs Google Chrome or Microsoft Edge (set CHROME to override the path) and Python with pypdf + cryptography.
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const password = process.env.SITE_PASSWORD
  || (existsSync(".password") && readFileSync(".password", "utf8").split(/\r?\n/)[0].trim());
if (!password) { console.error("No password: set SITE_PASSWORD or create a .password file."); process.exit(1); }

const chrome = [process.env.CHROME,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome", "/usr/bin/chromium"].find(p => p && existsSync(p));
if (!chrome) { console.error("Chrome/Edge not found: set CHROME to the browser executable."); process.exit(1); }

const D = JSON.parse(readFileSync("data.json", "utf8"));
const SITE_URL = "https://acx-eduard-panin.github.io/hnpu/";

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const DOW = ["неділя", "понеділок", "вівторок", "середа", "четвер", "п'ятниця", "субота"];
const MON = ["січня", "лютого", "березня", "квітня", "травня", "червня", "липня", "серпня", "вересня", "жовтня", "листопада", "грудня"];
const MONN = ["Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень", "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень"];
const KIND = { "л": "лекція", "пр": "практичне", "лаб": "лабораторна" };
const parse = d => { const [y, m, dd] = d.split("-").map(Number); return new Date(y, m - 1, dd); };
const short = d => d.split("-").reverse().join(".");
const ymd = (y, m, d) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const addMin = (t, m) => { const [h, mi] = t.split(":").map(Number); const x = h * 60 + mi + m; return `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`; };
const platform = u => /zoom\.us/.test(u) ? "Zoom" : /meet\.google/.test(u) ? "Google Meet" : "Посилання";
const link = u => u ? `<a href="${esc(u)}">${platform(u)}</a>` : "";
const slot = D.slotMinutes || 80;
const evType = c => ["session", "practice", "deadline"].includes(c.type) ? c.type : "session";
const now = new Date();

// --- schedule, grouped by day
const byDay = {};
for (const s of D.sessions) (byDay[s.date] ||= []).push(s);
const schedule = Object.keys(byDay).sort().map(d => `<tbody class="day">
  <tr class="dh"><th colspan="4">${parse(d).getDate()} ${MON[parse(d).getMonth()]} ${parse(d).getFullYear()}, ${DOW[parse(d).getDay()]}</th></tr>
  ${byDay[d].sort((a, b) => a.time.localeCompare(b.time)).map(s => {
    const t = D.teachers[s.teacher];
    return `<tr><td class="tm">${s.time}–${addMin(s.time, slot)}</td>
      <td>${esc(D.subjects[s.subject]?.name)}${s.kind ? ` <span class="tag">${esc(KIND[s.kind] || s.kind)}</span>` : ""}</td>
      <td>${esc(t?.name)}</td><td>${link(s.link || t?.link)}</td></tr>`;
  }).join("")}</tbody>`).join("");

// --- teachers & links
const contacts = Object.values(D.subjects).flatMap(s => s.teachers.map((tid, i) => {
  const t = D.teachers[tid] || {};
  return `<tr>${i === 0 ? `<td rowspan="${s.teachers.length}">${esc(s.name)}</td>` : ""}
    <td>${esc(t.name)}</td><td class="nw">${esc(t.phone)}</td>
    <td class="url">${t.link ? `<a href="${esc(t.link)}">${esc(t.link)}</a>` : ""}${t.note ? `<div class="note">${esc(t.note)}</div>` : ""}</td></tr>`;
})).join("");

// --- academic calendar: month grids + list
const eventsOn = ds => D.calendar.filter(c => c.from ? c.from <= ds && ds <= c.to : ds === c.to);
function month(y, m) {
  const off = (new Date(y, m, 1).getDay() + 6) % 7, days = new Date(y, m + 1, 0).getDate();
  let cells = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"].map(w => `<i class="wd">${w}</i>`).join("") + "<i></i>".repeat(off);
  for (let d = 1; d <= days; d++) {
    const ds = ymd(y, m, d), ev = eventsOn(ds), cls = [];
    const p = ev.find(e => evType(e) !== "deadline"); if (p) cls.push(evType(p));
    if (ev.some(e => evType(e) === "deadline")) cls.push("deadline");
    if ((off + d - 1) % 7 >= 5) cls.push("we");
    if (byDay[ds]) cls.push("has");
    cells += `<i class="${cls.join(" ")}">${d}</i>`;
  }
  return `<div class="month"><h4>${MONN[m]} ${y}</h4><div class="mg">${cells}</div></div>`;
}
const allDates = [...D.calendar.flatMap(c => [c.from, c.to]), ...Object.keys(byDay)].filter(Boolean).sort();
let months = "";
if (allDates.length) {
  let [y, m] = allDates[0].split("-").map(Number); m--;
  const [ly, lm] = allDates.at(-1).split("-").map(Number);
  for (; y * 12 + m <= ly * 12 + lm - 1; m === 11 ? (y++, m = 0) : m++) months += month(y, m);
}
const calList = [...D.calendar].sort((a, b) => (a.from || a.to).localeCompare(b.from || b.to)).map(c =>
  `<tr><td><span class="sw ${evType(c)}"></span>${esc(c.name)}</td><td class="nw">${c.from ? `${short(c.from)} – ${short(c.to)}` : `до ${short(c.to)}`}</td></tr>`).join("");

// --- recordings & extra links
const recordings = D.recordings.length
  ? `<table><thead><tr><th>Дата</th><th>Предмет</th><th>Тема</th><th>Запис</th></tr></thead><tbody>${[...D.recordings]
      .sort((a, b) => (a.date || "").localeCompare(b.date || "")).map(r => `<tr><td class="nw">${r.date ? short(r.date) : ""}</td>
      <td>${esc(D.subjects[r.subject]?.name || r.subject)}</td><td>${esc(r.title)}</td><td><a href="${esc(r.url)}">Дивитися</a></td></tr>`).join("")}</tbody></table>`
  : `<p class="muted">Записів поки немає. Нові записи з'являються на сайті, а оновлений PDF надсилається групі.</p>`;
const links = D.links.length
  ? `<h2>Корисні посилання</h2><table><tbody>${D.links.map(l => `<tr><td>${esc(l.title)}${l.note ? `<div class="note">${esc(l.note)}</div>` : ""}</td><td class="url"><a href="${esc(l.url)}">${esc(l.url)}</a></td></tr>`).join("")}</tbody></table>`
  : "";

const html = `<!doctype html><html lang="uk"><head><meta charset="utf-8"><title>Розклад ${esc(D.group)}</title><style>
@page { size: A4; margin: 14mm 13mm; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; font: 9.5pt/1.4 "Segoe UI", system-ui, Arial, sans-serif; color: #1b1f24; }
a { color: #2457d6; text-decoration: none; }
header { display: flex; justify-content: space-between; gap: 16px; border-bottom: 2px solid #2457d6; padding-bottom: 8px; margin-bottom: 14px; }
h1 { font-size: 17pt; margin: 0; line-height: 1.2; }
.sub { color: #5f6b7a; margin-top: 3px; }
.stamp { text-align: right; color: #5f6b7a; font-size: 8.5pt; white-space: nowrap; }
h2 { font-size: 12.5pt; margin: 18px 0 8px; color: #2457d6; }
h2.pb { break-before: page; margin-top: 0; }
table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; vertical-align: top; padding: 4px 6px; border-bottom: 1px solid #dde2e8; }
thead th { font-size: 8.5pt; color: #5f6b7a; font-weight: 600; border-bottom: 1px solid #b9c2cd; }
tbody.day { break-inside: avoid; }
tr.dh th { background: #e7eefc; color: #1b3f9e; font-size: 10pt; padding: 5px 6px; border-bottom: 0; }
td.tm { width: 82px; font-variant-numeric: tabular-nums; font-weight: 600; white-space: nowrap; }
.sched td:nth-child(3) { width: 30%; color: #3d4652; }
.sched td:nth-child(4) { width: 80px; white-space: nowrap; }
.tag { font-size: 7.5pt; background: #eef0f3; color: #5f6b7a; padding: 0 5px; border-radius: 8px; white-space: nowrap; }
.nw { white-space: nowrap; }
td.url { font-size: 8pt; word-break: break-all; width: 38%; }
.note { font-size: 7.5pt; color: #8a5a00; margin-top: 2px; word-break: normal; }
.muted { color: #5f6b7a; }
.contacts tr { break-inside: avoid; }
.months { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 6px 0 12px; }
.month { border: 1px solid #dde2e8; border-radius: 6px; padding: 5px 6px; break-inside: avoid; }
.month h4 { margin: 0 0 3px; font-size: 8.5pt; text-align: center; }
.mg { display: grid; grid-template-columns: repeat(7, 1fr); gap: 1px; text-align: center; font-size: 7.5pt; font-style: normal; }
.mg i { font-style: normal; padding: 1.5px 0; border-radius: 3px; position: relative; }
.mg .wd { color: #8a94a1; font-size: 6.5pt; }
.mg .we { color: #8a94a1; }
.mg .session { background: #dfe8fc; color: #1b3f9e; font-weight: 700; }
.mg .practice { background: #fbedd5; color: #8a5200; font-weight: 700; }
.mg .deadline { box-shadow: inset 0 0 0 1.2px #c0352b; color: #c0352b; font-weight: 700; }
.mg .has { text-decoration: underline; text-underline-offset: 1.5px; }
.legend { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 8pt; color: #5f6b7a; }
.sw { display: inline-block; width: 9px; height: 9px; border-radius: 2px; margin-right: 6px; vertical-align: -1px; }
.sw.session { background: #dfe8fc; box-shadow: inset 0 0 0 1px #2457d6; }
.sw.practice { background: #fbedd5; box-shadow: inset 0 0 0 1px #9a5b00; }
.sw.deadline { box-shadow: inset 0 0 0 1.5px #c0352b; }
footer { margin-top: 18px; padding-top: 6px; border-top: 1px solid #dde2e8; color: #5f6b7a; font-size: 8pt; }
</style></head><body>
<header>
  <div><h1>${esc(D.title)}</h1><div class="sub">Група ${esc(D.group)} · ${esc(D.program)}</div><div class="sub">${esc(D.university)}</div></div>
  <div class="stamp">Станом на ${now.toLocaleDateString("uk-UA")}<br><a href="${SITE_URL}">${SITE_URL.replace("https://", "")}</a></div>
</header>

<h2>Розклад занять</h2>
<table class="sched"><thead><tr><th>Час</th><th>Предмет</th><th>Викладач</th><th>Підключення</th></tr></thead>${schedule}</table>
<p class="muted" style="font-size:8pt">Тривалість пари — ${slot} хв. Назви «Zoom» / «Google Meet» у PDF клікабельні; повні посилання — у таблиці нижче.</p>

<h2>Викладачі, контакти та посилання</h2>
<table class="contacts"><thead><tr><th>Предмет</th><th>Викладач</th><th>Телефон</th><th>Посилання на заняття</th></tr></thead><tbody>${contacts}</tbody></table>

<h2 class="pb">Графік навчального року</h2>
<div class="legend"><span><i class="sw session"></i>сесія</span><span><i class="sw practice"></i>практика</span><span><i class="sw deadline"></i>дедлайн</span><span><u>12</u> — є заняття в розкладі</span></div>
<div class="months">${months}</div>
<table><tbody>${calList}</tbody></table>

<h2>Записи занять</h2>
${recordings}
${links}

<footer>Документ містить особисті контакти викладачів — не публікуйте його у відкритому доступі. Актуальна версія — на сайті групи: ${SITE_URL}</footer>
</body></html>`;

mkdirSync("out", { recursive: true });
const htmlPath = resolve("out/print.html"), plain = resolve("out/rozklad.pdf");
writeFileSync(htmlPath, html);
execFileSync(chrome, ["--headless=new", "--disable-gpu", "--no-pdf-header-footer", `--print-to-pdf=${plain}`,
  `--user-data-dir=${resolve("out/.chrome")}`, pathToFileURL(htmlPath).href], { stdio: "ignore" });
rmSync(resolve("out/.chrome"), { recursive: true, force: true });
if (!existsSync(plain)) { console.error("Chrome did not produce a PDF."); process.exit(1); }

// Encrypt with the site password so the published copy is as protected as the site.
execFileSync("python", ["-c", `
import sys
from pypdf import PdfReader, PdfWriter
w = PdfWriter(clone_from=PdfReader(sys.argv[1]))
w.add_metadata({"/Title": sys.argv[4], "/Author": "Група " + sys.argv[5]})
w.encrypt(user_password=sys.argv[3], algorithm="AES-256")
with open(sys.argv[2], "wb") as f: w.write(f)
`, plain, resolve("docs/rozklad.pdf"), password, `Розклад ${D.group}`, D.group], { stdio: "inherit", env: { ...process.env, PYTHONIOENCODING: "utf8" } });

console.log("Built docs/rozklad.pdf (encrypted, publish) and out/rozklad.pdf (unencrypted, private)");
