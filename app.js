/* 経営ダッシュボード：ページの切り替え・操作・データの読み込み。 */
import { state, store } from "./state.js";
import * as C from "./calc.js";
import { ROUTES, headHtml, csvFor } from "./pages.js";
import { esc, svgI, ICON, animateCounts } from "./ui.js";

const $ = s => document.querySelector(s);

/* ---------- 読み込み ---------- */
async function load() {
  try {
    const res = await fetch("data.sample.json?" + Date.now(), { cache: "no-store" });
    if (!res.ok) throw new Error("http " + res.status);
    const d = await res.json();
    if (!Array.isArray(d.months) || d.months.length !== 12 || !Array.isArray(d.businesses) || !d.businesses.length
      || !Array.isArray(d.weights) || !Array.isArray(d.people)) throw new Error("形");
    state.data = d; state.updatedAt = new Date();
    $("#err").hidden = true;
    return true;
  } catch (e) {
    $("#err").hidden = false;
    $("#err").innerHTML = `<div class="guide"><p><b>何が起きたか：</b>数字のデータを読み込めませんでした。</p><p><b>次にすること：</b></p><ol><li>「データ更新」を押して、もう一度読み込んでください。</li><li>直らないときは、データの置き場（data.sample.json）が同じフォルダにあるかを確かめてください。</li></ol></div>`;
    return false;
  }
}

