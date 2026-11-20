/* 画面の部品（アイコン・カード・ドーナツ・小さな折れ線・増減の印）。 */
import * as C from "./calc.js";
export const { fmtMan, fmtPct } = C;

export const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const ICON = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5.5v-6h-5v6H4a1 1 0 0 1-1-1z",
  sales: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  pl: "M4 20V12M10 20V6M16 20V9M3 21h18",
  act: "M12 3a9 9 0 1 0 9 9M12 7v5l3 2",
  person: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  goal: "M3 20h18M5 16l4-5 4 3 6-8",
  report: "M6 3h9l4 4v14H6zM9 12h7M9 16h7M9 8h3",
  ai: "M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM18 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z",
  reform: "M3 21V10l9-7 9 7v11zM9 21v-6h6v6",
  staffing: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M17 5.5a3.5 3.5 0 0 1 0 6.5M21.5 20a6.5 6.5 0 0 0-3.5-5.8",
  coin: "M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6",
  layers: "M12 3 3 8l9 5 9-5zM3 13l9 5 9-5M3 17.5l9 5 9-5",
  target: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zM12 12l7-7",
  cost: "M3 7h18v12H3zM3 11h18M8 3v4M16 3v4",
  trend: "M3 17l6-6 4 4 8-9",
  check: "M5 12.5l4.2 4.2L19 7",
  task: "M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2",
  memo: "M5 4h14v16H5zM8 9h8M8 13h8M8 17h5",
  cases: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 11h18",
  site: "M4 20h16M6 20V10l6-6 6 6v10M10 20v-5h4v5",
  estimate: "M7 3h10a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM9 7h6M9 11h6M9 15h3",
};
export const svgI = d => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;

/** 増減の印。goodWhenUp=false のとき（原価など）は、下がるほうを良い色にする。 */
export function tag(label, pct, goodWhenUp = true) {
  if (pct == null || !Number.isFinite(pct)) return `<span class="tag flat">${esc(label)} —</span>`;
  const up = pct > 0.05, down = pct < -0.05;
  const good = up ? goodWhenUp : down ? !goodWhenUp : null;
  const cls = good == null ? "flat" : good ? "up" : "down";
  const arrow = up ? "↑" : down ? "↓" : "→";   // 「▲」は経理でマイナスを表すため使わない
  return `<span class="tag ${cls}">${esc(label)} ${arrow} ${Math.abs(pct).toFixed(1)}%</span>`;
}

export function diffTag(label, man) {
  if (man == null || !Number.isFinite(man)) return `<span class="tag flat">${esc(label)} —</span>`;
  const cls = man >= 0 ? "up" : "down";
  return `<span class="tag ${cls}">${esc(label)} ${man >= 0 ? "+" : "−"}${fmtMan(Math.abs(man))}万円</span>`;
}

