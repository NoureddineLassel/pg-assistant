/* مساعد رئيس القسم — منطق البرنامج. يعمل دون اتصال، والبيانات تُحفظ في IndexedDB على الجهاز.
   اللغة: L(عربي، إنجليزي) للنصوص المضمنة، و t() للمحتوى المرجعي عبر القاموس EN. */
"use strict";

/* ================= أدوات ================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const todayISO = () => new Date().toISOString().slice(0, 10);
const fmtDate = d => d ? d.split("-").reverse().join("/") : "";
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);
const addDays = (iso, n) => { const d = new Date(iso); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const acadStart = (d = new Date()) => (d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1);
const acadLabel = y => `${y} – ${y + 1}`;
const inAcad = (iso, y) => iso && iso >= `${y}-09-01` && iso <= `${y + 1}-08-31`;
const pct = (a, b) => (b ? Math.round((a / b) * 100) : null);
const lines = txt => String(txt || "").split("\n").map(s => s.trim()).filter(Boolean);

/* ---- اللغة ---- */
const isEn = () => S.settings?.lang === "en";
const L = (ar, en) => (isEn() ? en : ar);
const t = s => (isEn() && s != null && EN[s] != null ? EN[s] : s);
let DOC_EN = false; /* لغة متن الوثيقة المطبوعة */
const D = (ar, en) => (DOC_EN ? en : ar);
const td = s => (DOC_EN && s != null && EN[s] != null ? EN[s] : s);