/* ---------- 左のメニュー ---------- */
function buildRail() {
  const items = ROUTES.map(r => `${r.ai ? '<div class="sep"></div>' : ""}<a class="nav${r.sub ? " sub" : ""}${r.ai ? " ai" : ""}" href="#/${r.path}" data-path="${r.path}" aria-label="${esc(r.nav)}">${svgI(ICON[r.icon])}<span class="nm">${esc(r.nav)}</span><span class="tipn" aria-hidden="true">${esc(r.nav)}</span></a>`).join("");
  $("#rail").innerHTML = `<div class="brand"><span class="logo"><svg viewBox="0 0 24 24"><path d="M4 16 12 4l8 12M8 14h8"/></svg></span><span class="t">経営ダッシュボード</span></div>${items}<canvas id="dots" aria-hidden="true"></canvas>`;
}
function markNav(r) {
  document.querySelectorAll("#rail a.nav").forEach(a => { if (a.dataset.path === r.path) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
}
function drawDots() {
  const c = $("#dots"); if (!c || getComputedStyle(c).display === "none") return;
  const r = c.getBoundingClientRect(), dpr = devicePixelRatio || 1; c.width = r.width * dpr; c.height = r.height * dpr;
  const x = c.getContext("2d"); x.scale(dpr, dpr);
  for (let i = 0; i < 520; i++) {
    const t = i / 520, px = t * r.width, wave = Math.sin(t * 5.2 + 0.4) * 28 + Math.sin(t * 11) * 6, spread = ((i * 7919) % 100 / 100 - .5) * (40 + t * 70);
    const py = r.height * 0.62 + wave * (1 - t * .3) + spread - t * 26, a = ((i * 104729) % 100) / 100 * .55 + .1, hue = t < .5 ? 205 : 265;
    x.fillStyle = `hsla(${hue + ((i * 31) % 25)},90%,68%,${a})`; x.beginPath(); x.arc(px, py, ((i * 17) % 13) / 10 + .3, 0, 6.3); x.fill();
  }
}

/* ---------- 色味 ---------- */
function applyTheme() { document.documentElement.dataset.theme = ["navy", "violet", "forest", "light"].includes(state.theme) ? state.theme : "navy"; setTimeout(drawDots, 0); }

/* ---------- 描き直し ---------- */
function currentRoute() {
  const h = location.hash.replace(/^#\/?/, "");
  return ROUTES.find(r => r.path === h) || ROUTES.find(r => r.path === "pl");
}
function render(keepScroll = true) {
  if (!state.data) return;
  const y = window.scrollY, r = currentRoute();
  document.title = `${r.title}｜経営ダッシュボード`;
  markNav(r);
  $("#head").innerHTML = headHtml(r);
  const post = [];
  $("#page").innerHTML = r.render(r, post);
  post.forEach(f => f());
  animateCounts($("#page"));
  requestAnimationFrame(() => document.querySelectorAll("#page .cmp .track i").forEach(i => { i.style.width = i.dataset.w + "%"; }));
  window.scrollTo(0, keepScroll ? y : 0);
}

/* ---------- 操作 ---------- */
document.addEventListener("click", e => {
  const t = e.target.closest("button, a");
  if (!t) return;
  if (t.dataset.theme) { state.theme = t.dataset.theme; store.set("theme", state.theme); applyTheme(); render(); return; }
  if (t.dataset.toggle) { const k = t.dataset.toggle === "mom" ? "showMoM" : "showYoY"; state[k] = !state[k]; store.set(k, state[k]); render(); return; }
  if (t.dataset.mode) { state.mode = t.dataset.mode; render(); return; }
  if (t.dataset.metric) { state.metric = t.dataset.metric; render(); return; }
  if (t.dataset.comp) { state.compMeasure = t.dataset.comp; render(); return; }
  if (t.dataset.ser) { const k = t.dataset.ser; state.ser[k] = !state.ser[k]; render(); return; }
  if (t.dataset.sort) { const k = t.dataset.sort; state.sort = state.sort.key === k ? { key: k, dir: -state.sort.dir } : { key: k, dir: -1 }; render(); return; }
  if (t.id === "btnRefresh") { refresh(); return; }
  if (t.id === "btnCsv") { download(); return; }
  if (t.id === "btnPrint") { window.print(); return; }
  if (t.id === "goalReset") { state.overrides = {}; store.set("targets", {}); render(); flash("元の目標に戻しました。", "ok"); return; }
});
document.addEventListener("change", e => {
  const t = e.target;
  if (t.id === "selRange") { state.range = t.value; render(); }
  else if (t.id === "staffBiz") { state.staffBiz = t.value; render(); }
  else if (t.id === "reportIdx") { state.reportIdx = +t.value; render(); }
  else if (t.id === "aiScope") { state.aiScope = t.value; render(); }
});
document.addEventListener("submit", e => {
  if (e.target.id !== "goalForm") return;
  e.preventDefault();
  const form = e.target, next = {}, errs = [];
  form.querySelectorAll("input").forEach(i => i.removeAttribute("aria-invalid"));
  for (const b of state.data.businesses) {
    const g = k => { const el = form.elements[`${b.id}.${k}`], v = Number(el.value); const ok = el.value.trim() !== "" && Number.isFinite(v) && v >= 0; if (!ok) { el.setAttribute("aria-invalid", "true"); errs.push(`${b.short}の${k === "sales" ? "売上" : "利益"}目標は、0以上の数で入れてください。`); } return v; };
    const s = g("sales"), p = g("profit");
    if (Number.isFinite(s) && Number.isFinite(p) && p > s) { form.elements[`${b.id}.profit`].setAttribute("aria-invalid", "true"); errs.push(`${b.short}の利益目標は、売上目標より大きくできません。`); }
    next[b.id] = { sales: s, profit: p };
  }
  const msg = $("#goalMsg");
  if (errs.length) { msg.className = "msg err"; msg.textContent = errs.join(" "); return; }
  state.overrides = next; store.set("targets", next); render(); flash("目標を反映して、計算し直しました。", "ok");
});
function flash(text, cls) { const m = $("#goalMsg"); if (m) { m.className = "msg " + cls; m.textContent = text; } }

async function refresh() {
  const ok = await load();
  if (ok) { render(); const s = $(".tools"); if (s) { const sp = document.createElement("span"); sp.className = "status"; sp.setAttribute("role", "status"); sp.textContent = `更新しました ${state.updatedAt.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}`; s.appendChild(sp); } }
}
function download() {
  if (!state.data) return;
  const { name, text } = csvFor(currentRoute());
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" })); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
}

addEventListener("hashchange", () => { render(false); $("#main").focus({ preventScroll: true }); });
let rt; addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { drawDots(); render(); }, 150); });

applyTheme(); buildRail(); drawDots();
if (!location.hash) history.replaceState(null, "", "#/pl");
load().then(ok => ok && render(false));