export function spark(vals, color, id) {
  const v = vals.filter(x => Number.isFinite(x));
  if (v.length < 2) return "";
  const w = 92, h = 36, mn = Math.min(...v), mx = Math.max(...v), r = mx - mn || 1;
  const pts = v.map((x, i) => [i / (v.length - 1) * w, h - 4 - (x - mn) / r * (h - 10)]);
  const d = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join("");
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"><defs><filter id="sg${id}"><feGaussianBlur stdDeviation="1.6"/></filter></defs><path d="${d}" fill="none" stroke="${color}" stroke-width="3" opacity=".5" filter="url(#sg${id})"/><path d="${d}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

/** 目標進捗などの横棒。plan を渡すと「計画どおりならここ」の印を出す。 */
export function pbar(pct, plan, label, cls = "") {
  const p = Math.max(0, Math.min(100, Number.isFinite(pct) ? pct : 0));
  const m = Number.isFinite(plan) ? Math.max(0, Math.min(100, plan)) : null;
  return `<div class="pbar ${cls}" role="progressbar" aria-label="${esc(label || "進捗")}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(p)}"><i style="width:${p}%"></i>${m == null ? "" : `<b style="left:${m}%" title="計画どおりなら ${m.toFixed(1)}%"></b>`}</div>`;
}

export function bar(pct, cls = "") {
  const p = Math.max(0, Math.min(100, Number.isFinite(pct) ? pct : 0));
  return `<div class="bar-h ${cls}" role="img" aria-label="${p.toFixed(1)}%"><i style="width:${p}%"></i></div>`;
}

/** KPI カード。value は数字（文字列）、unit は単位。 */
export function kpi({ tone = "cyan", icon, label, value, unit = "", sub = "", tags = "", barHtml = "", sparkHtml = "", href = "" }) {
  const inner = `<span class="ic">${svgI(ICON[icon] || icon)}</span><div class="body"><p class="lab">${esc(label)}</p>
    <div class="val"><span data-count="${esc(value)}">${esc(value)}</span><small>${esc(unit)}</small></div>
    ${sub ? `<p class="sub">${sub}</p>` : ""}${tags ? `<div class="tags">${tags}</div>` : ""}${barHtml}</div>${sparkHtml}`;
  return href
    ? `<a class="card kpi t-${tone} kpi-link" href="${href}">${inner}</a>`
    : `<article class="card kpi t-${tone}">${inner}</article>`;
}

/** ドーナツ。segs: [{label, value, c1, c2}]。 */
export function donut(segs, main, sub, id) {
  const tot = segs.reduce((a, s) => a + Math.max(0, s.value), 0);
  const r = 56, C0 = 2 * Math.PI * r, gap = segs.filter(s => s.value > 0).length > 1 ? 4 : 0;
  let off = 0;
  const defs = segs.map((s, i) => `<linearGradient id="dg${id}${i}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${s.c1}"/><stop offset="1" stop-color="${s.c2}"/></linearGradient>`).join("");
  const arcs = segs.map((s, i) => {
    if (!(s.value > 0) || !(tot > 0)) return "";
    const len = C0 * s.value / tot;
    const a = `<g style="filter:drop-shadow(0 0 6px ${s.c1}88)"><circle cx="75" cy="75" r="${r}" fill="none" stroke="url(#dg${id}${i})" stroke-width="22" stroke-linecap="round" stroke-dasharray="${Math.max(0.1, len - gap).toFixed(1)} ${C0.toFixed(1)}" stroke-dashoffset="${(-off).toFixed(1)}" transform="rotate(-90 75 75)"/></g>`;
    off += len; return a;
  }).join("");
  const aria = segs.map(s => `${s.label} ${tot > 0 ? (s.value / tot * 100).toFixed(1) : 0}%`).join("、");
  return `<div class="donut"><svg viewBox="0 0 150 150" role="img" aria-label="${esc(aria)}"><defs>${defs}</defs><circle cx="75" cy="75" r="${r}" fill="none" stroke="var(--track)" stroke-width="22"/>${arcs}</svg>
  <div class="c"><strong>${esc(main)}</strong><small>${esc(sub)}</small></div></div>`;
}

/** 数字が 0 から増えて最終値に着く動き。描画が止まっていても最終値は必ず出す。 */
export function animateCounts(root) {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  root.querySelectorAll("[data-count]").forEach(el => {
    const final = el.dataset.count;
    const m = final.match(/^([+−-]?)([\d,]+(?:\.\d+)?)(.*)$/);
    if (reduce || !m) { el.textContent = final; return; }
    const sign = m[1], to = parseFloat(m[2].replace(/,/g, "")), tail = m[3];
    const dec = (m[2].split(".")[1] || "").length, t0 = performance.now(), dur = 650;
    const show = v => { el.textContent = sign + v.toLocaleString("ja-JP", { minimumFractionDigits: dec, maximumFractionDigits: dec }) + tail; };
    (function f(t) { const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3); show(to * e); if (p < 1) requestAnimationFrame(f); })(t0);
    setTimeout(() => { el.textContent = final; }, dur + 80);
  });
}

export const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
/** 意味ごとの色（テーマに合わせて、描くときに読む）。 */
export function palette() {
  return {
    sales: { c1: cssVar("--c-sales2"), c2: cssVar("--c-sales") }, mat: { c1: cssVar("--c-mat2"), c2: cssVar("--c-mat") },
    lab: { c1: cssVar("--c-lab2"), c2: cssVar("--c-lab") }, prof: { c1: cssVar("--c-prof2"), c2: cssVar("--c-prof") },
    goal: { c1: cssVar("--c-goal2"), c2: cssVar("--c-goal") }, prev: { c1: cssVar("--c-prev"), c2: "#7a5fe0" },
  };
}
/** 事業の色：リフォーム＝薄水色、人材紹介＝薄緑（ライトの色味では、少し濃くして見えやすくする）。 */
export const bizColor = id => {
  const light = document.documentElement.dataset.theme === "light";
  if (id === "reform") return light ? { c1: "#8fd8f2", c2: "#3fb0dd" } : { c1: "#c4f3ff", c2: "#7fd8f5" };
  return light ? { c1: "#9be3b0", c2: "#46bd72" } : { c1: "#d3f9dc", c2: "#8be8a8" };
};

/** 事業のロゴ（リフォーム＝家と金づち、人材紹介＝2人とつながり）。色は事業の色（薄水色・薄緑）。 */
export function bizLogo(id, size = 52) {
  const c = bizColor(id), gid = "bl" + id, dark = id === "reform" ? "#0b3a4a" : "#0d3b24";
  const glyph = id === "reform"
    ? `<path d="M14 27 26 16l12 11v13a1 1 0 0 1-1 1H15a1 1 0 0 1-1-1z" fill="none" stroke="${dark}" stroke-width="2.4" stroke-linejoin="round"/><path d="M22 41v-9h8v9" fill="none" stroke="${dark}" stroke-width="2.4" stroke-linejoin="round"/><path d="M33 13l5 5M30 19l8-8" stroke="${dark}" stroke-width="2.6" stroke-linecap="round"/>`
    : `<circle cx="20" cy="21" r="5" fill="none" stroke="${dark}" stroke-width="2.4"/><circle cx="34" cy="21" r="5" fill="none" stroke="${dark}" stroke-width="2.4"/><path d="M10 40a10 10 0 0 1 20 0M24 40a10 10 0 0 1 20 0" fill="none" stroke="${dark}" stroke-width="2.4" stroke-linecap="round"/><path d="M23 30l4 3 4-3" fill="none" stroke="${dark}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`;
  return `<svg class="biz-logo" width="${size}" height="${size}" viewBox="0 0 52 52" role="img" aria-label="${id === "reform" ? "リフォーム事業のロゴ" : "人材紹介業のロゴ"}"><defs><linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c.c1}"/><stop offset="1" stop-color="${c.c2}"/></linearGradient><filter id="${gid}g" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3.5"/></filter></defs>
    <rect x="4" y="5" width="44" height="44" rx="13" fill="${c.c2}" opacity=".45" filter="url(#${gid}g)"/><rect x="3" y="3" width="46" height="46" rx="13" fill="url(#${gid})"/><rect x="3.8" y="3.8" width="44.4" height="44.4" rx="12.4" fill="none" stroke="rgba(255,255,255,.65)" stroke-width="1"/>${glyph}</svg>`;
}
