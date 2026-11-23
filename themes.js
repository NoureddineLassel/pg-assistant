/* الثيمات: لكل ثيم لوحة ألوان فاتحة وداكنة، وزوج خطوط (لاتيني + عربي)، وطابع عصري أو كلاسيكي. */

const FONT_SPECS = {
  // عربية
  "IBM Plex Sans Arabic": "IBM+Plex+Sans+Arabic:wght@400;600;700",
  "Noto Kufi Arabic": "Noto+Kufi+Arabic:wght@500;700",
  "Cairo": "Cairo:wght@400;600;700",
  "Tajawal": "Tajawal:wght@400;500;700",
  "Almarai": "Almarai:wght@400;700",
  "Readex Pro": "Readex+Pro:wght@400;600;700",
  "Changa": "Changa:wght@500;700",
  "El Messiri": "El+Messiri:wght@500;700",
  "Reem Kufi": "Reem+Kufi:wght@500;700",
  "Noto Naskh Arabic": "Noto+Naskh+Arabic:wght@400;600;700",
  "Amiri": "Amiri:wght@400;700",
  "Scheherazade New": "Scheherazade+New:wght@400;700",
  "Markazi Text": "Markazi+Text:wght@400;600;700",
  "Aref Ruqaa": "Aref+Ruqaa:wght@400;700",
  // لاتينية
  "Inter": "Inter:wght@400;600;700",
  "IBM Plex Sans": "IBM+Plex+Sans:wght@400;600;700",
  "Manrope": "Manrope:wght@400;600;700",
  "DM Sans": "DM+Sans:wght@400;600;700",
  "Lora": "Lora:wght@400;600;700",
  "EB Garamond": "EB+Garamond:wght@400;600;700",
  "Source Serif 4": "Source+Serif+4:wght@400;600;700",
  "Libre Baskerville": "Libre+Baskerville:wght@400;700",
  "IBM Plex Mono": "IBM+Plex+Mono:wght@500;600"
};
const ARABIC_FONTS = ["IBM Plex Sans Arabic", "Cairo", "Tajawal", "Almarai", "Readex Pro", "Noto Kufi Arabic", "Changa", "El Messiri", "Reem Kufi", "Noto Naskh Arabic", "Amiri", "Scheherazade New", "Markazi Text", "Aref Ruqaa"];
const LATIN_FONTS = ["Inter", "IBM Plex Sans", "Manrope", "DM Sans", "Readex Pro", "Lora", "EB Garamond", "Source Serif 4", "Libre Baskerville"];
const DOC_FONTS = ["Amiri", "Noto Naskh Arabic", "Scheherazade New", "Markazi Text", "IBM Plex Sans Arabic", "Cairo"];

