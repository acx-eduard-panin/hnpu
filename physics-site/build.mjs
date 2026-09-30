// Builds docs/index.html: encrypts data.json with the site password (AES-256-GCM, PBKDF2-SHA256).
//
//   node build.mjs              encrypt data.json -> docs/index.html
//   node build.mjs --decrypt    restore data.json from docs/index.html (if the local copy is lost)
//
// Password: SITE_PASSWORD env var, otherwise the first line of .password (both kept out of git).
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { webcrypto as crypto } from "node:crypto";

const ITER = 310000;
const OUT = "docs/index.html";

const password = process.env.SITE_PASSWORD
  || (existsSync(".password") && readFileSync(".password", "utf8").split(/\r?\n/)[0].trim());
if (!password) {
  console.error("No password: set SITE_PASSWORD or create a .password file.");
  process.exit(1);
}

const b64 = buf => Buffer.from(buf).toString("base64");

async function deriveKey(salt, iter) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" },
    base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

if (process.argv.includes("--decrypt")) {
  const m = readFileSync(OUT, "utf8").match(/const PAYLOAD = (\{.*?\});/);
  if (!m) throw new Error(`No payload found in ${OUT}`);
  const p = JSON.parse(m[1]);
  const key = await deriveKey(Buffer.from(p.salt, "base64"), p.iter);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: Buffer.from(p.iv, "base64") }, key, Buffer.from(p.ct, "base64"));
  writeFileSync("data.json", JSON.stringify(JSON.parse(new TextDecoder().decode(plain)), null, 2) + "\n");
  console.log("Restored data.json");
  process.exit(0);
}

const data = JSON.parse(readFileSync("data.json", "utf8"));

// Catch typos in ids before they turn into blank rows on the site.
const problems = [];
for (const [id, s] of Object.entries(data.subjects || {}))
  for (const t of s.teachers || []) if (!data.teachers?.[t]) problems.push(`subject ${id}: unknown teacher "${t}"`);
for (const [i, s] of (data.sessions || []).entries()) {
  if (!data.subjects?.[s.subject]) problems.push(`sessions[${i}]: unknown subject "${s.subject}"`);
  if (s.teacher && !data.teachers?.[s.teacher]) problems.push(`sessions[${i}]: unknown teacher "${s.teacher}"`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.date) || !/^\d{2}:\d{2}$/.test(s.time)) problems.push(`sessions[${i}]: bad date/time`);
}
for (const [i, r] of (data.recordings || []).entries()) {
  if (r.subject && !data.subjects?.[r.subject]) problems.push(`recordings[${i}]: unknown subject "${r.subject}"`);
  if (!/^https?:\/\//.test(r.url || "")) problems.push(`recordings[${i}]: url must start with http(s)://`);
}
for (const [i, c] of (data.calendar || []).entries()) {
  if (c.type && !["session", "practice", "deadline"].includes(c.type)) problems.push(`calendar[${i}]: type must be session|practice|deadline`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.to) || (c.from && !/^\d{4}-\d{2}-\d{2}$/.test(c.from))) problems.push(`calendar[${i}]: bad from/to`);
}
if (problems.length) {
  console.error("data.json problems:\n  " + problems.join("\n  "));
  process.exit(1);
}

const salt = crypto.getRandomValues(new Uint8Array(16));
const iv = crypto.getRandomValues(new Uint8Array(12));
const key = await deriveKey(salt, ITER);
const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(data)));

const payload = JSON.stringify({ salt: b64(salt), iv: b64(iv), iter: ITER, ct: b64(ct) });
const html = readFileSync("src/template.html", "utf8").replace("/*PAYLOAD*/null", () => payload);
writeFileSync(OUT, html);
console.log(`Built ${OUT}: ${data.sessions?.length || 0} sessions, ${data.recordings?.length || 0} recordings`);