function toast(msg) {
  const el = document.createElement("div");
  el.className = "toast"; el.textContent = msg; document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

/* ================= التخزين ================= */
const DB = {
  db: null, mem: { items: new Map(), blobs: new Map() },
  async open() {
    try {
      this.db = await new Promise((res, rej) => {
        const r = indexedDB.open("pg-assistant", 1);
        r.onupgradeneeded = () => { const db = r.result; db.createObjectStore("items", { keyPath: "id" }).createIndex("type", "type"); db.createObjectStore("blobs", { keyPath: "id" }); };
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      });
    } catch (e) { this.db = null; console.warn("IndexedDB unavailable", e); }
  },
  tx(store, mode, fn) {
    if (!this.db) return Promise.resolve(fn(null));
    return new Promise((res, rej) => { const tr = this.db.transaction(store, mode); const out = fn(tr.objectStore(store)); tr.oncomplete = () => res(out?.result ?? out); tr.onerror = () => rej(tr.error); });
  },
  async all(store) {
    if (!this.db) return [...this.mem[store].values()];
    return new Promise((res, rej) => { const r = this.db.transaction(store).objectStore(store).getAll(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  },
  async get(store, id) {
    if (!this.db) return this.mem[store].get(id);
    return new Promise((res, rej) => { const r = this.db.transaction(store).objectStore(store).get(id); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  },
  put(store, v) { if (!this.db) { this.mem[store].set(v.id, v); return Promise.resolve(); } return this.tx(store, "readwrite", s => s.put(v)); },
  del(store, id) { if (!this.db) { this.mem[store].delete(id); return Promise.resolve(); } return this.tx(store, "readwrite", s => s.delete(id)); },
  clear(store) { if (!this.db) { this.mem[store].clear(); return Promise.resolve(); } return this.tx(store, "readwrite", s => s.clear()); }
};

const S = { data: {}, settings: null, prog: {}, plans: {}, route: "home", q: "", filters: {} };

async function load() {
  await DB.open();
  const all = await DB.all("items");
  Object.keys(SCHEMAS).forEach(k => (S.data[k] = []));
  S.plans = {};
  for (const it of all) {
    if (it.type === "_settings") S.settings = it.value;
    else if (it.type === "_prog") S.prog = it.value;
    else if (it.type === "_plan") S.plans[it.year] = it.plan;
    else if (S.data[it.type]) S.data[it.type].push(it);
  }
  const fresh = !S.settings;
  S.settings = Object.assign({}, DEFAULT_SETTINGS, S.settings || {});
  S.settings.targets = Object.assign({}, DEFAULT_SETTINGS.targets, S.settings.targets || {});
  S.settings.views = S.settings.views || {};
  if (fresh) { await saveSettings(); await seedSample(); }
}
const saveSettings = () => DB.put("items", { id: "_settings", type: "_settings", value: S.settings });
const saveProg = () => DB.put("items", { id: "_prog", type: "_prog", value: S.prog });
async function saveItem(type, rec) {
  rec.type = type; rec.updated = new Date().toISOString(); if (!rec.id) { rec.id = uid(); rec.created = rec.updated; }
  const arr = S.data[type]; const i = arr.findIndex(x => x.id === rec.id);
  if (i >= 0) arr[i] = rec; else arr.push(rec);
  await DB.put("items", rec);
}
async function deleteItem(type, id) {
  const rec = S.data[type].find(x => x.id === id);
  for (const f of rec?.files || []) await DB.del("blobs", f.id);
  S.data[type] = S.data[type].filter(x => x.id !== id);
  await DB.del("items", id);
}
const byId = (type, id) => S.data[type]?.find(x => x.id === id);
function displayOf(type, r, tr = t) {
  if (!r) return "";
  const sc = SCHEMAS[type]; const f = sc.fields.find(x => x.k === sc.display); const v = r[sc.display];
  if (f?.type === "ref") return nameOf(f.ref, v);
  if (f?.type === "select") return tr(f.labels?.[v] || v);
  return v ?? "";
}
const nameOf = (type, id) => displayOf(type, byId(type, id));

/* ================= منطق المجال ================= */
function applicableText(st, fn = L) {
  if (st.track === "دكتوراه علوم" || st.track === "ماجستير") return fn("م.ت 98-254 (النظام الكلاسيكي)", "ED 98-254 (classic system)");
  if (!st.firstYear) return "—";
  return +st.firstYear >= 2022 ? fn("م.ت 22-208", "ED 22-208") : fn("م.ت 08-265 (أحكام انتقالية)", "ED 08-265 (transitional)");
}
const studyYear = st => (st.firstYear ? acadStart() - +st.firstYear + 1 : null);
const closed = s => ["ناقش", "مشطوب"].includes(s.status);
const supLoad = id => S.data.students.filter(s => s.supervisor === id && !closed(s)).length;
const supMax = sup => +sup.maxStudents || +S.settings.maxPerSupervisor;
function procMeta(p) {
  const tpl = PROCEDURES[p.ptype]; const steps = p.steps || [];
  const n = tpl ? tpl.steps.length : 0; const done = steps.filter(s => s?.done).length;
  const late = p.due && p.due < todayISO() && done < n;
  return { tpl, n, done, p: pct(done, n) ?? 0, late, finished: n && done === n };
}
function agrMeta(a) {
  const exp = a.signed && a.years ? addDays(a.signed, Math.round(+a.years * 365.25)) : "";
  const acts = lines(a.activities).length; const valid = !exp || exp >= todayISO();
  return { exp, acts, valid, soon: valid && exp && daysBetween(todayISO(), exp) <= 90 };
}
function nextMailNumber(dir) {
  const y = new Date().getFullYear();
  const n = S.data.mail.filter(m => m.direction === dir && (m.date || "").startsWith(String(y))).length + 1;
  return `${String(n).padStart(3, "0")}/${dir === "صادر" ? "ص" : "و"}/${y}`;
}

/* ---- التنبيهات ---- */
function computeAlerts() {
  const A = []; const st = S.settings; const today = todayISO();
  for (const s of S.data.students) {
    if (closed(s)) continue;
    const y = studyYear(s); const lmd = s.track === "دكتوراه ل.م.د";
    if (lmd && y > st.maxYears) A.push(["crit", L(`${s.name}: السنة ${y} من التكوين، تجاوز المدة القصوى (${st.maxYears})`, `${s.name}: year ${y} of training, beyond the maximum (${st.maxYears})`), "students"]);
    else if (lmd && y > st.normalYears && s.status !== "ممدد") A.push(["warn", L(`${s.name}: السنة ${y}، يحتاج قرار تمديد`, `${s.name}: year ${y}, needs an extension decision`), "students"]);
    if (!s.charter) A.push(["warn", L(`${s.name}: ميثاق الأطروحة غير موقع`, `${s.name}: thesis charter not signed`), "students"]);
    if (s.lastReinscription && +s.lastReinscription < acadStart() && s.status !== "مجمد") A.push(["warn", L(`${s.name}: لم يُعَد تسجيله للسنة ${acadLabel(acadStart())}`, `${s.name}: not re-registered for ${acadLabel(acadStart())}`), "students"]);
  }
  for (const sp of S.data.supervisors) { const l = supLoad(sp.id), m = supMax(sp); if (l > m) A.push(["crit", L(`${sp.name}: ${l} طلبة يتجاوز الحد الأقصى (${m})`, `${sp.name}: ${l} students exceeds the maximum (${m})`), "supervisors"]); }
  for (const p of S.data.procedures) { const m = procMeta(p); if (m.late) A.push(["crit", L(`ملف متأخر: ${m.tpl?.name} — ${p.subject} (الأجل ${fmtDate(p.due)})`, `Overdue: ${t(m.tpl?.name)} — ${p.subject} (due ${fmtDate(p.due)})`), "procedures"]); }
  for (const d of S.data.defenses) {
    const nm = nameOf("students", d.student);
    if (d.plagiarism && +d.plagiarism > +st.plagiarismMax) A.push(["crit", L(`نسبة تشابه ${d.plagiarism}% في أطروحة ${nm}`, `Similarity ${d.plagiarism}% in ${nm}'s thesis`), "defenses"]);
    if (d.reportsDue && d.reportsDue < today && d.stage === "في الخبرة") A.push(["warn", L(`انقضى أجل المقررين: ${nm}`, `Reviewers' deadline passed: ${nm}`), "defenses"]);
    if (d.stage === "نوقشت" && !d.finalDeposit) A.push(["warn", L(`لم تودع النسخة النهائية: ${nm}`, `Final copy not deposited: ${nm}`), "defenses"]);
  }
  for (const s of S.data.stages) if (s.state === "منجز" && !s.report) A.push(["warn", L(`تقرير التربص غير مستلم: ${s.person}`, `Training report missing: ${s.person}`), "stages"]);
  for (const a of S.data.agreements) { const m = agrMeta(a); if (m.soon) A.push(["warn", L(`اتفاقية ${a.partner} تنتهي في ${fmtDate(m.exp)}`, `Agreement with ${a.partner} ends on ${fmtDate(m.exp)}`), "agreements"]); }
  const pend = S.data.mail.filter(m => m.state === "قيد المعالجة" && m.date && daysBetween(m.date, today) > 7);
  if (pend.length) A.push(["warn", L(`${pend.length} مراسلة قيد المعالجة منذ أكثر من أسبوع`, `${pend.length} letter(s) pending for over a week`), "mail"]);
  return A;
}
function upcoming() {
  const today = todayISO(), lim = addDays(today, 45), U = [];
  for (const d of S.data.defenses) if (d.defenseDate >= today && d.defenseDate <= lim) U.push([d.defenseDate, L("مناقشة: ", "Defense: ") + nameOf("students", d.student), "defenses"]);
  for (const e of S.data.events) if (e.date >= today && e.date <= lim && e.state !== "ملغاة") U.push([e.date, `${t(e.kind)}: ${e.title}`, "events"]);
  for (const p of S.data.procedures) { const m = procMeta(p); if (!m.finished && p.due >= today && p.due <= lim) U.push([p.due, `${L("أجل", "Due")}: ${t(m.tpl?.name)} — ${p.subject}`, "procedures"]); }
  for (const s of S.data.seminars) if (s.date >= today && s.date <= lim) U.push([s.date, L("مرافعة: ", "Seminar: ") + nameOf("students", s.student), "seminars"]);
  for (const c of S.data.council) if (c.date >= today && c.date <= lim) U.push([c.date, L("دورة اللجنة العلمية ", "Scientific Committee session ") + c.number, "council"]);
  for (const yy of [acadStart(), acadStart() + 1]) for (const mo of planFor(yy).months) for (const x of mo.tasks) if (x.date && x.date >= today && x.date <= lim && !S.prog[`${yy}-${x.id}`]) U.push([x.date, L("مهمة: ", "Task: ") + t(x.text), "program"]);
  return U.sort((a, b) => a[0].localeCompare(b[0]));
}

/* ---- مؤشرات الأداء ---- */
function computeKPIs(y = acadStart(), fn = L) {
  const st = S.settings, T = st.targets;
  const Dn = S.data.defenses.filter(d => d.stage === "نوقشت");
  const cohorts = S.data.students.filter(s => s.track === "دكتوراه ل.م.د" && s.firstYear && +s.firstYear <= y - st.normalYears + 1);
  const ontime = cohorts.filter(s => { const d = Dn.find(x => x.student === s.id); return d && d.defenseDate && (acadStart(new Date(d.defenseDate)) - +s.firstYear + 1) <= st.normalYears; }).length;
  const defYear = Dn.filter(d => inAcad(d.defenseDate, y));
  const semY = S.data.seminars.filter(s => inAcad(s.date, y)); const semP = semY.filter(s => s.attended === "حاضر").length;
  const durs = Dn.filter(d => d.depositDate && d.defenseDate && inAcad(d.defenseDate, y)).map(d => daysBetween(d.depositDate, d.defenseDate));
  const habil = S.data.procedures.filter(p => p.ptype === "habil" && inAcad(p.opened, y)).length;
  const ranked = S.data.production.filter(p => p.rank && (+p.year === y || +p.year === y + 1)).length;
  const agr = S.data.agreements.filter(a => agrMeta(a).valid); const agrActive = agr.filter(a => agrMeta(a).acts > 0).length;
  const stG = S.data.stages.filter(s => ["ممنوح", "منجز"].includes(s.state) && (+s.session === y || +s.session === y + 1));
  const stDone = stG.filter(s => s.state === "منجز"); const stRep = stDone.filter(s => s.report).length;
  const evY = S.data.events.filter(e => inAcad(e.date, y) && e.state !== "ملغاة"); const evDone = evY.filter(e => e.state === "منجزة"); const evPub = evDone.filter(e => e.published).length;
  return [
    { k: "ontime", l: fn("نسبة المناقشة في الآجال", "On-time defense rate"), v: pct(ontime, cohorts.length), u: "%", calc: fn(`${ontime} ÷ ${cohorts.length} من الدفعات المعنية`, `${ontime} ÷ ${cohorts.length} in eligible cohorts`), t: T.ontime, hi: true },
    { k: "defenses", l: fn("عدد المناقشات في السنة", "Defenses this year"), v: defYear.length, u: "", calc: fn("دكتوراه ل.م.د + دكتوراه علوم", "LMD + Doctorate in Sciences"), t: T.defenses, hi: true },
    { k: "attendance", l: fn("نسبة حضور المرافعات الدورية", "Progress seminar attendance"), v: pct(semP, semY.length), u: "%", calc: `${semP} ÷ ${semY.length}`, t: T.attendance, hi: true },
    { k: "avgDays", l: fn("متوسط مدة معالجة ملف الإيداع", "Average submission processing time"), v: durs.length ? Math.round(durs.reduce((a, b) => a + b, 0) / durs.length) : null, u: fn(" يوما", " days"), calc: fn("من الإيداع إلى المناقشة", "From submission to defense"), t: T.avgDays, hi: false },
    { k: "habil", l: fn("ملفات التأهيل الجامعي المودعة", "Habilitation files submitted"), v: habil, u: "", calc: fn("ملفات الإجراء خلال السنة", "Procedure files this year"), t: T.habil, hi: true },
    { k: "ranked", l: fn("منشورات في مجلات مصنفة", "Publications in ranked journals"), v: ranked, u: "", calc: fn("لأساتذة القسم وطلبته", "By department staff and students"), t: T.ranked, hi: true },
    { k: "activeAgr", l: fn("الاتفاقيات النشطة", "Active agreements"), v: pct(agrActive, agr.length), u: "%", calc: fn(`${agrActive} أنتجت نشاطا ÷ ${agr.length} سارية`, `${agrActive} with activity ÷ ${agr.length} in force`), t: T.activeAgr, hi: true },
    { k: "stagesDone", l: fn("التربصات المنجزة", "Training stays completed"), v: pct(stDone.length, stG.length), u: "%", calc: fn(`${stDone.length} ÷ ${stG.length}؛ التقارير المستلمة ${stRep}/${stDone.length}`, `${stDone.length} ÷ ${stG.length}; reports received ${stRep}/${stDone.length}`), t: T.stagesDone, hi: true },
    { k: "events", l: fn("التظاهرات المنجزة", "Events held"), v: pct(evDone.length, evY.length), u: "%", calc: fn(`${evDone.length} ÷ ${evY.length}؛ الأعمال المنشورة ${evPub}`, `${evDone.length} ÷ ${evY.length}; proceedings published ${evPub}`), t: T.events, hi: true }
  ];
}
function kpiState(k) { if (k.v == null || k.t == null || k.t === "") return ""; return (k.hi ? k.v >= k.t : k.v <= k.t) ? "ok" : "warn"; }

/* ================= الهيكل والتنقل ================= */
const MODE_ICONS = {
  light: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`,
  dark: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>`,
  auto: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/></svg>`
};
function renderChrome() {
  $("#brandName").textContent = L("مساعد رئيس القسم", "Assistant Head of Department");
  $("#brandSub").textContent = L("ما بعد التدرج والعلاقات الخارجية", "Postgraduate studies & external relations");
  $("#gq").placeholder = L("بحث في كل السجلات…", "Search all registers…");
  $("#bannerText").textContent = L("تعرض السجلات حاليا بيانات تجريبية للتوضيح. احذفها وابدأ بإدخال بيانات القسم.", "The registers currently show sample data. Delete it and start entering your department's data.");
  $("#bannerClear").textContent = L("حذف البيانات التجريبية", "Delete sample data");
  $("#langBtn").textContent = L("English", "العربية");
  $("#langBtn").title = L("التبديل إلى الإنجليزية", "Switch to Arabic");
  const m = S.settings.mode;
  $("#modeBtn").innerHTML = MODE_ICONS[m] || MODE_ICONS.auto;
  $("#modeBtn").title = L("الوضع: ", "Mode: ") + (m === "dark" ? L("داكن", "dark") : m === "light" ? L("فاتح", "light") : L("تلقائي", "auto"));
  $("#themeLink").textContent = L("الثيم", "Theme");
  $("#menuBtn").setAttribute("aria-label", L("القائمة", "Menu"));
  const st = S.settings;
  $("#uniBox").innerHTML = `${st.logo ? `<img src="${st.logo}" alt="${esc(L("شعار الجامعة", "University logo"))}">` : ""}<div><b>${esc(L(st.university, st.universityEn))}</b><span>${esc(L(st.faculty, st.facultyEn))}</span></div>`;
}
function renderNav() {
  const alerts = computeAlerts();
  $("#nav").innerHTML = NAV.map(g => `<div class="nav-group"><h6>${esc(t(g.group))}</h6>${g.items.map(([r, l]) => {
    let n = S.data[r] ? `<span class="n">${S.data[r].length}</span>` : "";
    if (r === "home" && alerts.length) n = `<span class="n alert">${alerts.length}</span>`;
    return `<a href="#${r}" class="${S.route === r ? "on" : ""}">${esc(t(l))}${n}</a>`;
  }).join("")}</div>`).join("");
}
function setTitle(title, sub = "") { $("#title").textContent = title; $("#subtitle").textContent = sub; document.title = `${title} · ${L("مساعد رئيس القسم", "Assistant Head")}`; }

function route() {
  const r = (location.hash || "#home").slice(1);
  S.route = r in VIEWS || r in SCHEMAS ? r : "home";
  document.body.dataset.route = S.route;
  $("#rail").classList.remove("open");
  renderChrome(); renderNav();
  $("#banner").hidden = !(S.data.students.some(x => x.sample) || S.data.supervisors.some(x => x.sample));
  renderBackupBanner();
  (VIEWS[S.route] || renderRegistry)(S.route);
  window.scrollTo(0, 0);
}
async function setPref(k, v) { S.settings[k] = v; await saveSettings(); applyAppearance(S.settings); route(); paintKpis(); }

/* ================= لوحة القيادة ================= */
function viewHome() {
  setTitle(L("لوحة القيادة", "Dashboard"), `${L("السنة الجامعية", "Academic year")} ${acadLabel(acadStart())} · ${L(S.settings.department, S.settings.departmentEn)}`);
  const active = S.data.students.filter(s => !closed(s));
  const alerts = computeAlerts(); const up = upcoming();
  const pm = PROGRAM.find(p => p.m === new Date().getMonth() + 1);
  const tiles = [
    [active.length, L("طالب دكتوراه في طور التكوين", "doctoral students in training"), "students"],
    [S.data.defenses.filter(d => d.stage !== "نوقشت").length, L("أطروحة في مسار المناقشة", "theses in the defense pipeline"), "defenses"],
    [S.data.procedures.filter(p => !procMeta(p).finished).length, L("ملف إجراء مفتوح", "open procedure files"), "procedures"],
    [S.data.agreements.filter(a => agrMeta(a).valid).length, L("اتفاقية سارية", "agreements in force"), "agreements"],
    [S.data.mail.filter(x => x.state === "قيد المعالجة").length, L("مراسلة قيد المعالجة", "letters pending"), "mail"],
    [S.data.archive.length, L("وثيقة في الأرشيف الرقمي", "documents in the archive"), "archive"]
  ];
  const flow = [L("فرقة التكوين / المشرف", "Training team / supervisor"), L("رئيس القسم المساعد", "Assistant Head"), t("اللجنة العلمية للقسم"), t("المجلس العلمي للكلية"), L("نائب العميد", "Vice-Dean"), L("نيابة المديرية", "Vice-Rectorate")];
  $("#view").innerHTML = `
    <div class="kpis">${tiles.map(([v, l, r]) => `<a class="kpi link" href="#${r}"><span class="v">${v}</span><span class="l">${l}</span></a>`).join("")}</div>
    <div class="grid two">
      <section class="panel"><h2>${L("تنبيهات تحتاج متابعة", "Alerts to follow up")} <span class="chip ${alerts.length ? "crit" : "ok"}">${alerts.length}</span></h2>
        ${alerts.length ? `<ul class="alerts">${alerts.slice(0, 14).map(([c, msg, r]) => `<li class="${c}">${esc(msg)}<a href="#${r}">${L("فتح السجل", "Open")}</a></li>`).join("")}</ul>${alerts.length > 14 ? `<p class="muted small">${L(`و${alerts.length - 14} تنبيهات أخرى.`, `and ${alerts.length - 14} more.`)}</p>` : ""}` : `<p class="muted">${L("لا توجد تنبيهات. كل السجلات في وضعية سليمة.", "No alerts. All registers are in order.")}</p>`}
      </section>
      <section class="panel"><h2>${L("المواعيد خلال 45 يوما", "Next 45 days")}</h2>
        ${up.length ? `<ul class="alerts">${up.map(([d, msg, r]) => `<li><span class="num">${fmtDate(d)}</span> ${esc(msg)}<a href="#${r}">${L("فتح", "Open")}</a></li>`).join("")}</ul>` : `<p class="muted">${L("لا مواعيد مسجلة. أضف تواريخ المناقشات والتظاهرات وآجال الملفات لتظهر هنا.", "Nothing scheduled. Add defense and event dates or file deadlines to see them here.")}</p>`}
      </section>
      <section class="panel"><h2>${L(`مهام شهر ${pm.name} من البرنامج السنوي`, `${t(pm.name)} tasks from the annual programme`)}</h2>${monthTicks(planFor(acadStart()).months.find(x => x.m === pm.m), acadStart())}${planFor(acadStart()).months.find(x => x.m === pm.m)?.out ? `<p class="small muted">${L("المخرج المنتظر", "Expected output")}: ${esc(t(planFor(acadStart()).months.find(x => x.m === pm.m).out))}</p>` : ""}<a href="#program" class="small">${L("البرنامج السنوي كاملا", "Full annual programme")}</a></section>
      <section class="panel"><h2>${L("مسار الملفات", "File workflow")}</h2>
        <div class="flow">${flow.map(f => `<span>${esc(f)}</span>`).join(`<i>${isEn() ? "→" : "←"}</i>`)}</div>
        <h3>${L("إجراء جديد", "New procedure")}</h3>
        <div class="toolbar">${Object.entries(PROCEDURES).slice(0, 6).map(([k, v]) => `<button class="btn sm" data-newproc="${k}">${esc(t(v.name))}</button>`).join("")}</div>
      </section>
    </div>`;
  bindTicks();
  $$("[data-newproc]").forEach(b => b.onclick = () => openForm("procedures", null, { ptype: b.dataset.newproc }));
}

/* ================= البرنامج السنوي: مخطط قابل للتعديل لكل سنة جامعية ================= */
const AXES = { pg: ["ما بعد التدرج", "Postgraduate"], re: ["العلاقات الخارجية", "External relations"], gen: ["مهام عامة", "General"] };
const axisLabel = k => L(...(AXES[k] || AXES.gen));
const monthName = m => t(PROGRAM.find(p => p.m === m)?.name || "");
function defaultPlan() {
  return {
    source: "default",
    months: PROGRAM.map(p => ({ m: p.m, out: p.out, tasks: [...p.pg.map((x, i) => ({ id: `${p.m}-${i}`, axis: "pg", text: x })), ...p.re.map((x, j) => ({ id: `${p.m}-${p.pg.length + j}`, axis: "re", text: x }))] })),
    recurring: Object.fromEntries(Object.entries(RECURRING).map(([k, arr]) => [k, arr.map((x, i) => ({ id: `r${k}-${i}`, text: x }))]))
  };
}
const emptyPlan = () => ({ source: "empty", months: PROGRAM.map(p => ({ m: p.m, out: "", tasks: [] })), recurring: Object.fromEntries(Object.keys(RECURRING).map(k => [k, []])) });
const hasPlan = y => !!S.plans[y];
const planFor = y => S.plans[y] || defaultPlan();
function editablePlan(y) { if (!S.plans[y]) S.plans[y] = defaultPlan(); return S.plans[y]; }
const savePlan = y => DB.put("items", { id: `_plan_${y}`, type: "_plan", year: y, plan: S.plans[y] });
async function deletePlan(y) { delete S.plans[y]; await DB.del("items", `_plan_${y}`); }
function planCount(y) { const ts = planFor(y).months.flatMap(mo => mo.tasks); return [ts.filter(x => S.prog[`${y}-${x.id}`]).length, ts.length]; }
function periodKey(p) { const d = new Date(); if (p === "شهريا") return d.getMonth(); if (p === "فصليا") return Math.floor(d.getMonth() / 3); const j = new Date(d.getFullYear(), 0, 1); return Math.ceil(((d - j) / 86400000 + j.getDay() + 1) / 7); }
const recKey = (y, p, id) => `${y}-${id}-${periodKey(p)}`;
function shiftYear(iso, n) { if (!iso || !n) return iso || ""; const [yy, mm, dd] = iso.split("-"); return `${+yy + n}-${mm}-${dd}`; }

function monthTicks(mo, y) {
  if (!mo || !mo.tasks.length) return `<p class="muted small">${L("لا مهام في هذا الشهر.", "No tasks this month.")}</p>`;
  return mo.tasks.map(x => { const k = `${y}-${x.id}`; const on = !!S.prog[k];
    return `<label class="tick ${on ? "done" : ""}"><input type="checkbox" data-tick="${k}" ${on ? "checked" : ""}><span><span class="tag">${axisLabel(x.axis)}</span> · ${esc(t(x.text))}${x.date ? ` <span class="num small muted">${fmtDate(x.date)}</span>` : ""}</span></label>`; }).join("");
}
function bindTicks() {
  $$("[data-tick]").forEach(c => c.onchange = async () => { if (c.checked) S.prog[c.dataset.tick] = todayISO(); else delete S.prog[c.dataset.tick]; c.closest(".tick").classList.toggle("done", c.checked); await saveProg(); updateProgCount(); });
}
function updateProgCount() {
  const el = $("#progCount"); if (!el) return;
  const [done, all] = planCount(S.filters.progYear ?? acadStart());
  el.textContent = `${done} / ${all} ${L("مهمة منجزة", "tasks done")}`;
}
function monthEditor(mo) {
  const btn = (attr, label, aria, extra = "") => `<button type="button" class="btn sm ${extra}" ${attr} data-m="${mo.m}" aria-label="${aria}">${label}</button>`;
  return `<ul class="ptasks">${mo.tasks.map((x, i) => `<li class="ptask"><span class="tag">${axisLabel(x.axis)}</span><span class="tx">${esc(t(x.text))}${x.date ? ` <span class="num small muted">${fmtDate(x.date)}</span>` : ""}</span><span class="pt-act">${btn(`data-mv="-1" data-tid="${x.id}" ${i === 0 ? "disabled" : ""}`, "▲", L("تحريك للأعلى", "Move up"), "ghost")}${btn(`data-mv="1" data-tid="${x.id}" ${i === mo.tasks.length - 1 ? "disabled" : ""}`, "▼", L("تحريك للأسفل", "Move down"), "ghost")}${btn(`data-et="${x.id}"`, L("تعديل", "Edit"), L("تعديل المهمة", "Edit task"))}${btn(`data-dt="${x.id}"`, L("حذف", "Delete"), L("حذف المهمة", "Delete task"), "danger")}</span></li>`).join("") || `<li class="muted small">${L("لا مهام بعد.", "No tasks yet.")}</li>`}</ul>
    <button type="button" class="btn sm primary" data-addtask="${mo.m}">+ ${L("إضافة مهمة", "Add task")}</button>`;
}
function recEditor(p, arr) {
  return `<ul class="ptasks">${arr.map(x => `<li class="ptask"><span class="tx">${esc(t(x.text))}</span><span class="pt-act"><button type="button" class="btn sm danger" data-drec="${esc(p)}" data-tid="${x.id}">${L("حذف", "Delete")}</button></span></li>`).join("") || `<li class="muted small">${L("لا مهام بعد.", "No tasks yet.")}</li>`}</ul>
    <div class="rec-add"><input type="text" data-recin="${esc(p)}" placeholder="${L("مهمة دورية جديدة", "New recurring task")}" aria-label="${L("مهمة دورية جديدة", "New recurring task")}"><button type="button" class="btn sm primary" data-addrec="${esc(p)}">+ ${L("إضافة", "Add")}</button></div>`;
}
function viewProgram() {
  const y = S.filters.progYear ?? acadStart(); const nowM = new Date().getMonth() + 1; const edit = !!S.filters.progEdit;
  const plan = planFor(y); const [done, all] = planCount(y);
  const years = [...new Set([-2, -1, 0, 1, 2, 3].map(d => acadStart() + d).concat(Object.keys(S.plans).map(Number)))].sort((a, b) => a - b);
  setTitle(L("البرنامج السنوي", "Annual programme"), L("من سبتمبر إلى أوت · لكل سنة جامعية مخططها الخاص", "September to August · each academic year has its own plan"));
  const status = hasPlan(y) ? `<span class="chip ok">${L("مخطط خاص بهذه السنة", "Custom plan for this year")}</span>` : `<span class="chip">${L("النموذج الافتراضي من الدليل", "Default template from the guide")}</span>`;
  $("#view").innerHTML = `
    <div class="toolbar"><label class="small muted" for="py">${L("السنة الجامعية", "Academic year")}</label>
      <select id="py">${years.map(v => `<option value="${v}" ${v === y ? "selected" : ""}>${acadLabel(v)}${S.plans[v] ? " ●" : ""}</option>`).join("")}</select>
      ${status}<span class="chip ink" id="progCount">${done} / ${all} ${L("مهمة منجزة", "tasks done")}</span><span class="spacer"></span>
      <button class="btn ${edit ? "primary" : ""}" id="editPlan">${edit ? L("إنهاء التعديل", "Done editing") : L("تعديل المخطط", "Edit plan")}</button>
      <button class="btn" id="newPlan">${L("إعداد مخطط سنة", "Prepare a year's plan")}</button>
      ${hasPlan(y) ? `<button class="btn danger" id="resetPlan">${L("العودة إلى النموذج الافتراضي", "Revert to default")}</button>` : ""}
      <button class="btn" id="printProg">${L("طباعة البرنامج", "Print programme")}</button></div>
    ${edit ? `<p class="edit-note">${L(`وضع التعديل: أضف المهام أو عدّلها أو احذفها أو غيّر ترتيبها، وعدّل المخرج المنتظر لكل شهر. التعديلات تخص السنة ${acadLabel(y)} وحدها وتُحفظ فورا.`, `Editing: add, edit, delete or reorder tasks and edit each month's expected output. Changes apply to ${acadLabel(y)} only and are saved immediately.`)}</p>` : ""}
    <div class="months">${plan.months.map(mo => { const now = mo.m === nowM && y === acadStart();
      return `<section class="month ${now ? "now" : ""} ${edit ? "editing" : ""}"><h3>${esc(monthName(mo.m))}${now ? `<span class="chip ink">${L("الشهر الحالي", "This month")}</span>` : `<span class="small muted num">${mo.tasks.length}</span>`}</h3>
        ${edit ? monthEditor(mo) : monthTicks(mo, y)}
        ${edit ? `<label class="out out-edit">${L("المخرج المنتظر", "Expected output")}<input type="text" data-out="${mo.m}" value="${esc(mo.out)}"></label>` : (mo.out ? `<div class="out">${L("المخرج", "Output")}: ${esc(t(mo.out))}</div>` : "")}</section>`; }).join("")}</div>
    <h2 class="sec-title">${L("مهام دورية طوال السنة", "Recurring tasks")}</h2>
    <div class="grid">${Object.entries(plan.recurring).map(([p, arr]) => `<section class="panel"><h2>${esc(t(p))}</h2>${edit ? recEditor(p, arr) : (arr.map(x => { const k = recKey(y, p, x.id); const on = !!S.prog[k]; return `<label class="tick ${on ? "done" : ""}"><input type="checkbox" data-tick="${k}" ${on ? "checked" : ""}><span>${esc(t(x.text))}</span></label>`; }).join("") || `<p class="muted small">—</p>`)}</section>`).join("")}</div>`;
  $("#py").onchange = e => { S.filters.progYear = +e.target.value; viewProgram(); };
  $("#printProg").onclick = () => { S.filters.tpl = "program"; location.hash = "#forms"; };
  $("#editPlan").onclick = () => { S.filters.progEdit = !edit; viewProgram(); };
  $("#newPlan").onclick = () => openPlanDialog(y);
  if ($("#resetPlan")) $("#resetPlan").onclick = () => confirmBox(L(`حذف المخطط الخاص بالسنة ${acadLabel(y)} والعودة إلى النموذج الافتراضي من الدليل؟`, `Delete the custom plan for ${acadLabel(y)} and revert to the default template?`), async () => { await deletePlan(y); toast(L("تمت العودة إلى النموذج الافتراضي", "Reverted to the default template")); viewProgram(); });
  if (!edit) { bindTicks(); return; }
  const commit = async (msg) => { await savePlan(y); if (msg) toast(msg); viewProgram(); };
  $$("[data-out]").forEach(i => i.onchange = async () => { editablePlan(y).months.find(x => x.m === +i.dataset.out).out = i.value.trim(); await savePlan(y); toast(L("تم الحفظ", "Saved")); });
  $$("[data-mv]").forEach(bt => bt.onclick = async () => { const mo = editablePlan(y).months.find(x => x.m === +bt.dataset.m); const i = mo.tasks.findIndex(x => x.id === bt.dataset.tid); const j = i + +bt.dataset.mv; if (j < 0 || j >= mo.tasks.length) return; [mo.tasks[i], mo.tasks[j]] = [mo.tasks[j], mo.tasks[i]]; await commit(); });
  $$("[data-addtask]").forEach(bt => bt.onclick = () => openTaskForm(y, +bt.dataset.addtask, null));
  $$("[data-et]").forEach(bt => bt.onclick = () => openTaskForm(y, +bt.dataset.m, bt.dataset.et));
  $$("[data-dt]").forEach(bt => bt.onclick = () => { const mo = planFor(y).months.find(x => x.m === +bt.dataset.m); const task = mo.tasks.find(x => x.id === bt.dataset.dt);
    confirmBox(L(`حذف المهمة «${t(task.text)}» من مخطط ${acadLabel(y)}؟`, `Delete the task “${t(task.text)}” from the ${acadLabel(y)} plan?`), async () => { const m2 = editablePlan(y).months.find(x => x.m === +bt.dataset.m); m2.tasks = m2.tasks.filter(x => x.id !== bt.dataset.dt); delete S.prog[`${y}-${bt.dataset.dt}`]; await saveProg(); await commit(L("حُذفت المهمة", "Task deleted")); }); });
  $$("[data-drec]").forEach(bt => bt.onclick = async () => { const pl = editablePlan(y); pl.recurring[bt.dataset.drec] = pl.recurring[bt.dataset.drec].filter(x => x.id !== bt.dataset.tid); await commit(L("حُذفت المهمة", "Task deleted")); });
  const addRec = async p => { const inp = $(`[data-recin="${CSS.escape(p)}"]`); const v = inp.value.trim(); if (!v) return inp.focus(); editablePlan(y).recurring[p].push({ id: "r" + uid(), text: v }); await commit(L("أضيفت المهمة", "Task added")); };
  $$("[data-addrec]").forEach(bt => bt.onclick = () => addRec(bt.dataset.addrec));
  $$("[data-recin]").forEach(i => i.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); addRec(i.dataset.recin); } });
}
function openTaskForm(y, m, id) {
  const mo = planFor(y).months.find(x => x.m === m); const task = id ? mo.tasks.find(x => x.id === id) : { axis: "pg", text: "", date: "" };
  const dlg = $("#dlg");
  dlg.innerHTML = `<form method="dialog" id="tfrm"><div class="dlg-head"><h2>${id ? L("تعديل مهمة", "Edit task") : L("إضافة مهمة", "Add task")} · ${acadLabel(y)}</h2><button type="button" class="btn ghost" id="tX" aria-label="${L("إغلاق", "Close")}">✕</button></div>
    <div class="dlg-body"><div class="form">
      <div class="f wide req"><label for="t_text">${L("المهمة", "Task")}</label><textarea id="t_text" name="text">${esc(task.text)}</textarea></div>
      <div class="f"><label for="t_m">${L("الشهر", "Month")}</label><select id="t_m" name="m">${PROGRAM.map(p => `<option value="${p.m}" ${p.m === m ? "selected" : ""}>${esc(t(p.name))}</option>`).join("")}</select></div>
      <div class="f"><label for="t_axis">${L("المحور", "Area")}</label><select id="t_axis" name="axis">${Object.keys(AXES).map(k => `<option value="${k}" ${k === task.axis ? "selected" : ""}>${axisLabel(k)}</option>`).join("")}</select></div>
      <div class="f"><label for="t_date">${L("تاريخ محدد (اختياري)", "Specific date (optional)")}</label><input type="date" id="t_date" name="date" value="${esc(task.date || "")}"><span class="hint">${L("المهام المؤرخة تظهر في مواعيد لوحة القيادة", "Dated tasks appear in the dashboard's upcoming dates")}</span></div>
    </div></div>
    <div class="dlg-foot"><button class="btn primary" type="submit">${L("حفظ", "Save")}</button><button class="btn" type="button" id="tC">${L("إلغاء", "Cancel")}</button></div></form>`;
  $("#tX").onclick = $("#tC").onclick = () => dlg.close();
  $("#tfrm").onsubmit = async e => {
    e.preventDefault(); const f = e.target.elements; const text = f.text.value.trim();
    if (!text) { toast(L("اكتب نص المهمة", "Enter the task text")); f.text.focus(); return; }
    const plan = editablePlan(y); const newM = +f.m.value; const data = { text, axis: f.axis.value, date: f.date.value };
    if (id) {
      const from = plan.months.find(x => x.m === m); const cur = from.tasks.find(x => x.id === id); Object.assign(cur, data);
      if (newM !== m) { from.tasks = from.tasks.filter(x => x.id !== id); plan.months.find(x => x.m === newM).tasks.push(cur); }
    } else plan.months.find(x => x.m === newM).tasks.push({ id: uid(), ...data });
    await savePlan(y); dlg.close(); toast(id ? L("عُدِّلت المهمة", "Task updated") : L("أضيفت المهمة", "Task added")); viewProgram();
  };
  dlg.showModal(); $("#t_text").focus();
}
function openPlanDialog(y0) {
  const years = [...new Set([-1, 0, 1, 2, 3, 4].map(d => acadStart() + d).concat([y0]))].sort((a, b) => a - b);
  const srcYears = [...new Set(Object.keys(S.plans).map(Number))].sort((a, b) => a - b);
  const target0 = hasPlan(y0) ? (years.find(v => v > y0 && !hasPlan(v)) ?? y0) : y0;
  const dlg = $("#dlg");
  dlg.innerHTML = `<form method="dialog" id="pfrm"><div class="dlg-head"><h2>${L("إعداد مخطط سنوي", "Prepare an annual plan")}</h2><button type="button" class="btn ghost" id="pX" aria-label="${L("إغلاق", "Close")}">✕</button></div>
    <div class="dlg-body"><div class="form">
      <div class="f wide"><label for="p_year">${L("السنة الجامعية", "Academic year")}</label><select id="p_year" name="year">${years.map(v => `<option value="${v}" ${v === target0 ? "selected" : ""}>${acadLabel(v)}${S.plans[v] ? L(" (لها مخطط)", " (has a plan)") : ""}</option>`).join("")}</select></div>
      <fieldset class="f wide plan-src"><legend>${L("نقطة الانطلاق", "Start from")}</legend>
        <label class="check"><input type="radio" name="src" value="default" checked> ${L("النموذج الافتراضي من الدليل (37 مهمة)", "The guide's default template (37 tasks)")}</label>
        <label class="check"><input type="radio" name="src" value="copy" ${srcYears.length ? "" : "disabled"}> ${L("نسخة من مخطط سنة أخرى، مع تقديم التواريخ تلقائيا", "A copy of another year's plan, with dates moved forward automatically")}
          <select name="from" ${srcYears.length ? "" : "disabled"} aria-label="${L("السنة المصدر", "Source year")}">${srcYears.map(v => `<option value="${v}">${acadLabel(v)}</option>`).join("") || `<option>${L("لا توجد مخططات خاصة بعد", "No custom plans yet")}</option>`}</select></label>
        <label class="check"><input type="radio" name="src" value="empty"> ${L("مخطط فارغ أبنيه من الصفر", "An empty plan I build from scratch")}</label>
      </fieldset>
      <div class="f wide" id="p_warn" hidden><label class="check warn-box"><input type="checkbox" name="replace"> ${L("لهذه السنة مخطط خاص؛ أؤكد استبداله", "This year already has a custom plan; I confirm replacing it")}</label></div>
    </div></div>
    <div class="dlg-foot"><button class="btn primary" type="submit">${L("إنشاء المخطط والانتقال إلى التعديل", "Create the plan and start editing")}</button><button class="btn" type="button" id="pC">${L("إلغاء", "Cancel")}</button></div></form>`;
  const f = $("#pfrm").elements; const warn = () => { $("#p_warn").hidden = !hasPlan(+f.year.value); };
  f.year.onchange = warn; warn();
  $("#pX").onclick = $("#pC").onclick = () => dlg.close();
  $("#pfrm").onsubmit = async e => {
    e.preventDefault(); const target = +f.year.value; const src = f.src.value;
    if (hasPlan(target) && !f.replace.checked) { toast(L("أكّد استبدال المخطط الحالي أولا", "Confirm replacing the current plan first")); return; }
    let plan;
    if (src === "copy") { const from = +f.from.value; plan = structuredClone(planFor(from)); plan.source = `copy-${from}`; plan.months.forEach(mo => mo.tasks.forEach(x => { x.date = shiftYear(x.date, target - from); })); }
    else plan = src === "empty" ? emptyPlan() : defaultPlan();
    S.plans[target] = plan; await savePlan(target);
    S.filters.progYear = target; S.filters.progEdit = true; dlg.close();
    toast(L(`أُنشئ مخطط ${acadLabel(target)}`, `Plan for ${acadLabel(target)} created`)); viewProgram();
  };
  dlg.showModal();
}

/* ================= المؤشرات ================= */
function viewKPI() {
  const y = S.filters.kpiYear ?? acadStart();
  setTitle(L("مؤشرات الأداء", "Performance indicators"), L("تُحسب آليا من السجلات وتُدرج في الحصيلة السنوية", "Calculated from the registers and included in the annual report"));
  const K = computeKPIs(y);
  $("#view").innerHTML = `
    <div class="toolbar"><label class="small muted" for="ky">${L("السنة الجامعية", "Academic year")}</label><select id="ky">${[-3, -2, -1, 0].map(d => acadStart() + d).map(v => `<option value="${v}" ${v === y ? "selected" : ""}>${acadLabel(v)}</option>`).join("")}</select>
      <span class="spacer"></span><button class="btn" id="annualBtn">${L("إعداد الحصيلة السنوية", "Prepare annual report")}</button></div>
    <div class="tbl-wrap"><table><thead><tr><th>${L("المؤشر", "Indicator")}</th><th>${L("القيمة", "Value")}</th><th>${L("طريقة الحساب", "Calculation")}</th><th>${L("القيمة المستهدفة", "Target")}</th><th>${L("الحالة", "Status")}</th></tr></thead><tbody>
      ${K.map(k => { const s = kpiState(k); return `<tr><td>${k.l}</td><td class="num"><b>${k.v ?? "—"}${k.v != null ? k.u : ""}</b></td><td class="small">${esc(k.calc)}</td><td><input type="number" data-target="${k.k}" value="${esc(k.t)}" style="width:90px" aria-label="${esc(k.l)}"> ${k.u.trim()}</td><td>${s ? `<span class="chip ${s}">${s === "ok" ? L("محقق", "Met") : L("دون الهدف", "Below target")}</span>` : `<span class="chip">${L("لا بيانات", "No data")}</span>`}</td></tr>`; }).join("")}
    </tbody></table></div>
    <p class="small muted">${L(`القيم المستهدفة يحددها القسم حسب وضعيته. نسبة المناقشة في الآجال تحسب لدفعات ل.م.د التي بلغت المدة العادية (${S.settings.normalYears} سنوات).`, `Targets are set by the department. The on-time rate covers LMD cohorts that reached the normal duration (${S.settings.normalYears} years).`)}</p>`;
  $("#ky").onchange = e => { S.filters.kpiYear = +e.target.value; viewKPI(); };
  $$("[data-target]").forEach(i => i.onchange = async () => { S.settings.targets[i.dataset.target] = i.value === "" ? "" : +i.value; await saveSettings(); viewKPI(); });
  $("#annualBtn").onclick = () => { S.filters.tpl = "annual"; location.hash = "#forms"; };
}

/* ================= السجلات العامة ================= */
const pastAwards = s => S.data.stages.filter(x => x.id !== s.id && x.person === s.person && ["ممنوح", "منجز"].includes(x.state)).length;
const EXTRA_COLS = {
  students: [
    [() => L("النص المطبق", "Applicable text"), s => `<span class="small">${applicableText(s)}</span>`],
    [() => L("سنة التكوين", "Year"), s => { const y = studyYear(s); if (!y || closed(s)) return "—"; const c = s.track === "دكتوراه ل.م.د" ? (y > S.settings.maxYears ? "crit" : y > S.settings.normalYears ? "warn" : "ok") : ""; return `<span class="chip ${c}">${y}</span>`; }],
    [() => L("الميثاق", "Charter"), s => s.charter ? `<span class="chip ok">${L("موقع", "Signed")}</span>` : `<span class="chip warn">${L("غير موقع", "Unsigned")}</span>`]
  ],
  supervisors: [[() => L("الطلبة / الحد", "Students / max"), s => { const l = supLoad(s.id), m = supMax(s); return `<span class="chip ${l > m ? "crit" : l === m ? "warn" : "ok"}">${l} / ${m}</span>`; }]],
  procedures: [[() => L("التقدم", "Progress"), p => { const m = procMeta(p); return `<div style="min-width:110px"><div class="bar"><i style="width:${m.p}%"></i></div><span class="small">${m.done}/${m.n}</span></div>`; }],
    [() => L("الحالة", "Status"), p => { const m = procMeta(p); return m.finished ? `<span class="chip ok">${L("منجز", "Done")}</span>` : m.late ? `<span class="chip crit">${L("متأخر", "Overdue")}</span>` : `<span class="chip ink">${L("جارٍ", "Ongoing")}</span>`; }]],
  stages: [[() => L("استفادات سابقة", "Past awards"), s => { const n = pastAwards(s); return `<span class="chip ${n ? "warn" : ""}">${n}</span>`; }]],
  agreements: [[() => L("تنتهي في", "Ends"), a => fmtDate(agrMeta(a).exp) || "—"], [() => L("الحالة", "Status"), a => { const m = agrMeta(a); return !m.valid ? `<span class="chip">${L("منتهية", "Expired")}</span>` : m.acts ? `<span class="chip ok">${L("نشطة", "Active")} (${m.acts})</span>` : `<span class="chip warn">${L("بلا نشاط", "No activity")}</span>`; }]],
  defenses: [[() => L("المشرف", "Supervisor"), d => esc(nameOf("supervisors", byId("students", d.student)?.supervisor))]]
};
const ROW_CLASS = {
  students: s => { if (closed(s)) return ""; const y = studyYear(s); if (s.track === "دكتوراه ل.م.د" && y > S.settings.maxYears) return "crit"; if (!s.charter || (s.track === "دكتوراه ل.م.د" && y > S.settings.normalYears)) return "warn"; return ""; },
  supervisors: s => supLoad(s.id) > supMax(s) ? "crit" : "",
  procedures: p => procMeta(p).late ? "crit" : "",
  defenses: d => d.plagiarism > S.settings.plagiarismMax ? "crit" : ""
};
const PRINTABLE = {
  students: [["extension", "طلب تمديد", "Extension"], ["studentCard", "بطاقة", "Card"]],
  defenses: [["depot", "طلب إيداع", "Request"], ["reporter", "مراسلة مقرر", "Reviewer letter"], ["announce", "إعلان", "Notice"], ["defenseMinutes", "محضر", "Minutes"]],
  stages: [["stageCard", "بطاقة", "Sheet"]], events: [["eventCard", "بطاقة", "Sheet"]],
  council: [["councilMinutes", "محضر", "Minutes"], ["extract", "مستخرج", "Extract"]], mail: [["letter", "مراسلة", "Letter"]]
};

function cellValue(f, r, tr = t) {
  const v = r[f.k]; const yes = tr === t ? L("نعم", "Yes") : D("نعم", "Yes"); const no = tr === t ? L("لا", "No") : D("لا", "No");
  if (f.type === "ref") return esc(nameOf(f.ref, v));
  if (f.type === "bool") return v ? `<span class="chip ok">${yes}</span>` : `<span class="chip">${no}</span>`;
  if (f.type === "date") return `<span class="num">${fmtDate(v)}</span>`;
  if (f.type === "select") return esc(tr(f.labels?.[v] || v));
  if (f.type === "number" || ["regNo", "number", "code", "ref"].includes(f.k)) return `<span class="num">${esc(v)}</span>`;
  return esc(v);
}
function searchText(type, r) {
  return SCHEMAS[type].fields.map(f => {
    const v = r[f.k];
    if (f.type === "ref") return nameOf(f.ref, v);
    if (f.type === "select") return `${v ?? ""} ${t(f.labels?.[v] || v) ?? ""}`;
    if (f.type === "files") return (v || []).map(x => x.name).join(" ");
    if (typeof v === "object") return "";
    return v;
  }).join(" ").toLowerCase();
}
function filteredRows(type) {
  const sc = SCHEMAS[type]; const fv = S.filters[type] || ""; const q = (S.filters[type + "_q"] || "").toLowerCase();
  const rows = S.data[type].filter(r => (!fv || String(r[sc.filter] ?? "") === fv) && (!q || searchText(type, r).includes(q)));
  const sortK = sc.fields.find(f => f.type === "date" && f.list)?.k;
  rows.sort((a, b) => sortK ? String(b[sortK] || "").localeCompare(String(a[sortK] || "")) : String(displayOf(type, a)).localeCompare(String(displayOf(type, b)), isEn() ? "en" : "ar"));
  if (type === "stages" && fv === "مرتب") rows.sort((a, b) => (+b.score || 0) - (+a.score || 0));
  return rows;
}

const VIEW_MODES = {
  default: [["table", "جدول", "Table"], ["cards", "بطاقات", "Cards"]],
  archive: [["cards", "بطاقات", "Cards"], ["table", "جدول", "Table"], ["gallery", "معرض", "Gallery"], ["groups", "حسب الصنف", "By category"], ["timeline", "خط زمني", "Timeline"]]
};
function viewModeOf(type) { const modes = VIEW_MODES[type] || VIEW_MODES.default; const v = S.settings.views[type]; return modes.some(m => m[0] === v) ? v : modes[0][0]; }

function renderRegistry(type) {
  const sc = SCHEMAS[type]; setTitle(t(sc.title), t(sc.note || ""));
  const ff = sc.fields.find(f => f.k === sc.filter); const fv = S.filters[type] || "";
  const rows = filteredRows(type); const mode = viewModeOf(type); const modes = VIEW_MODES[type] || VIEW_MODES.default;
  const opts = ff && ff.options ? ff.options.filter(Boolean) : [];
  $("#view").innerHTML = `
    <div class="toolbar">
      <input type="search" id="rq" placeholder="${esc(L("بحث في ", "Search ") + t(sc.title))}" value="${esc(S.filters[type + "_q"] || "")}" aria-label="${L("بحث", "Search")}">
      ${ff ? `<select id="rf" aria-label="${esc(t(ff.label))}"><option value="">${L("كل", "All:")} ${esc(t(ff.label))}</option>${opts.map(o => `<option value="${esc(o)}" ${o === fv ? "selected" : ""}>${esc(t(ff.labels?.[o] || o))}</option>`).join("")}</select>` : ""}
      <span class="small muted">${rows.length} ${L("من", "of")} ${S.data[type].length}</span>
      <div class="seg" role="group" aria-label="${L("طريقة العرض", "View")}">${modes.map(([k, a, e]) => `<button data-mode="${k}" class="${k === mode ? "on" : ""}">${L(a, e)}</button>`).join("")}</div>
      <span class="spacer"></span>
      <button class="btn" id="printList">${L("طباعة القائمة", "Print list")}</button>
      <button class="btn" id="csv">${L("تصدير Excel", "Export Excel")}</button>
      <button class="btn primary" id="add">+ ${L("إضافة", "Add")} ${esc(t(sc.one))}</button>
    </div>
    ${type === "supervisors" ? supervisionSummary() : ""}
    ${type === "archive" ? `<label class="drop" id="drop" for="quickFiles"><b>${L("إضافة سريعة", "Quick add")}</b> ${L("— اسحب الملفات هنا أو انقر لاختيارها؛ تُنشأ وثيقة لكل ملف ويمكن تصنيفها لاحقا.", "— drop files here or click to choose; one document is created per file and can be classified later.")}<input type="file" id="quickFiles" multiple hidden></label>` : ""}
    <div id="regBody">${!rows.length ? `<div class="empty">${S.data[type].length ? L("لا نتائج مطابقة للبحث.", "No matching results.") : L(`السجل فارغ. أضف أول ${sc.one} بزر «إضافة».`, `This register is empty. Use “Add” to create the first ${t(sc.one)}.`)}</div>` : REG_VIEWS[mode](type, rows)}</div>`;
  $("#rq").oninput = e => { S.filters[type + "_q"] = e.target.value; const p = e.target.selectionStart; renderRegistry(type); const n = $("#rq"); n.focus(); n.setSelectionRange(p, p); };
  if ($("#rf")) $("#rf").onchange = e => { S.filters[type] = e.target.value; renderRegistry(type); };
  $$("[data-mode]").forEach(b => b.onclick = async () => { S.settings.views[type] = b.dataset.mode; await saveSettings(); renderRegistry(type); });
  $("#add").onclick = () => openForm(type);
  $("#csv").onclick = () => exportCSV(type, rows);
  $("#printList").onclick = () => { S.filters.tpl = "list"; S.filters.listType = type; S.filters.listIds = rows.map(r => r.id); location.hash = "#forms"; };
  bindRegActions(type);
  if (type === "archive") bindQuickAdd();
  fillThumbs();
}
function bindRegActions(type) {
  $$("[data-edit]").forEach(b => b.onclick = () => openForm(b.dataset.type || type, b.dataset.edit));
  $$("[data-print]").forEach(b => b.onclick = () => { S.filters.tpl = b.dataset.print; S.filters.tplRec = b.dataset.id; location.hash = "#forms"; });
  $$("[data-openfile]").forEach(b => b.onclick = e => { e.stopPropagation(); openViewer(b.dataset.openfile); });
}
function actionsHTML(type, r) {
  return `${(PRINTABLE[type] || []).map(([k, a, e]) => `<button class="btn sm ghost" data-print="${k}" data-id="${r.id}">${L(a, e)}</button>`).join("")}<button class="btn sm" data-edit="${r.id}">${L("فتح", "Open")}</button>`;
}
const fileExt = n => (String(n).split(".").pop() || "").toUpperCase().slice(0, 4);
function thumbInner(f) {
  const badge = `<span class="ext ${esc(fileExt(f.name).toLowerCase())}">${esc(fileExt(f.name) || "FILE")}</span>`;
  return isImage(f) || isPdf(f) ? `${badge}<img data-thumb="${f.id}" alt="" hidden>` : badge;
}
const REG_VIEWS = {
  table(type, rows) {
    const cols = SCHEMAS[type].fields.filter(f => f.list); const extra = EXTRA_COLS[type] || [];
    return `<div class="tbl-wrap"><table><thead><tr>${cols.map(f => `<th>${esc(t(f.label))}</th>`).join("")}${extra.map(([l]) => `<th>${l()}</th>`).join("")}<th></th></tr></thead><tbody>
      ${rows.map(r => `<tr class="${ROW_CLASS[type]?.(r) || ""}">${cols.map(f => `<td>${cellValue(f, r)}</td>`).join("")}${extra.map(([, fn]) => `<td>${fn(r)}</td>`).join("")}
      <td class="act">${r.files?.length ? `<span class="chip ink">${r.files.length} ${L("مرفق", "file(s)")}</span> ` : ""}${actionsHTML(type, r)}</td></tr>`).join("")}</tbody></table></div>`;
  },
  cards(type, rows) { return `<div class="cards">${rows.map(r => cardHTML(type, r)).join("")}</div>`; },
  gallery(type, rows) {
    const files = rows.flatMap(r => (r.files || []).map(f => [r, f]));
    if (!files.length) return `<div class="empty">${L("لا توجد ملفات مرفقة في الوثائق المعروضة.", "No files attached to the documents shown.")}</div>`;
    return `<div class="gallery">${files.map(([r, f]) => `<figure class="gtile"><button class="thumb lg" data-openfile="${f.id}" aria-label="${esc(f.name)}">${thumbInner(f)}</button><figcaption><b>${esc(r.title)}</b><span class="muted small">${esc(f.name)}</span></figcaption><button class="btn sm" data-edit="${r.id}">${L("البطاقة", "Details")}</button></figure>`).join("")}</div>`;
  },
  groups(type, rows) {
    const order = SCHEMAS.archive.fields.find(f => f.k === "category").options;
    const cats = [...new Set(rows.map(r => r.category || ""))].sort((a, b) => order.indexOf(a) - order.indexOf(b));
    return cats.map(c => { const rs = rows.filter(r => (r.category || "") === c); return `<section class="group"><h2 class="sec-title">${esc(t(c) || L("بلا صنف", "Uncategorised"))} <span class="chip">${rs.length}</span></h2><div class="cards">${rs.map(r => cardHTML(type, r)).join("")}</div></section>`; }).join("");
  },
  timeline(type, rows) {
    const sorted = rows.slice().sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
    const yearOf = r => (r.date || "").slice(0, 4) || "—";
    const years = [...new Set(sorted.map(yearOf))];
    return `<div class="timeline">${years.map(y => `<div class="tl-year"><h2>${y === "—" ? L("بلا تاريخ", "Undated") : y}</h2>${sorted.filter(r => yearOf(r) === y).map(r => `<article class="tl-item"><span class="tl-dot"></span><div class="tl-date num">${fmtDate(r.date) || "—"}</div><div class="tl-body"><b>${esc(r.title)}</b><div class="meta">${r.category ? `<span class="chip ink">${esc(t(r.category))}</span>` : ""}${r.ref ? `<span class="num small">${esc(r.ref)}</span>` : ""}${(r.files || []).map(f => `<button class="btn sm ghost" data-openfile="${f.id}">${esc(fileExt(f.name))} · ${esc(f.name)}</button>`).join("")}</div></div><button class="btn sm" data-edit="${r.id}">${L("فتح", "Open")}</button></article>`).join("")}</div>`).join("")}</div>`;
  }
};
function cardHTML(type, r) {
  const sc = SCHEMAS[type]; const extra = EXTRA_COLS[type] || [];
  const fields = sc.fields.filter(f => f.list && f.k !== sc.display && f.k !== sc.filter).slice(0, 5);
  const ff = sc.fields.find(f => f.k === sc.filter);
  const chip = ff && r[sc.filter] ? `<span class="chip ink">${esc(t(ff.labels?.[r[sc.filter]] || r[sc.filter]))}</span>` : "";
  const thumb = type === "archive" ? `<button class="thumb" ${r.files?.[0] ? `data-openfile="${r.files[0].id}"` : "disabled"} aria-label="${L("فتح الملف", "Open file")}">${r.files?.[0] ? thumbInner(r.files[0]) : `<span class="ext">—</span>`}${r.files?.length > 1 ? `<span class="more">+${r.files.length - 1}</span>` : ""}</button>` : "";
  const tags = type === "archive" && r.tags ? `<div class="tags">${r.tags.split(/[،,]/).map(x => x.trim()).filter(Boolean).map(x => `<span class="chip">${esc(x)}</span>`).join("")}</div>` : "";
  const shown = fields.filter(f => r[f.k] !== "" && r[f.k] != null && !(f.type === "bool" && !r[f.k]) && !(type === "archive" && f.k === "tags"));
  return `<article class="card ${ROW_CLASS[type]?.(r) || ""}">${thumb}<div class="card-in"><header><h3>${esc(displayOf(type, r))}</h3>${chip}</header>
    <dl>${shown.map(f => `<dt>${esc(t(f.label))}</dt><dd>${cellValue(f, r)}</dd>`).join("")}${extra.map(([l, fn]) => `<dt>${l()}</dt><dd>${fn(r)}</dd>`).join("")}</dl>${tags}
    <footer>${r.files?.length && type !== "archive" ? `<span class="chip ink">${r.files.length} ${L("مرفق", "file(s)")}</span>` : ""}<span class="spacer"></span>${actionsHTML(type, r)}</footer></div></article>`;
}
/* ---- الملفات: تُخزَّن كـ ArrayBuffer (أوثق من Blob في Safari وداخل الصفحات المعزولة) وتُعرض عبر data: ---- */
const MIME_BY_EXT = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", txt: "text/plain", csv: "text/csv", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", odt: "application/vnd.oasis.opendocument.text" };
const guessMime = name => MIME_BY_EXT[String(name).split(".").pop().toLowerCase()] || "application/octet-stream";
async function storeFile(file, name = file.name) {
  const id = uid(); const mime = file.type || guessMime(name);
  await DB.put("blobs", { id, name, mime, buf: await file.arrayBuffer() });
  return { id, name, size: file.size, mime };
}
async function recBuffer(r) { if (r.buf) return r.buf; if (r.blob) return await r.blob.arrayBuffer(); throw new Error("empty"); }
const recBlob = async r => new Blob([await recBuffer(r)], { type: r.mime || guessMime(r.name) });
function bufToB64(buf) { const u = new Uint8Array(buf); let out = ""; for (let i = 0; i < u.length; i += 0x8000) out += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(out); }
function b64ToBuf(b64) { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; }
async function recDataURL(r) { return `data:${r.mime || guessMime(r.name)};base64,${bufToB64(await recBuffer(r))}`; }
const isPdf = f => (f.mime || "") === "application/pdf" || /\.pdf$/i.test(f.name || "");
const isImage = f => (f.mime || guessMime(f.name || "")).startsWith("image/");

/* PDF.js مضمَّن في vendor/pdfjs ويعمل في الخيط الرئيسي (لا يحتاج عامل خارجي ولا اتصالا) */
let PDFJS = null;
function loadPdfJs() {
  if (PDFJS) return PDFJS;
  const add = src => new Promise((ok, ko) => { const el = document.createElement("script"); el.src = src; el.onload = ok; el.onerror = ko; document.head.appendChild(el); });
  PDFJS = add("vendor/pdfjs/pdf.min.js").then(() => add("vendor/pdfjs/pdf.worker.min.js")).then(() => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = "vendor/pdfjs/pdf.worker.min.js"; return window.pdfjsLib; }).catch(e => { PDFJS = null; throw e; });
  return PDFJS;
}
async function pdfOpen(buf) { const lib = await loadPdfJs(); return lib.getDocument({ data: new Uint8Array(buf.slice(0)), isEvalSupported: false }).promise; }
async function pdfRender(doc, n, width) {
  const page = await doc.getPage(n); const base = page.getViewport({ scale: 1 });
  const dpr = Math.min(2, window.devicePixelRatio || 1); const scale = (width / base.width) * dpr;
  const vp = page.getViewport({ scale }); const c = document.createElement("canvas");
  c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
  await page.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
  return c;
}

const THUMBS = new Map();
async function thumbFor(id) {
  if (THUMBS.has(id)) return THUMBS.get(id);
  let url = null;
  try {
    const r = await DB.get("blobs", id);
    if (r && isImage(r)) url = await recDataURL(r);
    else if (r && isPdf(r)) { const doc = await pdfOpen(await recBuffer(r)); const c = await pdfRender(doc, 1, 360); url = c.toDataURL("image/jpeg", 0.85); doc.destroy(); }
  } catch (e) { url = null; }
  THUMBS.set(id, url); return url;
}
async function fillThumbs() {
  for (const img of $$("img[data-thumb]")) {
    const url = await thumbFor(img.dataset.thumb);
    if (!url || !img.isConnected) continue;
    img.src = url; img.hidden = false;
    const badge = img.parentElement?.querySelector(".ext"); if (badge) badge.hidden = true;
  }
}

/* ---- عارض الملفات داخل البرنامج: لا نافذة جديدة ولا تنزيل ---- */
function ensureViewer() {
  let d = $("#viewer"); if (!d) { d = document.createElement("dialog"); d.id = "viewer"; document.body.appendChild(d); }
  return d;
}
async function openViewer(id) {
  const r = await DB.get("blobs", id); if (!r) return toast(L("الملف غير موجود", "File not found"));
  const d = ensureViewer(); const framed = window.self !== window.top;
  d.innerHTML = `<div class="dlg-head"><h2 class="vw-title">${esc(r.name)}</h2><div class="vw-tools"><span class="small muted" id="vwInfo"></span><button class="btn sm" id="vwDl">${L("تنزيل", "Download")}</button><button class="btn ghost" id="vwX" aria-label="${L("إغلاق", "Close")}">✕</button></div></div><div class="vw-body" id="vwBody"><p class="muted vw-msg">${L("جارٍ فتح الملف…", "Opening file…")}</p></div>`;
  d.showModal();
  $("#vwX").onclick = () => d.close();
  $("#vwDl").onclick = async () => { try { download(await recBlob(r), r.name); } catch (e) {} if (framed) toast(L("إن لم يبدأ التنزيل: صفحة المعاينة تمنعه لغير أعضاء المؤسسة، ويعمل في البرنامج المنزّل.", "If nothing downloads: the preview page blocks downloads for non-members; it works in the installed program.")); };
  const body = $("#vwBody");
  try {
    if (isImage(r)) { body.innerHTML = `<img class="vw-img" src="${await recDataURL(r)}" alt="${esc(r.name)}">`; return; }
    if (isPdf(r)) {
      const doc = await pdfOpen(await recBuffer(r)); const total = doc.numPages; let shown = 0;
      body.innerHTML = ""; const width = Math.min(900, body.clientWidth - 32);
      const more = async () => {
        const upto = Math.min(total, shown + 10);
        for (let n = shown + 1; n <= upto; n++) {
          if (!d.open) return;
          const c = await pdfRender(doc, n, width); c.className = "vw-page"; c.style.width = width + "px";
          const fig = document.createElement("figure"); fig.className = "vw-fig"; fig.appendChild(c);
          const cap = document.createElement("figcaption"); cap.textContent = L(`صفحة ${n} من ${total}`, `Page ${n} of ${total}`); fig.appendChild(cap);
          body.appendChild(fig); shown = n; $("#vwInfo").textContent = L(`${total} صفحة`, `${total} page(s)`);
        }
        $("#vwMore")?.remove();
        if (shown < total) { const b = document.createElement("button"); b.className = "btn"; b.id = "vwMore"; b.textContent = L("عرض الصفحات التالية", "Show next pages"); b.onclick = more; body.appendChild(b); }
      };
      await more(); return;
    }
    if ((r.mime || "").startsWith("text/")) { body.innerHTML = `<pre class="vw-text">${esc(new TextDecoder().decode(await recBuffer(r)))}</pre>`; return; }
    body.innerHTML = `<div class="vw-none"><span class="ext ${esc(fileExt(r.name).toLowerCase())}">${esc(fileExt(r.name) || "FILE")}</span><p>${L("لا يمكن عرض هذا النوع من الملفات داخل البرنامج. نزّله لفتحه ببرنامجه (Word أو Excel…). للعرض المباشر، احفظ الوثيقة بصيغة PDF أو صورة.", "This file type can't be shown inside the program. Download it to open it in its own application (Word, Excel…). For direct viewing, save documents as PDF or images.")}</p></div>`;
  } catch (e) {
    body.innerHTML = `<div class="vw-none"><p>${L("تعذر فتح الملف. قد يكون تالفا أو محفوظا في نسخة سابقة لا يقرؤها هذا المتصفح؛ أعد إرفاقه.", "The file could not be opened. It may be damaged or saved in an earlier format this browser cannot read; attach it again.")}</p></div>`;
  }
}

function bindQuickAdd() {
  const drop = $("#drop");
  const add = async files => {
    let n = 0;
    for (const file of files) {
      const meta = await storeFile(file);
      await saveItem("archive", { title: file.name.replace(/\.[^.]+$/, ""), category: "أخرى", date: todayISO(), files: [meta] }); n++;
    }
    if (n) { toast(L(`أضيفت ${n} وثيقة إلى الأرشيف`, `${n} document(s) added`)); route(); }
  };
  $("#quickFiles").onchange = e => add([...e.target.files]);
  drop.ondragover = e => { e.preventDefault(); drop.classList.add("over"); };
  drop.ondragleave = () => drop.classList.remove("over");
  drop.ondrop = e => { e.preventDefault(); drop.classList.remove("over"); add([...e.dataTransfer.files]); };
}
function supervisionSummary() {
  const sups = S.data.supervisors.filter(s => !s.external); const eligible = sups.filter(s => s.hdr).length;
  const total = S.data.students.filter(s => !closed(s)).length;
  return `<div class="kpis"><div class="kpi"><span class="v">${sups.length}</span><span class="l">${L("أستاذ دائم", "permanent staff")}</span></div><div class="kpi"><span class="v">${eligible}</span><span class="l">${L("مؤهل للإشراف", "eligible to supervise")}</span></div><div class="kpi"><span class="v">${eligible ? (total / eligible).toFixed(1) : "—"}</span><span class="l">${L("متوسط الطلبة لكل مشرف مؤهل", "students per eligible supervisor")}</span></div><div class="kpi"><span class="v">${S.data.supervisors.filter(s => supLoad(s.id) > supMax(s)).length}</span><span class="l">${L("مشرف تجاوز الحد", "supervisors over the limit")}</span></div></div>`;
}

/* ================= نموذج الإدخال ================= */
let formFiles = [];
function openForm(type, id, preset = {}) {
  const sc = SCHEMAS[type]; const rec = id ? structuredClone(byId(type, id)) : Object.assign({}, preset);
  if (!id && type === "procedures") rec.opened = rec.opened || todayISO();
  if (!id && (type === "mail" || type === "archive")) rec.date = todayISO();
  formFiles = (rec.files || []).slice();
  const dlg = $("#dlg");
  dlg.innerHTML = `<form method="dialog" id="frm">
    <div class="dlg-head"><h2>${id ? L("تعديل", "Edit") : L("إضافة", "Add")} ${esc(t(sc.one))}</h2><button type="button" class="btn ghost" id="x" aria-label="${L("إغلاق", "Close")}">✕</button></div>
    <div class="dlg-body"><div class="form">${sc.fields.map(f => fieldHTML(f, rec)).join("")}</div>${type === "students" && id ? studentHistory(id) : ""}</div>
    <div class="dlg-foot"><button class="btn primary" type="submit">${L("حفظ", "Save")}</button><button class="btn" type="button" id="cancel">${L("إلغاء", "Cancel")}</button><span class="spacer"></span>${id ? `<button class="btn danger" type="button" id="del">${L("حذف", "Delete")}</button>` : ""}</div></form>`;
  const frm = $("#frm"); const close = () => dlg.close();
  $("#x").onclick = close; $("#cancel").onclick = close;
  if (type === "procedures") bindProcedureFields(frm, rec);
  bindFileField(frm);
  if ($("#del")) $("#del").onclick = () => confirmBox(L("حذف هذا السجل نهائيا مع مرفقاته؟", "Delete this record and its attachments permanently?"), async () => { await deleteItem(type, id); close(); toast(L("تم الحذف", "Deleted")); route(); });
  frm.onsubmit = async e => {
    e.preventDefault();
    const out = Object.assign({}, rec);
    for (const f of sc.fields) {
      if (["steps", "docs", "files"].includes(f.type)) continue;
      const el = frm.elements[f.k]; if (!el) continue;
      out[f.k] = f.type === "bool" ? el.checked : f.type === "number" ? (el.value === "" ? "" : +el.value) : el.value.trim();
    }
    if (type === "procedures") { out.steps = readSteps(frm); out.docsIn = $$("[data-doc]", frm).filter(c => c.checked).map(c => c.dataset.doc); }
    out.files = formFiles;
    const miss = sc.fields.filter(f => f.req && (out[f.k] === "" || out[f.k] == null));
    if (miss.length) { toast(L("حقول إلزامية ناقصة: ", "Required fields missing: ") + miss.map(f => t(f.label)).join(L("، ", ", "))); return; }
    if (type === "mail" && !out.number) out.number = nextMailNumber(out.direction);
    await saveItem(type, out); close(); toast(L("تم الحفظ", "Saved")); route();
  };
  dlg.showModal();
}
function fieldHTML(f, r) {
  const v = r[f.k] ?? ""; const id = `f_${f.k}`;
  const wrap = inner => `<div class="f ${f.wide || ["textarea", "steps", "docs", "files"].includes(f.type) ? "wide" : ""} ${f.req ? "req" : ""}"><label for="${id}">${esc(t(f.label))}</label>${inner}${f.hint ? `<span class="hint">${esc(t(f.hint))}</span>` : ""}</div>`;
  switch (f.type) {
    case "textarea": return wrap(`<textarea id="${id}" name="${f.k}">${esc(v)}</textarea>`);
    case "select": return wrap(`<select id="${id}" name="${f.k}">${(f.options[0] === "" ? [] : [""]).concat(f.options).map(o => `<option value="${esc(o)}" ${o === v ? "selected" : ""}>${esc(t(f.labels?.[o] || o))}</option>`).join("")}</select>`);
    case "ref": { const list = S.data[f.ref].slice().sort((a, b) => String(displayOf(f.ref, a)).localeCompare(String(displayOf(f.ref, b)), "ar"));
      return wrap(`<select id="${id}" name="${f.k}"><option value=""></option>${list.map(o => { let extra = ""; if (f.ref === "supervisors") { const l = supLoad(o.id), m = supMax(o); extra = ` (${l}/${m})${l >= m ? L(" ممتلئ", " full") : ""}`; } return `<option value="${o.id}" ${o.id === v ? "selected" : ""}>${esc(displayOf(f.ref, o))}${extra}</option>`; }).join("")}</select>`); }
    case "bool": return `<div class="f"><label class="check"><input type="checkbox" id="${id}" name="${f.k}" ${v ? "checked" : ""}> ${esc(t(f.label))}</label></div>`;
    case "steps": return wrap(`<div id="stepsBox"></div>`);
    case "docs": return wrap(`<div id="docsBox"></div>`);
    case "files": return wrap(`<div class="files" id="filesBox"></div><input type="file" id="${id}" multiple accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.odt"><span class="hint">${L("مسح ضوئي، صورة بالهاتف، أو ملف PDF/Word. يُحفظ داخل الجهاز.", "Scan, phone photo, or PDF/Word file. Stored on this device.")}</span>`);
    default: return wrap(`<input type="${f.type}" id="${id}" name="${f.k}" value="${esc(v)}" ${f.type === "number" ? 'step="any"' : ""}>`);
  }
}
function studentHistory(id) {
  const P = S.data.procedures.filter(p => p.student === id), Dd = S.data.defenses.filter(d => d.student === id), M = S.data.seminars.filter(s => s.student === id);
  if (!P.length && !Dd.length && !M.length) return "";
  return `<h3 style="margin-top:16px">${L("الملف الكامل للطالب", "Student's full record")}</h3><ul class="alerts">${P.map(p => `<li>${esc(t(PROCEDURES[p.ptype]?.name))} — ${procMeta(p).done}/${procMeta(p).n} ${L("مراحل", "steps")} <span class="num">${fmtDate(p.opened)}</span></li>`).join("")}${M.map(s => `<li>${L("مرافعة", "Seminar")} <span class="num">${fmtDate(s.date)}</span> — ${esc(t(s.attended))} ${s.evaluation ? "· " + esc(t(s.evaluation)) : ""}</li>`).join("")}${Dd.map(d => `<li>${L("مناقشة", "Defense")}: ${esc(t(d.stage))} ${d.defenseDate ? `<span class="num">${fmtDate(d.defenseDate)}</span>` : ""}</li>`).join("")}</ul>`;
}
function bindProcedureFields(frm, rec) {
  const sel = frm.elements.ptype;
  const draw = () => {
    const tpl = PROCEDURES[sel.value];
    if (!tpl) { $("#stepsBox").innerHTML = `<p class="muted small">${L("اختر نوع الإجراء لعرض مراحله.", "Choose a procedure type to show its steps.")}</p>`; $("#docsBox").innerHTML = ""; return; }
    const steps = rec.ptype === sel.value ? rec.steps || [] : [];
    $("#stepsBox").innerHTML = `<ol class="steps">${tpl.steps.map((s, i) => { const st = steps[i] || {}; return `<li class="${st.done ? "done" : ""}"><input type="checkbox" id="st${i}" data-step="${i}" ${st.done ? "checked" : ""}><label for="st${i}">${i + 1}. ${esc(t(s))}</label><input type="date" data-sdate="${i}" value="${esc(st.date || "")}" aria-label="${L("تاريخ المرحلة", "Step date")}"></li>`; }).join("")}</ol><p class="small" id="stepWarn" style="color:var(--warn)"></p>`;
    const have = rec.ptype === sel.value ? rec.docsIn || [] : [];
    $("#docsBox").innerHTML = tpl.docs.map(d => `<label class="check"><input type="checkbox" data-doc="${esc(d)}" ${have.includes(d) ? "checked" : ""}> ${esc(t(d))}</label>`).join("");
    if (!frm.elements.due.value && frm.elements.opened.value) frm.elements.due.value = addDays(frm.elements.opened.value, tpl.days);
    $$("[data-step]", frm).forEach(c => c.onchange = () => { c.closest("li").classList.toggle("done", c.checked); const d = $(`[data-sdate="${c.dataset.step}"]`, frm); if (c.checked && !d.value) d.value = todayISO(); checkOrder(frm, tpl); });
    checkOrder(frm, tpl);
  };
  sel.onchange = () => { frm.elements.due.value = ""; draw(); };
  const stSel = frm.elements.student;
  stSel.onchange = () => { if (!frm.elements.subject.value && stSel.value) frm.elements.subject.value = nameOf("students", stSel.value); };
  draw();
}
function checkOrder(frm, tpl) {
  const st = $$("[data-step]", frm).map(c => c.checked); const w = [];
  st.forEach((d, i) => { if (d && st.slice(0, i).some(x => !x)) w.push(i + 1); });
  const ci = tpl.steps.findIndex(s => s.includes("المجلس العلمي")); const li = tpl.steps.findIndex(s => s.includes("اللجنة العلمية للقسم"));
  let msg = w.length ? L(`تنبيه: المراحل ${w.join("، ")} مؤشرة قبل استكمال مراحل سابقة.`, `Note: step(s) ${w.join(", ")} ticked before earlier steps were completed.`) : "";
  if (ci >= 0 && li >= 0 && st[ci] && !st[li]) msg += " " + t("لا تُمرِّر أي ملف إلى المجلس العلمي دون مستخرج محضر اللجنة العلمية للقسم.");
  $("#stepWarn").textContent = msg;
}
const readSteps = frm => $$("[data-step]", frm).map(c => ({ done: c.checked, date: $(`[data-sdate="${c.dataset.step}"]`, frm).value }));

function bindFileField(frm) {
  const box = $("#filesBox"); if (!box) return;
  const draw = () => {
    box.innerHTML = formFiles.map((f, i) => `<div class="file"><span class="ext-s">${esc(fileExt(f.name))}</span><span style="flex:1;min-width:0;overflow-wrap:anywhere">${esc(f.name)}</span><span class="muted num">${Math.ceil(f.size / 1024)} KB</span><button type="button" class="btn sm" data-open="${f.id}">${L("عرض", "View")}</button><button type="button" class="btn sm danger" data-rm="${i}">${L("إزالة", "Remove")}</button></div>`).join("") || `<span class="muted small">${L("لا توجد مرفقات.", "No attachments.")}</span>`;
    $$("[data-open]", box).forEach(b => b.onclick = () => openViewer(b.dataset.open));
    $$("[data-rm]", box).forEach(b => b.onclick = async () => { const [f] = formFiles.splice(+b.dataset.rm, 1); await DB.del("blobs", f.id); draw(); });
  };
  $("input[type=file]", frm).onchange = async e => {
    for (const file of e.target.files) formFiles.push(await storeFile(file));
    e.target.value = ""; draw();
  };
  draw();
}
function confirmBox(msg, onYes) {
  const d = $("#dlg2");
  d.innerHTML = `<div class="dlg-body"><p>${esc(msg)}</p></div><div class="dlg-foot"><button class="btn danger" id="cy">${L("تأكيد", "Confirm")}</button><button class="btn" id="cn">${L("إلغاء", "Cancel")}</button></div>`;
  $("#cy").onclick = () => { d.close(); onYes(); }; $("#cn").onclick = () => d.close(); d.showModal();
}

/* ================= الوثائق القابلة للطباعة ================= */
const TEMPLATES = {
  depot: { ar: "طلب إيداع أطروحة للمناقشة", en: "Thesis submission request", src: "defenses" },
  extension: { ar: "طلب تمديد استثنائي", en: "Exceptional extension request", src: "students" },
  supReport: { ar: "تقرير المشرف بالموافقة على المناقشة", en: "Supervisor's approval report", src: "students" },
  reporter: { ar: "مراسلة إرسال أطروحة إلى مقرر", en: "Letter to a thesis reviewer", src: "defenses" },
  announce: { ar: "إعلان عن مناقشة أطروحة", en: "Thesis defense notice", src: "defenses" },
  defenseMinutes: { ar: "محضر مناقشة أطروحة دكتوراه", en: "Doctoral defense minutes", src: "defenses" },
  studentCard: { ar: "بطاقة متابعة طالب دكتوراه", en: "Doctoral student record card", src: "students" },
  councilMinutes: { ar: "محضر اجتماع اللجنة العلمية للقسم", en: "Scientific Committee meeting minutes", src: "council" },
  extract: { ar: "مستخرج من محضر اللجنة العلمية", en: "Scientific Committee minutes extract", src: "council" },
  letter: { ar: "مراسلة إدارية", en: "Administrative letter", src: "mail" },
  stageCard: { ar: "بطاقة تربص بالخارج", en: "Training abroad sheet", src: "stages" },
  eventCard: { ar: "بطاقة تظاهرة علمية", en: "Scientific event sheet", src: "events" },
  list: { ar: "قائمة من سجل", en: "Register list", src: null },
  program: { ar: "البرنامج السنوي للمصلحة", en: "Annual programme of the office", src: null },
  annual: { ar: "الحصيلة السنوية للمصلحة", en: "Annual activity report", src: null }
};
const blank = (n = 30) => `<span contenteditable="true" class="blank">${"&nbsp;.".repeat(n)}</span>`;
const ed = v => (v || v === 0) ? `<b contenteditable="true">${esc(v)}</b>` : blank(18);
function docHeader(ref = "") {
  const s = S.settings;
  return `<div class="bh">
    <div class="bh-rep"><div>${esc(s.republic)}</div><div class="lat">${esc(s.republicEn)}</div></div>
    <div class="bh-cols" dir="rtl">
      <div class="bh-ar">${esc(s.ministry)}<br>${esc(s.university)}<br>${esc(s.faculty)}<br>${esc(s.department)}</div>
      <div class="bh-logo">${s.logo ? `<img src="${s.logo}" alt="">` : ""}</div>
      <div class="bh-en" dir="ltr">${esc(s.ministryEn)}<br>${esc(s.universityEn)}<br>${esc(s.facultyEn)}<br>${esc(s.departmentEn)}</div>
    </div></div>
  <div class="hdr-row"><span contenteditable="true">${D("الرقم", "Ref.")}: ${esc(ref) || "......../" + new Date().getFullYear()}</span><span contenteditable="true">${D(`${esc(s.city)} في: `, `${esc(s.cityEn)}, `)}${fmtDate(todayISO())}</span></div>`;
}
const sig = (r = D("رئيس القسم", "Head of Department"), l = D("رئيس القسم المساعد لما بعد التدرج", "Assistant Head for Postgraduate Studies")) => `<div class="sig"><span contenteditable="true">${l}</span><span contenteditable="true">${r}</span></div>`;
const kv = rows => `<table class="kv">${rows.map(([a, b, h]) => `<tr><th>${a}</th><td contenteditable="true" ${h ? `style="height:${h}px"` : ""}>${esc(b ?? "")}</td></tr>`).join("")}</table>`;
const juryRows = j => (lines(j).length ? lines(j) : ["", "", "", ""]).map(l => l.split(/\s*-\s*/));

function renderTemplate(key, r) {
  const s = S.settings; const T = TEMPLATES[key];
  const st = r && T.src === "students" ? r : r?.student ? byId("students", r.student) : null;
  const sup = st ? byId("supervisors", st.supervisor) : null;
  const yr = st?.firstYear ? acadLabel(+st.firstYear) : "";
  const juryHead = `<tr><th>${D("الاسم واللقب", "Name")}</th><th>${D("الرتبة", "Rank")}</th><th>${D("المؤسسة", "Institution")}</th><th>${D("الصفة", "Role")}</th>`;
  switch (key) {
    case "depot": return `${docHeader()}<h1>${D("طلب إيداع أطروحة دكتوراه للمناقشة", "Request to Submit a Doctoral Thesis for Defense")}</h1>
      <p>${D(`أنا الممضي(ة) أسفله: ${ed(st?.name)}، المسجل(ة) في ${ed(td(st?.track))} تخصص ${ed(st?.specialty)}، سنة أول تسجيل ${ed(yr)}، رقم التسجيل ${ed(st?.regNo)}.`, `I, the undersigned ${ed(st?.name)}, registered in the ${ed(td(st?.track))} programme, specialty ${ed(st?.specialty)}, first registered in ${ed(yr)}, registration no. ${ed(st?.regNo)},`)}</p>
      <p>${D(`تحت إشراف: ${ed(sup?.name)} (${ed(td(sup?.rank))}).`, `under the supervision of ${ed(sup?.name)} (${ed(td(sup?.rank))}),`)}</p>
      <p>${D(`أتشرف بطلب إيداع أطروحتي الموسومة بـ: ${ed(r?.title || st?.topic)}`, `hereby request to submit my thesis entitled: ${ed(r?.title || st?.topic)}`)}</p>
      <p>${D(`قصد عرضها على اللجنة العلمية للقسم لاقتراح لجنة المناقشة، طبقا لأحكام ${esc(st ? applicableText(st, D) : "النص المطبق")}.`, `for presentation to the Department Scientific Committee to propose a defense jury, in accordance with ${esc(st ? applicableText(st, D) : "the applicable regulation")}.`)}</p>
      <p><b>${D("الوثائق المرفقة:", "Attached documents:")}</b></p><ul>${PROCEDURES.depot.docs.map(d => `<li contenteditable="true">${esc(td(d))}</li>`).join("")}</ul>
      <div class="sig"><span>${D("رأي المشرف وتوقيعه", "Supervisor's opinion and signature")}</span><span>${D("إمضاء الطالب(ة)", "Student's signature")}</span></div>`;
    case "extension": return `${docHeader()}<h1>${D("طلب تمديد استثنائي", "Request for an Exceptional Extension")}</h1>
      <p>${D(`أنا الممضي(ة) أسفله: ${ed(st?.name)}، طالب(ة) دكتوراه تخصص ${ed(st?.specialty)}، سنة أول تسجيل ${ed(st?.firstYear)}، وأنا حاليا في السنة ${ed(st && studyYear(st))} من التكوين.`, `I, the undersigned ${ed(st?.name)}, doctoral student in ${ed(st?.specialty)}, first registered in ${ed(st?.firstYear)}, currently in year ${ed(st && studyYear(st))} of training,`)}</p>
      <p>${D("موضوع الأطروحة:", "Thesis topic:")} ${ed(st?.topic)}</p>
      <p>${D(`أتشرف بطلب الاستفادة من تمديد استثنائي للسنة الجامعية ${acadLabel(acadStart())}، وذلك للأسباب الآتية:`, `request an exceptional extension for the academic year ${acadLabel(acadStart())} for the following reasons:`)}</p><p>${blank(60)}</p>
      <p>${D(`نسبة تقدم الأشغال: ${blank(8)} %. مرفق بتقرير عن تقدم الأشغال.`, `Progress of work: ${blank(8)} %. A progress report is attached.`)}</p>
      <table><tr><th>${D("رأي المشرف", "Supervisor's opinion")}</th><th>${D("رأي لجنة التكوين", "Training committee opinion")}</th><th>${D("رأي اللجنة العلمية للقسم", "Scientific Committee opinion")}</th></tr><tr><td style="height:90px"></td><td></td><td></td></tr></table>
      <div class="sig"><span></span><span>${D("إمضاء الطالب(ة)", "Student's signature")}</span></div>`;
    case "supReport": return `${docHeader()}<h1>${D("تقرير المشرف حول الأطروحة", "Supervisor's Report on the Thesis")}</h1>
      <p>${D(`أنا الممضي(ة) أسفله ${ed(sup?.name)}، ${ed(td(sup?.rank))}، المشرف(ة) على أطروحة الطالب(ة) ${ed(st?.name)} الموسومة بـ: ${ed(st?.topic)}`, `I, the undersigned ${ed(sup?.name)}, ${ed(td(sup?.rank))}, supervisor of the thesis by ${ed(st?.name)} entitled: ${ed(st?.topic)}`)}</p>
      <p><b>${D("تقييم العمل:", "Assessment of the work:")}</b></p><p>${blank(80)}</p><p><b>${D("النشر العلمي والمداخلات:", "Publications and conference papers:")}</b></p><p>${blank(60)}</p>
      <p>${D("وعليه أوافق على إيداع الأطروحة قصد مناقشتها، وأقترح أعضاء لجنة المناقشة الآتية أسماؤهم:", "I therefore approve the submission of the thesis for defense and propose the following jury:")}</p>
      <table>${juryHead}</tr>${[["رئيسا", "President"], ["مشرفا ومقررا", "Supervisor & rapporteur"], ["ممتحنا", "Examiner"], ["ممتحنا", "Examiner"], ["ممتحنا", "Examiner"], ["ممتحنا", "Examiner"]].map(([a, e]) => `<tr><td contenteditable="true"></td><td contenteditable="true"></td><td contenteditable="true"></td><td>${D(a, e)}</td></tr>`).join("")}</table>
      <div class="sig"><span></span><span>${D("المشرف", "Supervisor")}</span></div>`;
    case "reporter": return `${docHeader()}<p>${D("إلى السيد(ة) الأستاذ(ة):", "To Professor:")} ${blank(25)}</p><p>${blank(25)}</p>
      <p><b>${D("الموضوع:", "Subject:")}</b> ${D("إرسال أطروحة دكتوراه للخبرة.", "Doctoral thesis for review.")}</p>
      <p>${D(`تحية طيبة وبعد، يشرفني أن أرسل إليكم نسخة من أطروحة الدكتوراه للطالب(ة) ${ed(st?.name)} الموسومة بـ: ${ed(r?.title || st?.topic)}، تحت إشراف ${ed(sup?.name)}، وذلك بعد مصادقة المجلس العلمي للكلية ${r?.csfDate ? "بتاريخ " + fmtDate(r.csfDate) : ""} على تعيينكم عضوا في لجنة المناقشة.`, `Dear Colleague, please find enclosed a copy of the doctoral thesis by ${ed(st?.name)}, entitled ${ed(r?.title || st?.topic)}, supervised by ${ed(sup?.name)}, following the Faculty Scientific Council's approval ${r?.csfDate ? "on " + fmtDate(r.csfDate) : ""} of your appointment to the defense jury.`)}</p>
      <p>${D(`نرجو منكم التكرم بإرسال تقريركم في أجل أقصاه ${ed(fmtDate(r?.reportsDue))}.`, `We kindly ask you to send your report no later than ${ed(fmtDate(r?.reportsDue))}.`)}</p><p>${D("تقبلوا منا فائق التقدير والاحترام.", "Yours sincerely,")}</p>${sig(D("رئيس القسم", "Head of Department"), "")}`;
    case "announce": return `${docHeader()}<h1>${D("إعلان عن مناقشة أطروحة دكتوراه", "Notice of Doctoral Thesis Defense")}</h1>
      <p class="c">${D(`يعلن ${esc(s.department)} عن مناقشة أطروحة الدكتوراه للطالب(ة):`, `The ${esc(s.departmentEn)} announces the doctoral thesis defense of:`)}</p><p class="c big"><b>${ed(st?.name)}</b></p>
      <p class="c">${D("الموسومة بـ:", "entitled:")} ${ed(r?.title || st?.topic)}</p>
      <p class="c">${D(`وذلك يوم ${ed(fmtDate(r?.defenseDate))} بـ ${ed(r?.room)}، أمام لجنة المناقشة المكونة من:`, `on ${ed(fmtDate(r?.defenseDate))} in ${ed(r?.room)}, before the jury composed of:`)}</p>
      <table>${juryHead}</tr>${juryRows(r?.jury).map(c => `<tr>${[0, 1, 2, 3].map(i => `<td contenteditable="true">${esc(c[i] || "")}</td>`).join("")}</tr>`).join("")}</table>
      <p class="c" style="margin-top:20px">${D("المناقشة علنية ومفتوحة للجميع.", "The defense is public and open to all.")}</p>${sig(D("رئيس القسم", "Head of Department"), "")}`;
    case "defenseMinutes": return `${docHeader()}<h1>${D("محضر مناقشة أطروحة دكتوراه", "Minutes of Doctoral Thesis Defense")}</h1>
      <p>${D(`في يوم ${ed(fmtDate(r?.defenseDate))}، وعلى الساعة ${blank(6)}، اجتمعت بـ ${ed(r?.room)} لجنة المناقشة المعيّنة بموجب مستخرج محضر المجلس العلمي للكلية ${r?.csfDate ? "المؤرخ في " + fmtDate(r.csfDate) : ""}، والمكونة من:`, `On ${ed(fmtDate(r?.defenseDate))} at ${blank(6)}, the defense jury appointed by the Faculty Scientific Council ${r?.csfDate ? "on " + fmtDate(r.csfDate) : ""} met in ${ed(r?.room)}. The jury was composed of:`)}</p>
      <table>${juryHead}<th>${D("الإمضاء", "Signature")}</th></tr>${juryRows(r?.jury).map(c => `<tr>${[0, 1, 2, 3].map(i => `<td contenteditable="true">${esc(c[i] || "")}</td>`).join("")}<td></td></tr>`).join("")}</table>
      <p>${D(`وذلك لمناقشة أطروحة الدكتوراه للطالب(ة) ${ed(st?.name)}، تخصص ${ed(st?.specialty)}، الموسومة بـ: ${ed(r?.title || st?.topic)}، تحت إشراف ${ed(sup?.name)}.`, `to examine the doctoral thesis of ${ed(st?.name)}, specialty ${ed(st?.specialty)}, entitled ${ed(r?.title || st?.topic)}, supervised by ${ed(sup?.name)}.`)}</p>
      <p>${D("بعد عرض المترشح(ة) لأعماله ومناقشتها، اختلت اللجنة للمداولة، وقررت:", "After the candidate's presentation and the discussion, the jury deliberated in private and decided:")}</p>
      <p>${D(`منح المترشح(ة) شهادة ${ed(td(st?.track))} بتقدير: ${ed(td(r?.result))}`, `to award the candidate the degree of ${ed(td(st?.track))} with the distinction: ${ed(td(r?.result))}`)}</p>
      <p><b>${D("ملاحظات وتحفظات اللجنة:", "Jury remarks and reservations:")}</b></p><p>${blank(70)}</p>
      <div class="sig"><span>${D("المشرف", "Supervisor")}</span><span>${D("رئيس اللجنة", "Jury President")}</span></div>`;
    case "councilMinutes": return `${docHeader(r?.number)}<h1>${D("محضر اجتماع اللجنة العلمية للقسم", "Minutes of the Department Scientific Committee")}</h1>
      <p>${D(`في يوم ${ed(fmtDate(r?.date))}، انعقدت الدورة ${ed(td(r?.kind))} رقم ${ed(r?.number)} للجنة العلمية لـ${esc(s.department)}، برئاسة ${ed(r?.president)}.`, `On ${ed(fmtDate(r?.date))}, the ${ed(td(r?.kind))} session no. ${ed(r?.number)} of the Scientific Committee of the ${esc(s.departmentEn)} was held, chaired by ${ed(r?.president)}.`)}</p>
      <h3>${D("الحاضرون", "Present")}</h3><table><tr><th>#</th><th>${D("الاسم واللقب", "Name")}</th><th>${D("الإمضاء", "Signature")}</th></tr>${(lines(r?.attendees).length ? lines(r.attendees) : ["", "", ""]).map((a, i) => `<tr><td>${i + 1}</td><td contenteditable="true">${esc(a)}</td><td></td></tr>`).join("")}</table>
      <p><b>${D("الغائبون:", "Absent:")}</b> ${lines(r?.absent).map(esc).join(D("، ", ", ")) || blank(30)}</p>
      <h3>${D("جدول الأعمال", "Agenda")}</h3><ol>${(lines(r?.agenda).length ? lines(r.agenda) : [""]).map(a => `<li contenteditable="true">${esc(a)}</li>`).join("")}</ol>
      <h3>${D("القرارات", "Decisions")}</h3><ol>${(lines(r?.decisions).length ? lines(r.decisions) : [""]).map(a => `<li contenteditable="true">${esc(a)}</li>`).join("")}</ol>
      <p>${D("رُفعت الجلسة على الساعة", "The meeting closed at")} ${blank(8)}.</p>${sig(D("رئيس اللجنة العلمية للقسم", "Chair of the Scientific Committee"), D("كاتب الجلسة", "Secretary"))}`;
    case "extract": return `${docHeader(r?.number)}<h1>${D("مستخرج من محضر اجتماع اللجنة العلمية للقسم", "Extract from the Scientific Committee Minutes")}</h1>
      <p>${D(`اجتمعت اللجنة العلمية لـ${esc(s.department)} في دورة ${ed(td(r?.kind))} رقم ${ed(r?.number)} بتاريخ ${ed(fmtDate(r?.date))}، وبعد دراسة النقاط المدرجة في جدول الأعمال، قررت ما يلي:`, `The Scientific Committee of the ${esc(s.departmentEn)} met in ${ed(td(r?.kind))} session no. ${ed(r?.number)} on ${ed(fmtDate(r?.date))} and, having examined the agenda, decided as follows:`)}</p>
      <ol>${(lines(r?.decisions).length ? lines(r.decisions) : [""]).map(d => `<li contenteditable="true">${esc(d)}</li>`).join("")}</ol>
      <p>${D("سلم هذا المستخرج للعمل به في حدود ما يسمح به القانون.", "This extract is issued for whatever legal purpose it may serve.")}</p>${sig(D("رئيس اللجنة العلمية للقسم", "Chair of the Scientific Committee"), "")}`;
    case "stageCard": return `${docHeader()}<h1>${D("بطاقة تربص بالخارج", "Training Abroad Sheet")}</h1>${kv([[D("المستفيد", "Beneficiary"), r?.person], [D("الفئة", "Category"), td(r?.category)], [D("البرنامج", "Programme"), td(r?.program)], [D("الدورة", "Round"), r?.session], [D("البلد", "Country"), r?.country], [D("مؤسسة الاستقبال", "Host institution"), r?.host], [D("تاريخ الانطلاق", "Departure"), fmtDate(r?.start)], [D("المدة", "Duration"), r?.days ? r.days + D(" يوما", " days") : ""], [D("التنقيط", "Score"), r?.score], [D("عدد الاستفادات السابقة", "Previous awards"), r ? pastAwards(r) : ""], [D("برنامج العمل", "Work plan"), "", 100], [D("رأي المشرف / رئيس الفرقة", "Supervisor / team leader opinion"), "", 60]])}${sig()}`;
    case "eventCard": return `${docHeader()}<h1>${D("بطاقة تقنية لتظاهرة علمية", "Scientific Event Technical Sheet")}</h1>${kv([[D("عنوان التظاهرة", "Title"), r?.title], [D("النوع", "Type"), td(r?.kind)], [D("التاريخ", "Date"), fmtDate(r?.date)], [D("رئيس التظاهرة", "Chair"), r?.coordinator], [D("الشركاء", "Partners"), r?.partners], [D("عدد المشاركين المتوقع", "Expected participants"), r?.participants], ...[["الإشكالية والأهداف", "Rationale and objectives"], ["المحاور", "Themes"], ["اللجنة العلمية", "Scientific committee"], ["اللجنة التنظيمية", "Organising committee"], ["الميزانية التقديرية", "Estimated budget"]].map(([a, e]) => [D(a, e), "", 70])])}${sig()}`;
    case "studentCard": return `${docHeader()}<h1>${D("بطاقة متابعة طالب دكتوراه", "Doctoral Student Record Card")}</h1>${kv([[D("الاسم واللقب", "Full name"), st?.name], [D("رقم التسجيل", "Registration no."), st?.regNo], [D("نوع التكوين", "Programme"), td(st?.track)], [D("التخصص", "Specialty"), st?.specialty], [D("سنة أول تسجيل", "First registration"), st?.firstYear], [D("سنة التكوين الحالية", "Current year"), st ? studyYear(st) : ""], [D("النص المطبق", "Applicable regulation"), st ? applicableText(st, D) : ""], [D("المشرف", "Supervisor"), sup?.name], [D("المشرف المساعد", "Co-supervisor"), nameOf("supervisors", st?.coSupervisor)], [D("مخبر الاستقبال", "Host lab"), st?.lab], [D("الموضوع", "Topic"), st?.topic], [D("الوضعية", "Status"), td(st?.status)], [D("ميثاق الأطروحة", "Thesis charter"), st ? (st.charter ? D("موقع", "Signed") : D("غير موقع", "Not signed")) : ""], [D("التكوين المرافق", "Complementary training"), st?.training ? st.training + D(" ساعة", " h") : ""]])}
      <h3>${D("المرافعات الدورية", "Progress seminars")}</h3><table><tr><th>${D("التاريخ", "Date")}</th><th>${D("الحضور", "Attendance")}</th><th>${D("التقدم", "Progress")}</th><th>${D("التقييم", "Evaluation")}</th></tr>${S.data.seminars.filter(x => x.student === st?.id).map(x => `<tr><td>${fmtDate(x.date)}</td><td>${esc(td(x.attended))}</td><td>${esc(x.progress ?? "")}%</td><td>${esc(td(x.evaluation ?? ""))}</td></tr>`).join("") || `<tr><td colspan="4">—</td></tr>`}</table>`;
    case "letter": return `${docHeader(r?.number)}<p>${D("إلى:", "To:")} ${ed(r?.party)}</p><p><b>${D("الموضوع:", "Subject:")}</b> ${ed(r?.subject)}</p>${r?.ref ? `<p><b>${D("المرجع:", "Reference:")}</b> ${esc(r.ref)}</p>` : ""}<p>${D("تحية طيبة وبعد،", "Dear Sir/Madam,")}</p><p>${blank(90)}</p><p>${D("تقبلوا منا فائق التقدير والاحترام.", "Yours faithfully,")}</p>${sig(D("رئيس القسم", "Head of Department"), "")}`;
    case "list": return listDoc();
    case "program": return programDoc();
    case "annual": return annualReport();
  }
}
function listDoc() {
  const type = S.filters.listType && SCHEMAS[S.filters.listType] ? S.filters.listType : "students"; const sc = SCHEMAS[type];
  const ids = S.filters.listIds; const rows = ids ? ids.map(id => byId(type, id)).filter(Boolean) : filteredRows(type);
  const cols = sc.fields.filter(f => f.list);
  const plain = h => h.replace(/<[^>]+>/g, "");
  return `${docHeader()}<h1>${esc(td(sc.title))}</h1><p class="c small">${D("السنة الجامعية", "Academic year")} ${acadLabel(acadStart())} · ${D("العدد", "Total")}: ${rows.length}</p>
    <table class="list"><thead><tr><th>#</th>${cols.map(f => `<th>${esc(td(f.label))}</th>`).join("")}</tr></thead><tbody>${rows.map((r, i) => `<tr><td>${i + 1}</td>${cols.map(f => `<td>${plain(cellValue(f, r, td))}</td>`).join("")}</tr>`).join("")}</tbody></table>${sig()}`;
}
function programDoc() {
  const y = S.filters.progYear ?? acadStart(); const plan = planFor(y);
  const cell = (mo, ax) => mo.tasks.filter(x => (ax === "gen" ? !["pg", "re"].includes(x.axis) : x.axis === ax)).map(x => esc(td(x.text)) + (x.date ? ` <small>(${fmtDate(x.date)})</small>` : "")).join("<br>") || "—";
  const gen = plan.months.some(mo => mo.tasks.some(x => !["pg", "re"].includes(x.axis)));
  const rec = Object.entries(plan.recurring).filter(([, arr]) => arr.length);
  return `${docHeader()}<h1>${D("البرنامج السنوي لمصلحة ما بعد التدرج والعلاقات الخارجية", "Annual Programme — Postgraduate Studies & External Relations")}<br><small>${acadLabel(y)}</small></h1>
    <table class="list"><thead><tr><th>${D("الشهر", "Month")}</th><th>${D("ما بعد التدرج والبحث", "Postgraduate & research")}</th><th>${D("العلاقات الخارجية والتظاهرات", "External relations & events")}</th>${gen ? `<th>${D("مهام عامة", "General")}</th>` : ""}<th>${D("المخرج المنتظر", "Expected output")}</th></tr></thead><tbody>${plan.months.map(mo => `<tr><td><b>${esc(td(PROGRAM.find(p => p.m === mo.m).name))}</b></td><td>${cell(mo, "pg")}</td><td>${cell(mo, "re")}</td>${gen ? `<td>${cell(mo, "gen")}</td>` : ""}<td>${esc(td(mo.out)) || "—"}</td></tr>`).join("")}</tbody></table>
    ${rec.length ? `<h3>${D("مهام دورية", "Recurring tasks")}</h3><table><tbody>${rec.map(([p, arr]) => `<tr><th style="width:20%">${esc(td(p))}</th><td>${arr.map(x => esc(td(x.text))).join("<br>")}</td></tr>`).join("")}</tbody></table>` : ""}${sig()}`;
}
function annualReport() {
  const y = acadStart(); const K = computeKPIs(y, D); const cnt = (arr, f) => arr.filter(f).length;
  const yrPub = p => +p.year === y || +p.year === y + 1;
  const granted = cnt(S.data.stages, x => ["ممنوح", "منجز"].includes(x.state) && (+x.session === y || +x.session === y + 1));
  const held = cnt(S.data.events, e => e.state === "منجزة" && inAcad(e.date, y)); const inForce = cnt(S.data.agreements, a => agrMeta(a).valid);
  return `${docHeader()}<h1>${D("الحصيلة السنوية لمصلحة ما بعد التدرج والبحث العلمي والعلاقات الخارجية", "Annual Report — Postgraduate Studies, Research & External Relations")}<br><small>${D("السنة الجامعية", "Academic year")} ${acadLabel(y)}</small></h1>
  <h3>${D("1. التكوين في الطور الثالث", "1. Doctoral training")}</h3><table><tr><th>${D("البيان", "Item")}</th><th>${D("العدد", "Count")}</th></tr>
    ${[[D("طلبة في طور التكوين", "Students in training"), cnt(S.data.students, x => !closed(x))], [D("مسجلون جدد", "New registrations"), cnt(S.data.students, x => +x.firstYear === y)], [D("ممددون", "Extended"), cnt(S.data.students, x => x.status === "ممدد")], [D("مجمدون", "Suspended"), cnt(S.data.students, x => x.status === "مجمد")], [D("مواثيق موقعة", "Signed charters"), cnt(S.data.students, x => x.charter)], [D("مرافعات منظمة", "Progress seminars held"), cnt(S.data.seminars, x => inAcad(x.date, y))]].map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join("")}</table>
  <h3>${D("2. المناقشات", "2. Defenses")}</h3><table><tr><th>${D("الطالب", "Student")}</th><th>${D("التاريخ", "Date")}</th><th>${D("النتيجة", "Result")}</th></tr>${S.data.defenses.filter(d => d.stage === "نوقشت" && inAcad(d.defenseDate, y)).map(d => `<tr><td>${esc(nameOf("students", d.student))}</td><td>${fmtDate(d.defenseDate)}</td><td>${esc(td(d.result || ""))}</td></tr>`).join("") || `<tr><td colspan="3">—</td></tr>`}</table>
  <h3>${D("3. البحث العلمي", "3. Research")}</h3><p>${D(`مشاريع ومخابر: ${S.data.research.length} · منشورات السنة: ${cnt(S.data.production, yrPub)} منها ${cnt(S.data.production, p => p.rank && yrPub(p))} في مجلات مصنفة.`, `Projects and labs: ${S.data.research.length} · Publications this year: ${cnt(S.data.production, yrPub)}, of which ${cnt(S.data.production, p => p.rank && yrPub(p))} in ranked journals.`)}</p>
  <h3>${D("4. العلاقات الخارجية", "4. External relations")}</h3><p>${D(`اتفاقيات سارية: ${inForce} · تربصات ممنوحة: ${granted} · تظاهرات منجزة: ${held}.`, `Agreements in force: ${inForce} · Training stays granted: ${granted} · Events held: ${held}.`)}</p>
  <h3>${D("5. مؤشرات الأداء", "5. Performance indicators")}</h3><table><tr><th>${D("المؤشر", "Indicator")}</th><th>${D("القيمة", "Value")}</th><th>${D("المستهدف", "Target")}</th></tr>${K.map(k => `<tr><td>${k.l}</td><td>${k.v ?? "—"}${k.v != null ? k.u : ""}</td><td>${k.t ?? ""}${k.t !== "" ? k.u : ""}</td></tr>`).join("")}</table>
  <h3>${D("6. صعوبات واقتراحات", "6. Difficulties and proposals")}</h3><p>${blank(80)}</p>${sig(D("رئيس القسم", "Head of Department"), S.settings.assistant || D("رئيس القسم المساعد", "Assistant Head"))}`;
}
function viewForms() {
  setTitle(L("النماذج والمراسلات", "Forms & letters"), L("كل وثيقة تحمل ترويسة عربية وإنجليزية، وتُملأ آليا من السجلات وتُعدَّل مباشرة قبل الطباعة", "Every document carries an Arabic and English header, is filled from the registers and can be edited before printing"));
  const key = S.filters.tpl && TEMPLATES[S.filters.tpl] ? S.filters.tpl : "depot"; const T = TEMPLATES[key];
  DOC_EN = (S.settings.docLang || S.settings.lang) === "en";
  const recs = T.src ? S.data[T.src] : [];
  const recId = S.filters.tplRec === "__none" ? "" : S.filters.tplRec && byId(T.src, S.filters.tplRec) ? S.filters.tplRec : recs[0]?.id || "";
  const rec = T.src ? byId(T.src, recId) : null;
  const groups = [[L("الدكتوراه والمناقشات", "Doctorate & defenses"), ["depot", "extension", "supReport", "reporter", "announce", "defenseMinutes", "studentCard"]], [L("المحاضر والمراسلات", "Minutes & letters"), ["councilMinutes", "extract", "letter"]], [L("العلاقات الخارجية", "External relations"), ["stageCard", "eventCard"]], [L("القوائم والتقارير", "Lists & reports"), ["list", "program", "annual"]]];
  $("#view").innerHTML = `<div class="toolbar no-print">
      <select id="tk" aria-label="${L("الوثيقة", "Document")}">${groups.map(([g, ks]) => `<optgroup label="${esc(g)}">${ks.map(k => `<option value="${k}" ${k === key ? "selected" : ""}>${esc(L(TEMPLATES[k].ar, TEMPLATES[k].en))}</option>`).join("")}</optgroup>`).join("")}</select>
      ${key === "list" ? `<select id="tl" aria-label="${L("السجل", "Register")}">${Object.keys(SCHEMAS).map(k => `<option value="${k}" ${k === (S.filters.listType || "students") ? "selected" : ""}>${esc(t(SCHEMAS[k].title))}</option>`).join("")}</select>${S.filters.listIds ? `<span class="chip ink">${L("حسب التصفية الحالية", "Current filter")}</span>` : ""}` : ""}
      ${key === "program" ? `<select id="tyear" aria-label="${L("السنة الجامعية", "Academic year")}">${[...new Set([-2, -1, 0, 1, 2, 3].map(d => acadStart() + d).concat(Object.keys(S.plans).map(Number)))].sort((a, b) => a - b).map(v => `<option value="${v}" ${v === (S.filters.progYear ?? acadStart()) ? "selected" : ""}>${acadLabel(v)}${S.plans[v] ? " ●" : ""}</option>`).join("")}</select>` : ""}
      ${T.src ? `<select id="tr" aria-label="${L("السجل المصدر", "Source record")}"><option value="">${L("— نموذج فارغ —", "— blank form —")}</option>${recs.map(r => `<option value="${r.id}" ${r.id === recId ? "selected" : ""}>${esc(displayOf(T.src, r))}</option>`).join("")}</select>` : ""}
      <div class="seg" role="group" aria-label="${L("لغة الوثيقة", "Document language")}"><button data-dl="ar" class="${!DOC_EN ? "on" : ""}">عربية</button><button data-dl="en" class="${DOC_EN ? "on" : ""}">English</button></div>
      <span class="spacer"></span>
      <button class="btn" id="dword">${L("تنزيل Word", "Download Word")}</button><button class="btn primary" id="pr">${L("طباعة / حفظ PDF", "Print / save PDF")}</button></div>
    <p class="small muted no-print">${L("انقر على أي نص منقط أو مُعبَّأ لتعديله مباشرة. بيانات الترويسة والشعار من صفحة الإعدادات.", "Click any dotted or filled text to edit it. Header details and logo come from Settings.")}</p>
    <div class="doc-wrap"><div class="doc" id="doc" dir="${DOC_EN ? "ltr" : "rtl"}" lang="${DOC_EN ? "en" : "ar"}">${renderTemplate(key, rec)}</div></div>`;
  $("#tk").onchange = e => { S.filters.tpl = e.target.value; S.filters.tplRec = ""; viewForms(); };
  if ($("#tl")) $("#tl").onchange = e => { S.filters.listType = e.target.value; S.filters.listIds = null; viewForms(); };
  if ($("#tyear")) $("#tyear").onchange = e => { S.filters.progYear = +e.target.value; viewForms(); };
  if ($("#tr")) $("#tr").onchange = e => { S.filters.tplRec = e.target.value || "__none"; viewForms(); };
  $$("[data-dl]").forEach(b => b.onclick = async () => { S.settings.docLang = b.dataset.dl; await saveSettings(); viewForms(); });
  $("#pr").onclick = () => window.print();
  $("#dword").onclick = () => {
    const dir = DOC_EN ? "ltr" : "rtl";
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><style>body{direction:${dir};font-family:'Times New Roman','Traditional Arabic';font-size:14pt}.bh-rep{text-align:center;font-weight:bold}h1{text-align:center;font-size:17pt}table{border-collapse:collapse;width:100%}td,th{border:1px solid #333;padding:4px}.c{text-align:center}</style></head><body dir="${dir}">${wordify($("#doc").innerHTML)}</body></html>`;
    download(new Blob(["﻿" + html], { type: "application/msword" }), `${key}-${todayISO()}.doc`);
  };
}
/* Word لا يدعم flex: تُحوَّل الترويسة والتوقيعات إلى جداول بلا حدود */
function wordify(h) {
  const d = document.createElement("div"); d.innerHTML = h;
  $$(".bh-cols", d).forEach(c => { const [a, l, e] = c.children; c.outerHTML = `<table dir="rtl" style="border:0"><tr><td style="border:0;text-align:right;width:42%"><b>${a.innerHTML}</b></td><td style="border:0;width:16%;text-align:center">${l.innerHTML}</td><td style="border:0;text-align:left;width:42%" dir="ltr"><b>${e.innerHTML}</b></td></tr></table>`; });
  $$(".hdr-row, .sig", d).forEach(c => { const [a, b] = c.children; c.outerHTML = `<table style="border:0;margin-top:20px"><tr><td style="border:0">${a?.innerHTML || ""}</td><td style="border:0;text-align:end">${b?.innerHTML || ""}</td></tr></table>`; });
  return d.innerHTML;
}

/* ================= المرجع القانوني ================= */
function viewGuide() {
  setTitle(L("المرجع القانوني والمهام", "Legal reference & duties"), L("مستخرج من دليل مهام رئيس القسم المساعد لما بعد التدرج والعلاقات الخارجية", "From the guide to the duties of the Assistant Head for Postgraduate Studies and External Relations"));
  const tab = S.filters.guideTab || "legal";
  const tabs = [["legal", "النصوص القانونية", "Legal texts"], ["appoint", "التعيين والمكانة", "Appointment"], ["duties", "المهام التفصيلية", "Duties"], ["rel", "العلاقات الوظيفية", "Relationships"], ["proc", "الإجراءات النموذجية", "Standard procedures"], ["tips", "نصائح وتنبيهات", "Tips"]];
  const flow = [L("فرقة التكوين / المشرف", "Training team / supervisor"), L("المساعد", "Assistant"), t("اللجنة العلمية للقسم"), t("المجلس العلمي للكلية"), L("نائب العميد", "Vice-Dean"), L("نيابة المديرية", "Vice-Rectorate")];
  const body = {
    legal: `<div class="tbl-wrap"><table><thead><tr><th>${L("النص", "Text")}</th><th>${L("المرجع", "Reference")}</th><th>${L("ما يهم المنصب", "Relevance")}</th></tr></thead><tbody>${LEGAL.map(r => `<tr>${r.map(c => `<td>${esc(t(c))}</td>`).join("")}</tr>`).join("")}</tbody></table></div><p class="small muted">${L("أرقام القرارات التطبيقية تتغير باستمرار؛ يجب التحقق من آخر صيغة منشورة في الجريدة الرسمية. احفظ النصوص الأصلية في الأرشيف الرقمي بصنف «نص قانوني».", "Implementing orders change often; check the latest version in the Official Journal. Keep the original texts in the digital archive under “Legal text”.")}</p>`,
    appoint: `<div class="tbl-wrap"><table><tbody>${APPOINTMENT.map(([a, b]) => `<tr><th style="width:30%">${esc(t(a))}</th><td>${esc(t(b))}</td></tr>`).join("")}</tbody></table></div>`,
    duties: `<div class="grid">${Object.entries(DUTIES).map(([axis, groups]) => Object.entries(groups).map(([g, arr]) => `<section class="panel"><h2>${esc(t(g))}</h2><p class="tag">${esc(t(axis))}</p><ul class="small">${arr.map(x => `<li>${esc(t(x))}</li>`).join("")}</ul></section>`).join("")).join("")}</div>`,
    rel: `<div class="flow" style="margin-bottom:12px">${flow.map(f => `<span>${esc(f)}</span>`).join(`<i>${isEn() ? "→" : "←"}</i>`)}</div><div class="tbl-wrap"><table><thead><tr><th>${L("الهيئة", "Body")}</th><th>${L("طبيعة العلاقة", "Relationship")}</th><th>${L("أبرز الملفات المشتركة", "Shared files")}</th></tr></thead><tbody>${RELATIONS.map(r => `<tr>${r.map(c => `<td>${esc(t(c))}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`,
    proc: `<div class="grid">${Object.entries(PROCEDURES).map(([k, p]) => `<section class="panel"><h2>${esc(t(p.name))}</h2><ol class="small">${p.steps.map(s => `<li>${esc(t(s))}</li>`).join("")}</ol><p class="small muted">${L("الوثائق", "Documents")}: ${p.docs.map(t).join(L("، ", ", "))}</p><button class="btn sm" data-newproc="${k}">${L("فتح ملف", "Open a file")}</button></section>`).join("")}</div>`,
    tips: `<ul class="alerts">${TIPS.map(x => `<li>${esc(t(x))}</li>`).join("")}</ul>`
  }[tab];
  $("#view").innerHTML = `<div class="tabs">${tabs.map(([k, a, e]) => `<button data-tab="${k}" class="${k === tab ? "on" : ""}">${L(a, e)}</button>`).join("")}</div>${body}`;
  $$("[data-tab]").forEach(b => b.onclick = () => { S.filters.guideTab = b.dataset.tab; viewGuide(); });
  $$("[data-newproc]").forEach(b => b.onclick = () => openForm("procedures", null, { ptype: b.dataset.newproc }));
}

/* ================= المظهر والثيمات ================= */
function viewAppearance() {
  setTitle(L("المظهر والثيمات", "Appearance & themes"), L("اللغة، الوضع الفاتح أو الداكن، الثيم، والخطوط", "Language, light or dark mode, theme and fonts"));
  const s = S.settings;
  const card = th => { const p = th.light; const on = s.theme === th.id;
    return `<button class="theme-card ${on ? "on" : ""}" data-theme-id="${th.id}" aria-pressed="${on}" style="--tc-bg:${p.bg};--tc-surface:${p.surface};--tc-line:${p.line};--tc-fg:${p.fg};--tc-ink:${p.ink};--tc-soft:${p.inkSoft};--tc-rail:${p.rail};--tc-railfg:${p.railFg};--tc-r:${th.r};--tc-accent:${p.accent || p.ink}${th.preview ? `;--tc-bgimg:${th.preview}` : ""}">
      <span class="tc-preview"><span class="tc-rail"><i></i><i></i><i></i></span><span class="tc-main">${p.accent ? `<span class="tc-acc"></span>` : ""}<span class="tc-title" style="font-family:'${th.display[0]}','${th.display[1]}'">أبجد · Aa</span><span class="tc-panel"><span class="tc-line"></span><span class="tc-line s"></span><span class="tc-btn"></span></span></span></span>
      <span class="tc-meta"><b>${L(th.name, th.en)}</b><span class="tc-sw"><i style="background:${p.ink}"></i>${p.accent ? `<i style="background:${p.accent}"></i>` : ""}<i style="background:${p.rail}"></i><i style="background:${p.inkSoft}"></i><i style="background:${th.dark.bg}"></i><i style="background:${th.dark.ink}"></i></span><span class="small muted" style="font-family:'${th.body[1]}'">${th.body[1]} · ${th.body[0]}</span></span></button>`; };
  const fontSel = (id, label, list, val) => `<div class="f"><label for="${id}">${label}</label><select id="${id}"><option value="">${L("حسب الثيم", "Theme default")}</option>${list.map(f => `<option value="${f}" ${f === val ? "selected" : ""}>${f}</option>`).join("")}</select></div>`;
  const th = themeById(s.theme);
  $("#view").innerHTML = `
    <div class="grid two">
      <section class="panel"><h2>${L("اللغة", "Language")}</h2><div class="seg big"><button data-lang="ar" class="${!isEn() ? "on" : ""}">العربية</button><button data-lang="en" class="${isEn() ? "on" : ""}">English</button></div>
        <p class="small muted">${L("تتغير الواجهة والسجلات والقوائم. لغة الوثائق المطبوعة تُختار من صفحة النماذج، والترويسة ثنائية اللغة دائما.", "The interface, registers and lists switch language. The language of printed documents is chosen on the Forms page; headers are always bilingual.")}</p></section>
      <section class="panel"><h2>${L("الوضع", "Mode")}</h2><div class="seg big">${[["light", "فاتح", "Light"], ["dark", "داكن", "Dark"], ["auto", "تلقائي", "Auto"]].map(([k, a, e]) => `<button data-mode-set="${k}" class="${s.mode === k ? "on" : ""}"><span class="mi">${MODE_ICONS[k]}</span>${L(a, e)}</button>`).join("")}</div>
        <p class="small muted">${L("التلقائي يتبع إعداد الجهاز.", "Auto follows the device setting.")}</p></section>
    </div>
    <section class="panel" style="margin-top:14px"><h2>${L("الشعارات", "Logos")}</h2>${logoPanel()}</section>
    <h2 class="sec-title">${L("ثيمات عصرية", "Modern themes")}</h2><div class="themes">${THEMES.filter(x => x.style === "modern").map(card).join("")}</div>
    <h2 class="sec-title">${L("ثيمات كلاسيكية", "Classic themes")}</h2><div class="themes">${THEMES.filter(x => x.style === "classic").map(card).join("")}</div>
    <section class="panel" style="margin-top:14px"><h2>${L("الخطوط", "Fonts")}</h2>
      <div class="form">${fontSel("fb", L("خط النص العربي", "Arabic body font"), ARABIC_FONTS, s.fontBody)}${fontSel("fd", L("خط العناوين العربي", "Arabic heading font"), ARABIC_FONTS, s.fontDisplay)}${fontSel("fl", L("الخط اللاتيني (الإنجليزية)", "Latin font (English)"), LATIN_FONTS, s.fontLatin)}${fontSel("fdoc", L("خط الوثائق المطبوعة", "Printed documents font"), DOC_FONTS, s.docFont)}</div>
      <div class="font-sample"><h3 style="font-family:var(--f-display)">${L("دليل مهام رئيس القسم المساعد", "Assistant Head of Department Guide")} — Postgraduate Studies</h3><p>${L("يتولى رئيس القسم المساعد متابعة التكوين في الطور الثالث والبحث العلمي والتعاون. ", "The Assistant Head oversees doctoral training, research and cooperation. ")}The quick brown fox · 0123456789</p><p style="font-family:var(--f-doc)">الجمهورية الجزائرية الديمقراطية الشعبية — People's Democratic Republic of Algeria</p></div>
      <div class="toolbar"><button class="btn" id="resetFonts">${L(`استعادة خطوط ثيم «${th.name}»`, `Restore “${th.en}” theme fonts`)}</button></div>
    </section>`;
  bindLogoPanel(viewAppearance);
  $$("[data-lang]").forEach(b => b.onclick = () => setPref("lang", b.dataset.lang));
  $$("[data-mode-set]").forEach(b => b.onclick = () => setPref("mode", b.dataset.modeSet));
  $$("[data-theme-id]").forEach(b => b.onclick = () => setPref("theme", b.dataset.themeId));
  [["fb", "fontBody"], ["fd", "fontDisplay"], ["fl", "fontLatin"], ["fdoc", "docFont"]].forEach(([id, k]) => $("#" + id).onchange = e => setPref(k, e.target.value));
  $("#resetFonts").onclick = async () => { Object.assign(S.settings, { fontBody: "", fontDisplay: "", fontLatin: "", docFont: "" }); await saveSettings(); applyAppearance(S.settings); route(); };
}

/* ================= حماية البيانات: الحفظ الدائم والتذكير بالنسخ الاحتياطي ================= */
async function requestPersist() {
  try { if (!navigator.storage?.persist) return false; if (await navigator.storage.persisted()) return true; return await navigator.storage.persist(); } catch (e) { return false; }
}
async function storageInfo() {
  const st = navigator.storage; if (!st) return { supported: false };
  try { return { supported: true, persisted: st.persisted ? await st.persisted() : false, ...(st.estimate ? await st.estimate() : {}) }; } catch (e) { return { supported: false }; }
}
const changesSinceBackup = () => { const lb = S.settings.lastBackup || ""; return Object.values(S.data).flat().filter(r => !r.sample && (r.updated || "") > lb).length; };
function renderBackupBanner() {
  const el = $("#backupBanner"); if (!el) return; const s = S.settings;
  const every = +s.backupEvery; const n = changesSinceBackup();
  const days = s.lastBackup ? daysBetween(s.lastBackup.slice(0, 10), todayISO()) : null;
  const due = every > 0 && n > 0 && (days === null || days >= every) && !(s.backupSnooze && s.backupSnooze > todayISO());
  el.hidden = !due; if (!due) return;
  const msg = days === null
    ? L(`لم تُصدَّر أي نسخة احتياطية بعد، وفي البرنامج ${n} سجلا من إدخالك. البيانات محفوظة على هذا الجهاز وحده، فاحفظ نسخة منها.`, `No backup has been exported yet, and the program holds ${n} record(s) you entered. Data lives on this device only, so save a copy.`)
    : L(`آخر نسخة احتياطية قبل ${days} يوما، وعُدِّل منذئذ ${n} سجلا. احفظ نسخة جديدة.`, `Last backup was ${days} day(s) ago and ${n} record(s) changed since. Save a new copy.`);
  el.innerHTML = `<span>${esc(msg)}</span><span class="bk-acts"><button class="btn sm primary" id="bkNow">${L("تصدير نسخة احتياطية الآن", "Export a backup now")}</button><button class="btn sm" id="bkLater">${L("ذكّرني غدا", "Remind me tomorrow")}</button></span>`;
  $("#bkNow").onclick = exportBackup;
  $("#bkLater").onclick = async () => { S.settings.backupSnooze = addDays(todayISO(), 1); await saveSettings(); renderBackupBanner(); };
}
async function protectionPanel() {
  const box = $("#protect"); if (!box) return; const s = S.settings; const info = await storageInfo(); const n = changesSinceBackup();
  const mb = v => (v / 1048576).toFixed(1);
  const persistTxt = !info.supported ? L("هذا المتصفح لا يتيح طلب الحفظ الدائم؛ اعتمد على النسخ الاحتياطي المنتظم.", "This browser cannot request persistent storage; rely on regular backups.")
    : info.persisted ? L("الحفظ الدائم مفعّل: لن يحذف المتصفح بيانات البرنامج تلقائيا.", "Persistent storage is on: the browser will not clear the program's data on its own.")
    : L("الحفظ الدائم غير مفعّل: قد يحذف المتصفح البيانات عند امتلاء الذاكرة أو بعد مدة طويلة من عدم الاستعمال (خاصة Safari على آيفون وآيباد). ثبّت البرنامج كتطبيق، أو اطلب الحفظ الدائم.", "Persistent storage is off: the browser may clear data when space runs low or after long disuse (especially Safari on iPhone/iPad). Install the program as an app, or request persistent storage.");
  box.innerHTML = `<p class="small"><span class="chip ${info.persisted ? "ok" : "warn"}">${info.persisted ? L("محمي", "Protected") : L("غير محمي", "Not protected")}</span> ${esc(persistTxt)}${info.usage != null ? ` <span class="muted">${L("المساحة المستعملة", "Space used")}: ${mb(info.usage)} ${L("م.ب", "MB")}</span>` : ""}</p>
    ${info.supported && !info.persisted ? `<button class="btn sm" id="persistBtn">${L("طلب الحفظ الدائم", "Request persistent storage")}</button>` : ""}
    <p class="small">${L("آخر نسخة احتياطية", "Last backup")}: <b>${s.lastBackup ? fmtDate(s.lastBackup.slice(0, 10)) : L("لم تُصدَّر بعد", "never")}</b> · ${L(`${n} سجلا عُدِّل منذها`, `${n} record(s) changed since`)}</p>
    <div class="toolbar"><label class="small" for="bkEvery">${L("التذكير بالنسخ الاحتياطي", "Backup reminder")}</label><select id="bkEvery">${[[0, "معطل", "Off"], [1, "كل يوم", "Daily"], [3, "كل 3 أيام", "Every 3 days"], [7, "كل أسبوع", "Weekly"], [14, "كل أسبوعين", "Every 2 weeks"], [30, "كل شهر", "Monthly"]].map(([v, a, e]) => `<option value="${v}" ${+s.backupEvery === v ? "selected" : ""}>${L(a, e)}</option>`).join("")}</select></div>`;
  if ($("#persistBtn")) $("#persistBtn").onclick = async () => { const ok = await requestPersist(); toast(ok ? L("فُعِّل الحفظ الدائم", "Persistent storage enabled") : L("رفض المتصفح الطلب؛ ثبّت البرنامج كتطبيق ثم أعد المحاولة", "The browser declined; install the program as an app and try again")); protectionPanel(); };
  $("#bkEvery").onchange = async e => { S.settings.backupEvery = +e.target.value; await saveSettings(); renderBackupBanner(); toast(L("تم الحفظ", "Saved")); };
}

/* ================= الإعدادات والنسخ الاحتياطي ================= */
function viewSettings() {
  setTitle(L("الإعدادات والنسخ الاحتياطي", "Settings & backup"), L("بيانات المؤسسة، القيم المرجعية، وحفظ البيانات أو نقلها إلى جهاز آخر", "Institution details, reference values, and saving or moving your data"));
  const s = S.settings;
  const F = [["republic", "republicEn", L("الترويسة الأولى", "Top line")], ["ministry", "ministryEn", L("الوزارة", "Ministry")], ["university", "universityEn", L("الجامعة", "University")], ["faculty", "facultyEn", L("الكلية", "Faculty")], ["department", "departmentEn", L("القسم", "Department")], ["city", "cityEn", L("المدينة", "City")]];
  const P = [["assistant", L("اسم رئيس القسم المساعد", "Assistant Head's name")], ["head", L("اسم رئيس القسم", "Head of Department's name")]];
  const N = [["normalYears", L("المدة العادية للدكتوراه ل.م.د (سنوات)", "Normal LMD doctorate duration (years)")], ["maxYears", L("المدة القصوى مع التمديد (سنوات)", "Maximum duration with extensions (years)")], ["maxPerSupervisor", L("الحد الأقصى للطلبة لكل مشرف", "Max students per supervisor")], ["plagiarismMax", L("حد التنبيه لنسبة التشابه %", "Similarity alert threshold %")]];
  const total = Object.values(S.data).reduce((n, a) => n + a.length, 0);
  $("#view").innerHTML = `<div class="grid two">
    <section class="panel"><h2>${L("ترويسة الوثائق (عربي / إنجليزي)", "Document header (Arabic / English)")}</h2><form id="sf" class="form">
      ${F.map(([k, ke, l]) => `<div class="f"><label for="s_${k}">${l} — عربي</label><input type="text" id="s_${k}" name="${k}" value="${esc(s[k])}" dir="rtl"></div><div class="f"><label for="s_${ke}">${l} — English</label><input type="text" id="s_${ke}" name="${ke}" value="${esc(s[ke])}" dir="ltr"></div>`).join("")}
      ${P.map(([k, l]) => `<div class="f"><label for="s_${k}">${l}</label><input type="text" id="s_${k}" name="${k}" value="${esc(s[k])}"></div>`).join("")}
      <div class="f wide">${logoPanel()}</div>
      ${N.map(([k, l]) => `<div class="f"><label for="s_${k}">${l}</label><input type="number" id="s_${k}" name="${k}" value="${esc(s[k])}"></div>`).join("")}
      <p class="hint f wide">${L("القيم الافتراضية للمدد والحدود تقريبية؛ اضبطها حسب النص المطبق والنظام الداخلي لمؤسستك.", "Default durations and limits are approximate; adjust them to the applicable regulation and your institution's rules.")}</p>
      <div class="f wide"><button class="btn primary" type="submit">${L("حفظ الإعدادات", "Save settings")}</button></div></form></section>
    <section class="panel"><h2>${L("حماية البيانات", "Data protection")}</h2><div id="protect"><p class="small muted">…</p></div>
      <h2 style="margin-top:16px">${L("النسخ الاحتياطي والنقل", "Backup & transfer")}</h2>
      <p class="small">${L(`البيانات محفوظة على هذا الجهاز فقط (${total} سجلا). صدّر نسخة احتياطية بانتظام، واستوردها لنقل العمل إلى حاسوب أو هاتف آخر.`, `Data is stored on this device only (${total} records). Export a backup regularly, and import it to move to another computer or phone.`)}</p>
      <div class="toolbar"><button class="btn primary" id="bk">${L("تصدير نسخة احتياطية كاملة", "Export full backup")}</button><label class="btn" for="imp">${L("استيراد نسخة", "Import backup")}</label><input type="file" id="imp" accept=".json,application/json" hidden></div>
      <label class="check small"><input type="checkbox" id="withFiles" checked> ${L("تضمين الملفات المرفقة في النسخة", "Include attached files")}</label>
      <h3>${L("بيانات تجريبية", "Sample data")}</h3>
      <div class="toolbar"><button class="btn" id="clrSample">${L("حذف البيانات التجريبية", "Delete sample data")}</button><button class="btn" id="seed">${L("إعادة تحميل البيانات التجريبية", "Reload sample data")}</button></div>
      <h3>${L("منطقة الخطر", "Danger zone")}</h3><button class="btn danger" id="wipe">${L("مسح كل البيانات", "Erase all data")}</button>
      <h3>${L("التثبيت كتطبيق", "Install as an app")}</h3><p class="small">${L("افتح البرنامج في Chrome أو Edge ثم اختر «تثبيت التطبيق» من شريط العنوان، أو «إضافة إلى الشاشة الرئيسية» على الهاتف.", "Open the program in Chrome or Edge and choose “Install app” in the address bar, or “Add to Home screen” on a phone.")}</p><button class="btn" id="installBtn" hidden>${L("تثبيت التطبيق الآن", "Install now")}</button>
    </section></div>`;
  $("#sf").onsubmit = async e => { e.preventDefault(); const fd = new FormData(e.target); for (const [k, ke] of F) { s[k] = fd.get(k); s[ke] = fd.get(ke); } for (const [k] of P) s[k] = fd.get(k); for (const [k] of N) s[k] = +fd.get(k); await saveSettings(); toast(L("تم حفظ الإعدادات", "Settings saved")); renderNav(); };
  bindLogoPanel(viewSettings);
  $("#bk").onclick = async () => { await exportBackup(); protectionPanel(); };
  protectionPanel();
  $("#imp").onchange = e => e.target.files[0] && importBackup(e.target.files[0]);
  $("#clrSample").onclick = () => confirmBox(L("حذف كل السجلات التجريبية؟ سجلاتك الخاصة لن تتأثر.", "Delete all sample records? Your own records are not affected."), async () => { await clearSample(); toast(L("حُذفت البيانات التجريبية", "Sample data deleted")); route(); });
  $("#seed").onclick = async () => { await seedSample(); toast(L("أضيفت البيانات التجريبية", "Sample data added")); route(); };
  $("#wipe").onclick = () => confirmBox(L("مسح كل البيانات والمرفقات نهائيا من هذا الجهاز؟ صدّر نسخة احتياطية قبل ذلك.", "Erase all data and attachments from this device permanently? Export a backup first."), async () => { await DB.clear("items"); await DB.clear("blobs"); Object.keys(S.data).forEach(k => S.data[k] = []); S.prog = {}; S.plans = {}; await saveSettings(); toast(L("تم المسح", "Erased")); route(); });
  if (window.__installPrompt) { $("#installBtn").hidden = false; $("#installBtn").onclick = () => { window.__installPrompt.prompt(); window.__installPrompt = null; $("#installBtn").hidden = true; }; }
}
function readLogo(file) {
  if (file.type === "image/svg+xml") return new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(file); });
  return shrinkImage(file, 480);
}
function logoPanel() {
  const s = S.settings;
  return `<div class="logo-row">
    <div class="logo-box"><div class="frame"><img src="icons/logo.png" alt=""></div>${L("شعار البرنامج", "Program logo")}</div>
    <div class="logo-box"><div class="frame">${s.logo ? `<img src="${s.logo}" alt="">` : `<span class="muted small">${L("لا يوجد", "None")}</span>`}</div>${L("شعار الجامعة", "University logo")}</div>
    <div style="display:flex;flex-direction:column;gap:8px;min-width:0;flex:1 1 220px">
      <label class="btn primary" for="logoIn" style="align-self:flex-start">${s.logo ? L("تغيير شعار الجامعة", "Change university logo") : L("رفع شعار الجامعة", "Upload university logo")}</label>
      <input type="file" id="logoIn" accept="image/png,image/jpeg,image/svg+xml,image/webp" hidden>
      ${s.logo ? `<button type="button" class="btn sm danger" id="logoDel" style="align-self:flex-start">${L("إزالة الشعار", "Remove logo")}</button>` : ""}
      <p class="small muted" style="margin:0">${L("يظهر في وسط ترويسة كل الوثائق المطبوعة وفي القائمة الجانبية. استعمل الملف الرسمي (PNG بخلفية شفافة أو SVG) كما تعتمده الجامعة.", "Shown in the centre of every printed header and in the sidebar. Use the official file (transparent PNG or SVG) as issued by the university.")}</p>
    </div></div>`;
}
function bindLogoPanel(rerender) {
  $("#logoIn").onchange = async e => { const f = e.target.files[0]; if (!f) return; S.settings.logo = await readLogo(f); await saveSettings(); toast(L("تم حفظ شعار الجامعة", "University logo saved")); renderChrome(); rerender(); };
  if ($("#logoDel")) $("#logoDel").onclick = async () => { S.settings.logo = ""; await saveSettings(); renderChrome(); rerender(); };
}
function shrinkImage(file, max) {
  return new Promise(res => { const img = new Image(); img.onload = () => { const k = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); res(c.toDataURL("image/png")); URL.revokeObjectURL(img.src); }; img.src = URL.createObjectURL(file); });
}
/* أسماء ملفات لاتينية: بعض المتصفحات تستبدل الاسم غير اللاتيني بكلمة download بلا امتداد */
function safeName(name) {
  if (/^[\x20-\x7E]+$/.test(name)) return name;
  const ext = (String(name).match(/\.[A-Za-z0-9]{1,5}$/) || [""])[0];
  const base = String(name).slice(0, name.length - ext.length).replace(/[^\x20-\x7E]+/g, " ").replace(/[\s_-]+/g, "-").replace(/^-|-$/g, "");
  return `${base || "file"}-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")}${ext}`;
}
function download(blob, name) {
  const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = safeName(name); document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
async function exportBackup() {
  const items = await DB.all("items"); const blobs = [];
  if ($("#withFiles") ? $("#withFiles").checked : true) for (const b of await DB.all("blobs")) { try { blobs.push({ id: b.id, name: b.name, mime: b.mime, data: await recDataURL(b) }); } catch (e) {} }
  download(new Blob([JSON.stringify({ app: "pg-assistant", version: 2, exported: new Date().toISOString(), items, blobs })], { type: "application/json" }), `pg-assistant-backup-${todayISO()}.json`);
  S.settings.lastBackup = new Date().toISOString(); S.settings.backupSnooze = ""; await saveSettings(); renderBackupBanner();
  toast(window.self !== window.top ? L("صُدِّرت النسخة. إن لم يبدأ التنزيل فصفحة المعاينة تمنعه؛ يعمل في البرنامج المنزّل.", "Backup exported. If nothing downloaded, the preview page blocked it; it works in the installed program.") : L("تم تصدير النسخة الاحتياطية", "Backup exported"));
}
async function importBackup(file) {
  try {
    const j = JSON.parse(await file.text()); if (j.app !== "pg-assistant") throw new Error("invalid");
    confirmBox(L(`استيراد ${j.items.length} سجلا و${j.blobs?.length || 0} ملفا؟ ستُدمج مع البيانات الحالية.`, `Import ${j.items.length} records and ${j.blobs?.length || 0} files? They will be merged with current data.`), async () => {
      for (const it of j.items) await DB.put("items", it);
      for (const b of j.blobs || []) await DB.put("blobs", { id: b.id, name: b.name, mime: b.mime, buf: b64ToBuf(String(b.data).split(",")[1] || "") });
      THUMBS.clear();
      await load(); applyAppearance(S.settings); toast(L("تم الاستيراد", "Imported")); route();
    });
  } catch (e) { toast(L("تعذر الاستيراد: الملف ليس نسخة احتياطية من هذا البرنامج", "Import failed: not a backup from this program")); }
}
function exportCSV(type, rows) {
  const sc = SCHEMAS[type]; const cols = sc.fields.filter(f => !["files", "steps", "docs"].includes(f.type));
  const val = (f, r) => f.type === "ref" ? nameOf(f.ref, r[f.k]) : f.type === "bool" ? (r[f.k] ? L("نعم", "Yes") : L("لا", "No")) : f.type === "select" ? (t(f.labels?.[r[f.k]] || r[f.k]) ?? "") : (r[f.k] ?? "");
  const extra = type === "students" ? [[L("النص المطبق", "Applicable text"), s => applicableText(s)], [L("سنة التكوين", "Year"), studyYear]] : type === "procedures" ? [[L("المراحل المنجزة", "Steps done"), p => `${procMeta(p).done}/${procMeta(p).n}`]] : [];
  const q = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [cols.map(f => q(t(f.label))).concat(extra.map(e => q(e[0]))).join(","), ...rows.map(r => cols.map(f => q(val(f, r))).concat(extra.map(e => q(e[1](r)))).join(","))].join("\r\n");
  download(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }), `${type}-${todayISO()}.csv`);
}

/* ================= البحث الشامل ================= */
function viewSearch() {
  const q = S.q.trim().toLowerCase(); setTitle(L("نتائج البحث", "Search results"), `«${S.q}»`);
  const res = []; for (const ty of Object.keys(SCHEMAS)) for (const r of S.data[ty]) if (searchText(ty, r).includes(q)) res.push([ty, r]);
  $("#view").innerHTML = res.length ? `<div class="tbl-wrap"><table><thead><tr><th>${L("السجل", "Register")}</th><th>${L("العنصر", "Item")}</th><th></th></tr></thead><tbody>${res.slice(0, 200).map(([ty, r]) => `<tr><td><span class="chip ink">${esc(t(SCHEMAS[ty].title))}</span></td><td>${esc(displayOf(ty, r))}</td><td class="act"><button class="btn sm" data-type="${ty}" data-edit="${r.id}">${L("فتح", "Open")}</button></td></tr>`).join("")}</tbody></table></div>` : `<div class="empty">${L("لا نتائج.", "No results.")}</div>`;
  bindRegActions();
}

const VIEWS = { home: viewHome, program: viewProgram, kpi: viewKPI, forms: viewForms, guide: viewGuide, appearance: viewAppearance, settings: viewSettings, search: viewSearch };

/* ================= بيانات تجريبية ================= */
function samplePdf(title, rows) {
  const q = t => String(t).replace(/[\\()]/g, "\\$&");
  let body = `0.06 0.36 0.29 rg 0 792 595 50 re f 1 1 1 rg BT /F1 20 Tf 50 808 Td (${q(title)}) Tj ET 0 0 0 rg `;
  rows.forEach((l, i) => { body += `BT /F1 13 Tf 50 ${740 - i * 24} Td (${q(l)}) Tj ET `; });
  const objs = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>", `<< /Length ${body.length} >>\nstream\n${body}\nendstream`, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
  let out = "%PDF-1.4\n"; const offs = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map(n => String(n).padStart(10, "0") + " 00000 n \n").join("") + `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF`;
  return new Blob([out], { type: "application/pdf" });
}
async function clearSample() { for (const ty of Object.keys(SCHEMAS)) for (const r of S.data[ty].filter(x => x.sample)) await deleteItem(ty, r.id); }
async function seedSample() {
  const y = acadStart(); const d = (m, day, yy = y) => `${m >= 9 ? yy : yy + 1}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const add = async (ty, o) => { o.sample = true; await saveItem(ty, o); return o.id; };
  const sp = [];
  for (const [name, rank, hdr, lab] of [["أ.د. عبد الحميد بن صالح", "أستاذ", true, "مخبر الدراسات الأمنية"], ["د. سعاد مرابط", "أستاذ محاضر قسم أ", true, "مخبر الدراسات الأمنية"], ["د. كمال زروقي", "أستاذ محاضر قسم أ", true, "مخبر السياسات العامة"], ["د. نادية حمودي", "أستاذ محاضر قسم ب", false, "مخبر السياسات العامة"]])
    sp.push(await add("supervisors", { name, rank, hdr, lab, maxStudents: name.includes("زروقي") ? 3 : "" }));
  const sts = [];
  const S0 = [["أمينة بلقاسم", "دكتوراه ل.م.د", "دراسات أمنية واستراتيجية", y - 4, 0, "ممدد", true, "الأمن الطاقوي في منطقة الساحل"], ["يوسف عمراني", "دكتوراه ل.م.د", "سياسات عامة", y - 2, 2, "مسجل", true, "رقمنة الإدارة المحلية في الجزائر"], ["خديجة سالمي", "دكتوراه ل.م.د", "علاقات دولية", y, 1, "مسجل", false, "الدبلوماسية الاقتصادية الجزائرية في إفريقيا"], ["مراد حداد", "دكتوراه ل.م.د", "سياسات عامة", y - 1, 2, "مسجل", true, "السياسة البيئية والتنمية المستدامة"], ["ليلى قاسمي", "دكتوراه ل.م.د", "سياسات عامة", y - 3, 2, "مسجل", true, "الحوكمة المحلية والمشاركة"], ["رضا بوزيد", "دكتوراه علوم", "علوم سياسية", 2016, 0, "مسجل", true, "التحولات الديمقراطية في المنطقة المغاربية"], ["سارة مداني", "دكتوراه ل.م.د", "دراسات أمنية واستراتيجية", y - 3, 1, "ناقش", true, "الأمن السيبراني والسيادة الرقمية"]];
  for (const [name, track, specialty, firstYear, si, status, charter, topic] of S0)
    sts.push(await add("students", { name, track, specialty, firstYear, supervisor: sp[si], status, charter, topic, regNo: `D${firstYear}-${String(sts.length + 11).padStart(3, "0")}`, lastReinscription: status === "ناقش" ? y - 1 : y, logbook: charter, training: charter ? 40 : 0 }));
  await add("defenses", { student: sts[6], title: "الأمن السيبراني والسيادة الرقمية", stage: "نوقشت", depositDate: d(1, 12, y - 1), plagiarism: 9, cscDate: d(2, 3, y - 1), csfDate: d(2, 20, y - 1), defenseDate: d(6, 10, y - 1), result: "مشرف جدا", finalDeposit: true, room: "قاعة المناقشات", jury: "أ.د. محمد بوعلام - أستاذ - جامعة باتنة 1 - رئيسا\nد. سعاد مرابط - أستاذ محاضر أ - جامعة بسكرة - مشرفا ومقررا\nد. كمال زروقي - أستاذ محاضر أ - جامعة بسكرة - ممتحنا" });
  await add("defenses", { student: sts[0], title: "الأمن الطاقوي في منطقة الساحل", stage: "في الخبرة", depositDate: addDays(todayISO(), -50), plagiarism: 12, cscDate: addDays(todayISO(), -35), csfDate: addDays(todayISO(), -20), reportsDue: addDays(todayISO(), 10), reportsIn: "2/4", defenseDate: addDays(todayISO(), 30), room: "قاعة المناقشات", jury: "أ.د. عبد الحميد بن صالح - أستاذ - جامعة بسكرة - مشرفا ومقررا" });
  const mk = (tpl, n) => PROCEDURES[tpl].steps.map((_, i) => ({ done: i < n, date: i < n ? addDays(todayISO(), -40 + i * 5) : "" }));
  await add("procedures", { ptype: "depot", subject: "أمينة بلقاسم", student: sts[0], opened: addDays(todayISO(), -50), due: addDays(todayISO(), 70), steps: mk("depot", 6), docsIn: PROCEDURES.depot.docs.slice(0, 6) });
  await add("procedures", { ptype: "extension", subject: "ليلى قاسمي", student: sts[4], opened: addDays(todayISO(), -40), due: addDays(todayISO(), -5), steps: mk("extension", 3), docsIn: PROCEDURES.extension.docs.slice(0, 2) });
  await add("procedures", { ptype: "concours", subject: `مسابقة الدكتوراه ${acadLabel(y)}`, opened: d(9, 20), due: d(12, 20), steps: mk("concours", 4), docsIn: [] });
  await add("seminars", { student: sts[1], date: d(2, 15), batch: "الدفعة الأولى", attended: "حاضر", progress: 45, evaluation: "مرضٍ" });
  await add("seminars", { student: sts[3], date: d(2, 15), batch: "الدفعة الأولى", attended: "غائب بعذر" });
  await add("council", { number: `03/${y}`, date: addDays(todayISO(), -35), kind: "عادية", president: "أ.د. عبد الحميد بن صالح", attendees: "أ.د. عبد الحميد بن صالح\nد. سعاد مرابط\nد. كمال زروقي", absent: "د. نادية حمودي", agenda: "دراسة ملف إيداع أطروحة\nبرنامج التربصات قصيرة المدة", decisions: "الموافقة على إيداع أطروحة الطالبة أمينة بلقاسم واقتراح لجنة المناقشة\nضبط معايير ترتيب ملفات التربصات" });
  await add("mail", { number: `001/و/${new Date().getFullYear()}`, direction: "وارد", date: addDays(todayISO(), -10), party: "نيابة العمادة لما بعد التدرج", subject: "رزنامة مسابقة الدكتوراه", state: "قيد المعالجة" });
  await add("mail", { number: `001/ص/${new Date().getFullYear()}`, direction: "صادر", date: addDays(todayISO(), -3), party: "عميد الكلية", subject: "إرسال مستخرج محضر اللجنة العلمية", state: "معالجة", signed: true });
  await add("research", { title: "الأمن في الفضاء المغاربي-الساحلي", kind: "مشروع PRFU", code: "PRFU-SP-01", leader: "أ.د. عبد الحميد بن صالح", start: `${y - 1}-01-01`, end: `${y + 2}-12-31`, state: "جارٍ" });
  await add("production", { author: "د. سعاد مرابط", kind: "مقال", title: "مقاربات الأمن الإنساني في الساحل", venue: "مجلة العلوم السياسية", rank: "B", year: y });
  await add("production", { author: "يوسف عمراني", kind: "مداخلة دولية", title: "الإدارة الإلكترونية والخدمة العمومية", venue: "ملتقى دولي - جامعة سطيف 2", year: y, isStudent: true });
  await add("stages", { person: "د. كمال زروقي", category: "أستاذ", program: "تربص قصير المدة", session: y, country: "تونس", host: "جامعة تونس المنار", days: 15, score: 74, state: "مرتب" });
  await add("stages", { person: "مراد حداد", category: "طالب دكتوراه", program: "تحسين المستوى", session: y - 1, country: "فرنسا", host: "Université de Lyon", days: 30, score: 81, state: "منجز", report: false });
  await add("agreements", { partner: "جامعة قاصدي مرباح ورقلة", kind: "جامعة وطنية", country: "الجزائر", signed: `${y - 2}-03-15`, years: 3, activities: "يوم دراسي مشترك\nإشراف مشترك على أطروحة" });
  await add("agreements", { partner: "المجلس الشعبي الولائي", kind: "إدارة / هيئة", country: "الجزائر", signed: `${y - 1}-11-01`, years: 2, activities: "" });
  await add("events", { title: "الأمن الإقليمي في الساحل: التحديات والمقاربات", kind: "ملتقى وطني", date: d(3, 10), coordinator: "د. سعاد مرابط", state: "مصادق عليها", participants: 60 });
  await add("events", { title: "منهجية إعداد أطروحة الدكتوراه", kind: "يوم دراسي", date: d(11, 25), coordinator: "د. كمال زروقي", state: "منجزة", participants: 45, published: false });
  /* أرشيف تجريبي بملفات صغيرة مولّدة لعرض المعاينات */
  const svgFile = async (name, color, label) => { const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="300"><rect width="420" height="300" fill="${color}"/><rect x="40" y="36" width="340" height="228" fill="#fff" opacity=".92"/><rect x="70" y="70" width="200" height="12" fill="${color}"/><rect x="70" y="100" width="280" height="8" fill="#bbb"/><rect x="70" y="120" width="250" height="8" fill="#bbb"/><rect x="70" y="140" width="270" height="8" fill="#bbb"/><text x="210" y="225" font-family="Arial" font-size="22" text-anchor="middle" fill="#333">${label}</text></svg>`; return storeFile(new Blob([svg], { type: "image/svg+xml" }), name); };
  const stubFile = async (name, mime) => storeFile(new Blob(["sample"], { type: mime }), name);
  const pdfFile = async (name, title, rows) => storeFile(samplePdf(title, rows), name);
  await add("archive", { title: "المرسوم التنفيذي 22-208 المتعلق بنظام الدراسات", category: "نص قانوني", ref: "ج.ر عدد 39 لسنة 2022", date: "2022-06-05", tags: "دكتوراه، طور ثالث", files: [await pdfFile("decret-22-208.pdf", "Executive Decree 22-208 (sample)", ["Official Journal no. 39, 5 June 2022", "Studies and training regime for higher education degrees", "Third cycle and doctoral thesis", "", "Sample document generated by the program to demonstrate", "the archive viewer. Replace it with the official text."])] });
  await add("archive", { title: "محضر اللجنة العلمية للقسم — الدورة 03", category: "محضر", ref: `03/${y}`, date: addDays(todayISO(), -35), tags: "لجنة علمية، إيداع", files: [await svgFile("pv-cs-03.svg", "#0f5b4a", "PV CS 03")] });
  await add("archive", { title: "رزنامة مسابقة الدكتوراه", category: "منشور / مراسلة وزارية", ref: `001/و/${new Date().getFullYear()}`, date: addDays(todayISO(), -10), tags: "مسابقة", files: [await svgFile("calendrier-concours.svg", "#a2352b", "Concours")] });
  await add("archive", { title: "اتفاقية تعاون مع جامعة ورقلة", category: "اتفاقية", date: `${y - 2}-03-15`, tags: "تعاون وطني", files: [await stubFile("convention-ouargla.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")] });
  await add("archive", { title: "الحصيلة السنوية للمصلحة", category: "حصيلة / تقرير", date: `${y}-07-10`, tags: "حصيلة", files: [await svgFile("bilan.svg", "#3b4cca", "Bilan annuel")] });
}

/* ================= الإقلاع ================= */
async function start() {
  await load();
  applyAppearance(S.settings);
  if (!S.settings.persistAsked) { S.settings.persistAsked = true; await saveSettings(); requestPersist(); }
  $("#menuBtn").onclick = () => $("#rail").classList.toggle("open");
  $("#langBtn").onclick = () => setPref("lang", isEn() ? "ar" : "en");
  $("#modeBtn").onclick = () => setPref("mode", { auto: "light", light: "dark", dark: "auto" }[S.settings.mode] || "light");
  $("#gq").addEventListener("keydown", e => { if (e.key === "Enter" && e.target.value.trim()) { S.q = e.target.value; if (location.hash === "#search") viewSearch(); else location.hash = "#search"; } });
  $("#bannerClear").onclick = () => confirmBox(L("حذف كل السجلات التجريبية والبدء ببياناتك؟", "Delete all sample records and start with your own data?"), async () => { await clearSample(); toast(L("حُذفت البيانات التجريبية", "Sample data deleted")); route(); });
  window.addEventListener("hashchange", route);
  new MutationObserver(paintKpis).observe($("#view"), { childList: true, subtree: true });
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", paintKpis);
  route();
}
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); window.__installPrompt = e; });
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js").catch(() => {});
start();