const THEMES = [
  {
    id: "emerald", name: "زمرّدي", en: "Emerald", style: "modern", r: "6px",
    body: ["IBM Plex Sans", "IBM Plex Sans Arabic"], display: ["IBM Plex Sans", "Noto Kufi Arabic"], doc: "Amiri",
    light: { bg: "#f3f5f2", surface: "#ffffff", surface2: "#e9eee9", line: "#d3dbd4", fg: "#1b2620", muted: "#5c6b62", ink: "#0f5b4a", inkSoft: "#d8ebe4", rail: "#0e3b31", railFg: "#dfeee8" },
    dark: { bg: "#111815", surface: "#18211d", surface2: "#202b26", line: "#2f3d36", fg: "#e3ebe6", muted: "#9aaca2", ink: "#5fc1a4", inkSoft: "#1d3a32", rail: "#0a1411", railFg: "#cfe3db" }
  },
  {
    id: "glass", name: "زجاج سائل", en: "Liquid Glass", style: "modern", glass: true, r: "18px",
    body: ["Inter", "IBM Plex Sans Arabic"], display: ["Inter", "Readex Pro"], doc: "Amiri",
    preview: "radial-gradient(circle at 15% 20%, #9db8ff 0, transparent 55%), radial-gradient(circle at 85% 30%, #f6a9d8 0, transparent 55%), radial-gradient(circle at 60% 95%, #8fe3d6 0, transparent 60%), #e8edf8",
    light: { bg: "#e8edf8", surface: "rgba(255,255,255,0.55)", surface2: "rgba(255,255,255,0.40)", line: "rgba(40,60,110,0.14)", fg: "#0d1630", muted: "#4a5675", ink: "#0a6cff", inkSoft: "rgba(10,108,255,0.13)", rail: "rgba(255,255,255,0.38)", railFg: "#0d1630", meta: "#e8edf8" },
    dark: { bg: "#070b18", surface: "rgba(30,36,62,0.50)", surface2: "rgba(255,255,255,0.07)", line: "rgba(255,255,255,0.13)", fg: "#eef2ff", muted: "#a3adc9", ink: "#5aa8ff", inkSoft: "rgba(90,168,255,0.18)", rail: "rgba(16,20,38,0.45)", railFg: "#e6ebff" }
  },
  {
    id: "vivid", name: "ناصع: أزرق وبرتقالي", en: "Vivid Blue & Orange", style: "modern", r: "10px",
    body: ["Inter", "Tajawal"], display: ["Inter", "Cairo"], doc: "Amiri",
    light: { bg: "#f3f7fd", surface: "#ffffff", surface2: "#e7effb", line: "#cddbef", fg: "#0f2440", muted: "#4d6382", ink: "#1565d8", inkSoft: "#dbe8fc", rail: "#0b3a82", railFg: "#e8f1ff", accent: "#f57c00", accentSoft: "#ffe9d3" },
    dark: { bg: "#0b1524", surface: "#111f35", surface2: "#172a46", line: "#253d60", fg: "#e7effb", muted: "#93a8c6", ink: "#5ea4ff", inkSoft: "#163562", rail: "#071022", railFg: "#d8e6fb", accent: "#ff9d42", accentSoft: "#46290d" }
  },
  {
    id: "indigo", name: "نيلي", en: "Indigo", style: "modern", r: "10px",
    body: ["Inter", "Cairo"], display: ["Inter", "Cairo"], doc: "Noto Naskh Arabic",
    light: { bg: "#f5f6fb", surface: "#ffffff", surface2: "#eceef8", line: "#d6daea", fg: "#1a1d2e", muted: "#5b6078", ink: "#3b4cca", inkSoft: "#e2e5fa", rail: "#1e2350", railFg: "#e3e6ff" },
    dark: { bg: "#12141f", surface: "#1a1d2b", surface2: "#232738", line: "#30354a", fg: "#e6e8f2", muted: "#9ba1bb", ink: "#8c9bff", inkSoft: "#262c52", rail: "#0d0f19", railFg: "#d8dcf5" }
  },
  {
    id: "lagoon", name: "بحيرة", en: "Lagoon", style: "modern", r: "12px",
    body: ["Manrope", "Tajawal"], display: ["Manrope", "Changa"], doc: "Amiri",
    light: { bg: "#f1f7f8", surface: "#ffffff", surface2: "#e3eff1", line: "#cde0e3", fg: "#14282d", muted: "#557077", ink: "#0b7285", inkSoft: "#d5eef2", rail: "#ffffff", railFg: "#14282d" },
    dark: { bg: "#0e1a1d", surface: "#142327", surface2: "#1b2e33", line: "#284247", fg: "#dfedf0", muted: "#8eaab0", ink: "#4fc3d7", inkSoft: "#17393f", rail: "#0a1416", railFg: "#d3e8ec" }
  },
  {
    id: "plum", name: "برقوقي وأصفر", en: "Plum & Yellow", style: "modern", r: "14px", strongAccent: true,
    body: ["Readex Pro", "Readex Pro"], display: ["Readex Pro", "El Messiri"], doc: "Noto Naskh Arabic",
    light: { bg: "#f8f5f9", surface: "#ffffff", surface2: "#f0e9f3", line: "#e0d4e6", fg: "#26182c", muted: "#6c5a74", ink: "#7b3fa0", inkSoft: "#efe0f6", rail: "#3a1b4a", railFg: "#f1e4f7", accent: "#f6c90e", accentSoft: "#fff3c4", onAccent: "#2a1a00" },
    dark: { bg: "#160f19", surface: "#1f1624", surface2: "#2a1f31", line: "#3d2f45", fg: "#efe5f3", muted: "#ad9bb6", ink: "#c99be6", inkSoft: "#3a2448", rail: "#100a13", railFg: "#e6d6ee", accent: "#ffd43b", accentSoft: "#3d3312", onAccent: "#1f1600" }
  },
  {
    id: "graphite", name: "فحمي وكهرماني", en: "Graphite & Amber", style: "modern", r: "8px",
    body: ["DM Sans", "Almarai"], display: ["DM Sans", "Almarai"], doc: "Amiri",
    light: { bg: "#f4f4f2", surface: "#ffffff", surface2: "#ebebe7", line: "#d6d6d0", fg: "#1c1c1a", muted: "#62625c", ink: "#a8630a", inkSoft: "#f7e8d2", rail: "#1f2022", railFg: "#ececea" },
    dark: { bg: "#131314", surface: "#1b1b1d", surface2: "#242427", line: "#35353a", fg: "#ececea", muted: "#a3a39d", ink: "#f0a640", inkSoft: "#3a2b16", rail: "#0c0c0d", railFg: "#e2e2df" }
  },
  {
    id: "academic", name: "أكاديمي كلاسيكي", en: "Classic Academic", style: "classic", r: "3px",
    body: ["Source Serif 4", "Noto Naskh Arabic"], display: ["Libre Baskerville", "Amiri"], doc: "Amiri",
    light: { bg: "#f6f4ee", surface: "#fffdf8", surface2: "#ece8dc", line: "#d8d1bf", fg: "#1d2333", muted: "#5f6372", ink: "#1f3a68", inkSoft: "#e3e8f2", rail: "#1a2a4a", railFg: "#efe6cc" },
    dark: { bg: "#10141d", surface: "#171c27", surface2: "#1f2533", line: "#2f3647", fg: "#e9e6dc", muted: "#a6a89f", ink: "#d4b464", inkSoft: "#2d2a1d", rail: "#0b0e15", railFg: "#e6d9b0" }
  },
  {
    id: "manuscript", name: "مخطوط", en: "Manuscript", style: "classic", r: "2px",
    body: ["EB Garamond", "Amiri"], display: ["EB Garamond", "Aref Ruqaa"], doc: "Amiri",
    light: { bg: "#f3eee4", surface: "#fbf8f1", surface2: "#ebe3d2", line: "#d8cbb2", fg: "#2b1f17", muted: "#6e5d4c", ink: "#7a1f2b", inkSoft: "#f0dcd8", rail: "#3b1d17", railFg: "#f3e4cf" },
    dark: { bg: "#17110e", surface: "#201814", surface2: "#2a201a", line: "#3e3128", fg: "#efe4d4", muted: "#b09f8b", ink: "#e08a8f", inkSoft: "#3d1f22", rail: "#100b09", railFg: "#ead8bf" }
  },
  {
    id: "ink", name: "حبر وورق", en: "Ink & Paper", style: "classic", r: "0px",
    body: ["Lora", "Markazi Text"], display: ["Lora", "Scheherazade New"], doc: "Scheherazade New",
    light: { bg: "#fafaf7", surface: "#ffffff", surface2: "#efefea", line: "#cfcfc8", fg: "#111111", muted: "#555550", ink: "#1a1a1a", inkSoft: "#e6e6e0", rail: "#f2f2ed", railFg: "#111111" },
    dark: { bg: "#0f0f0f", surface: "#171717", surface2: "#202020", line: "#333333", fg: "#ededea", muted: "#a5a5a0", ink: "#f2f2ee", inkSoft: "#2b2b2b", rail: "#0a0a0a", railFg: "#e8e8e4" }
  },
  {
    id: "olive", name: "زيتون وآجر", en: "Olive & Brick", style: "classic", r: "4px",
    body: ["Source Serif 4", "Noto Naskh Arabic"], display: ["Source Serif 4", "Reem Kufi"], doc: "Noto Naskh Arabic",
    light: { bg: "#f4f3ec", surface: "#fdfcf6", surface2: "#e9e8dc", line: "#d3d1bf", fg: "#22251a", muted: "#64675a", ink: "#4f6228", inkSoft: "#e5ebd6", rail: "#2f3a1c", railFg: "#efeedd" },
    dark: { bg: "#13150f", surface: "#1a1d15", surface2: "#23271c", line: "#353a2b", fg: "#e8e9de", muted: "#a5a897", ink: "#a9c46c", inkSoft: "#2c3420", rail: "#0c0d09", railFg: "#e0e2cf" }
  }
];

function themeById(id) { return THEMES.find(t => t.id === id) || THEMES[0]; }

/* يطبق الثيم والخطوط والوضع (فاتح/داكن/تلقائي) واتجاه اللغة */
function applyAppearance(st) {
  const th = themeById(st.theme);
  const bodyAr = st.fontBody || th.body[1], dispAr = st.fontDisplay || th.display[1];
  const bodyLa = st.fontLatin || th.body[0], dispLa = st.fontLatin || th.display[0];
  const docF = st.docFont || th.doc;
  /* الخطوط مضمَّنة في vendor/fonts/fonts.css وتُحمَّل محليا عند الحاجة فقط (تعمل دون اتصال) */
  const q = f => `"${f}"`;
  const vars = p => `--accent:${p.accent || p.ink};--accent-soft:${p.accentSoft || p.inkSoft};--on-accent:${p.onAccent || p.surface};--bg:${p.bg};--surface:${p.surface};--surface-2:${p.surface2};--line:${p.line};--fg:${p.fg};--muted:${p.muted};--ink:${p.ink};--ink-soft:${p.inkSoft};--rail:${p.rail};--rail-fg:${p.railFg};`;
  const fonts = `--f-body:${q(bodyLa)},${q(bodyAr)},"Segoe UI",Tahoma,sans-serif;--f-display:${q(dispLa)},${q(dispAr)},"Segoe UI",Tahoma,sans-serif;--f-doc:"Times New Roman",${q(docF)},"Traditional Arabic",serif;--r:${th.r};`;
  let el = document.getElementById("themeCss");
  if (!el) { el = document.createElement("style"); el.id = "themeCss"; document.head.appendChild(el); }
  /* html:root أعلى أولوية من :root في styles.css، فيعمل الثيم أيا كان ترتيب تحميل الملفات */
  el.textContent = `html:root{${vars(th.light)}${fonts}}
@media (prefers-color-scheme: dark){html:root:not([data-theme="light"]){${vars(th.dark)}}}
html:root[data-theme="dark"]{${vars(th.dark)}}`;
  const root = document.documentElement;
  root.dataset.style = th.style;
  if (th.glass) root.dataset.glass = "1"; else delete root.dataset.glass;
  if (th.strongAccent) root.dataset.accent = "strong"; else delete root.dataset.accent;
  if (st.mode === "light" || st.mode === "dark") root.dataset.theme = st.mode;
  else if (st.mode === "auto" && root.dataset.themeOwner === "app") delete root.dataset.theme;
  if (st.mode === "light" || st.mode === "dark") root.dataset.themeOwner = "app";
  root.lang = st.lang === "en" ? "en" : "ar";
  root.dir = st.lang === "en" ? "ltr" : "rtl";
  const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = th.light.meta || th.light.rail;
}


/* ---- بطاقات الإحصاءات: ألوان ناصعة متدرجة، مكمّلة (مقابلة في الدائرة اللونية) للون الرئيسي للثيم ---- */
function parseColor(c) {
  c = String(c).trim();
  if (c.startsWith("#")) { let h = c.slice(1); if (h.length === 3) h = [...h].map(x => x + x).join(""); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); }
  const m = c.match(/[\d.]+/g); return m ? m.slice(0, 3).map(Number) : [0, 0, 0];
}
function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); const l = (mx + mn) / 2; let h = 0, s = 0;
  if (mx !== mn) { const d = mx - mn; s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; }
  return [h, s, l];
}
function hslToRgb(h, s, l) {
  s /= 100; l /= 100; const k = n => (n + h / 30) % 12; const a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)].map(v => Math.round(v * 255));
}
const lum = rgb => { const [r, g, b] = rgb.map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * r + .7152 * g + .0722 * b; };
function paintKpis() {
  const cs = getComputedStyle(document.documentElement);
  const [h, sat] = rgbToHsl(parseColor(cs.getPropertyValue("--ink")));
  const dark = lum(parseColor(cs.getPropertyValue("--bg"))) < .2;
  document.querySelectorAll(".kpis").forEach(box => {
    const tiles = [...box.children]; const n = tiles.length;
    tiles.forEach((el, i) => {
      const t = n > 1 ? i / (n - 1) : .5; let c1, c2;
      if (sat < .12) { const l = (dark ? 30 : 30) - t * 8; c1 = hslToRgb(220, 8, l + 8); c2 = hslToRgb(220, 10, l - 6); }
      else { const hue = ((h + 180 - 28 + 56 * t) % 360 + 360) % 360; c1 = hslToRgb(hue, 88, dark ? 50 : 58); c2 = hslToRgb((hue + 14) % 360, 84, dark ? 36 : 44); }
      let mid = c1.map((v, j) => (v + c2[j]) / 2);
      if (document.documentElement.dataset.glass) { const bg = parseColor(cs.getPropertyValue("--bg")); mid = mid.map((v, j) => v * .78 + bg[j] * .22); }
      el.style.setProperty("--k1", `rgb(${c1})`); el.style.setProperty("--k2", `rgb(${c2})`);
      el.style.setProperty("--kfg", lum(mid) > .42 ? "#1a1300" : "#ffffff");
      el.classList.add("vivid");
    });
  });
}
