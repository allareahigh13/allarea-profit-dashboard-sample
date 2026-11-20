/* 月次の棒＋累計の線＋目標の計画線のグラフ（SVG）。実績と計画の差が見える。 */
import * as C from "./calc.js";
import { esc, fmtMan } from "./ui.js";

const NS = "http://www.w3.org/2000/svg";
const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const isNum = v => typeof v === "number" && Number.isFinite(v);

function el(n, a = {}, p) { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); if (p) p.appendChild(e); return e; }

function niceRange(mn, mx, ticks) {
  mn = Math.min(mn, 0); mx = Math.max(mx, 0);
  const raw = (mx - mn) / ticks || 1, m = Math.pow(10, Math.floor(Math.log10(raw)));
  const st = [1, 2, 2.5, 5, 10].map(x => x * m).find(x => x >= raw);
  return { lo: Math.floor(mn / st) * st, hi: Math.ceil(mx / st) * st, st };
}

const METRIC_LABEL = { sales: "売上", cost: "原価", profit: "利益" };
export const metricLabel = k => METRIC_LABEL[k];

/** o: { metric, range, mode, showYoY, ser:{bars,plan,cum} } */
export function drawChart(wrap, s, o) {
  wrap.querySelectorAll("svg").forEach(x => x.remove());
  const key = o.metric, L = s.L, N = 12, label = METRIC_LABEL[key];
  const act = s[key], plan = s.plan[key], prev = s.prev[key];
  const cA = C.cumulative(act), cP = C.cumulative(plan), cV = C.cumulative(prev);
  let a = 0, b = N - 1;
  if (o.range === "6") { a = Math.max(0, L - 5); b = L; }
  if (o.range === "3") { a = Math.max(0, L - 2); b = L; }
  const idx = []; for (let i = a; i <= b; i++) idx.push(i);
  const showBars = o.mode !== "cum" && o.ser.bars, showCum = o.mode !== "monthly" && o.ser.cum, showPlan = o.ser.plan;
  const costLike = key === "cost";

  const bb = wrap.getBoundingClientRect();
  const W = Math.max(300, Math.round(bb.width) || 1000), H = Math.max(240, Math.round(bb.height) || 420);
  const sm = W < 600, Lm = sm ? 42 : 66, Rm = sm ? 46 : 70, T = 38, B = 32;
  const pw = W - Lm - Rm, ph = H - T - B, FS = sm ? 10.5 : 14, TS = sm ? 10 : 13;
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img",
    "aria-label": `月次${label}の棒と、累計${label}の線、目標の計画線のグラフ。数字は下の要約にも文字で出しています。` });
  wrap.insertBefore(svg, wrap.firstChild);

  // ---- 目盛り（左：月次、右：累計。0 の高さをそろえる）
  const mv = [], cv = [];
  idx.forEach(i => {
    if (showBars) { if (isNum(act[i])) mv.push(act[i]); if (showPlan) mv.push(plan[i]); if (o.showYoY && isNum(prev[i])) mv.push(prev[i]); }
    if (showCum) { if (isNum(cA[i])) cv.push(cA[i]); if (showPlan) cv.push(cP[i]); if (o.showYoY && isNum(cV[i])) cv.push(cV[i]); }
  });
  if (!mv.length) mv.push(0, 1); if (!cv.length) cv.push(0, 1);
  const mS = niceRange(Math.min(...mv), Math.max(...mv), 4), cS = niceRange(Math.min(...cv), Math.max(...cv), 4);
  const zr = Math.max(-mS.lo / ((mS.hi - mS.lo) || 1), -cS.lo / ((cS.hi - cS.lo) || 1));
  const need = S => Math.max(S.hi / ((1 - zr) || 1), zr > 0 ? -S.lo / zr : 0);
  const nM = need(mS), nC = need(cS);
  const mLo = -nM * zr, mHi = nM * (1 - zr), cLo = -nC * zr, cHi = nC * (1 - zr);
  const yM = v => T + ph * (1 - (v - mLo) / ((mHi - mLo) || 1)), yC = v => T + ph * (1 - (v - cLo) / ((cHi - cLo) || 1));
  const stM = niceRange(mLo, mHi, 4).st, stC = niceRange(cLo, cHi, 4).st;

  const defs = el("defs", {}, svg);
  const lg = (id, c1, c2, vert = true) => { const g = el("linearGradient", { id, x1: 0, y1: 0, x2: vert ? 0 : 1, y2: vert ? 1 : 0 }, defs); el("stop", { offset: "0%", "stop-color": c1 }, g); el("stop", { offset: "100%", "stop-color": c2 }, g); };
  lg("gPos", "#7af6ff", "#1f8fe0"); lg("gNeg", "#ff9fbd", "#d94f86"); lg("gCost", "#c9b8ff", "#7a5fe0"); lg("gLine", "#ffe18a", "#ffc857", false);
  const f = el("filter", { id: "glow", x: "-20%", y: "-20%", width: "140%", height: "140%" }, defs); el("feGaussianBlur", { stdDeviation: 4, result: "b" }, f); const fm = el("feMerge", {}, f); el("feMergeNode", { in: "b" }, fm); el("feMergeNode", { in: "SourceGraphic" }, fm);

  for (let v = Math.ceil(mLo / stM) * stM; v <= mHi + 1e-9; v += stM) {
    const y = yM(v);
    el("line", { x1: Lm, x2: Lm + pw, y1: y, y2: y, stroke: v === 0 ? "rgba(170,200,230,.55)" : "rgba(120,160,200,.14)", "stroke-width": v === 0 ? 1.4 : 1 }, svg);
    const t = el("text", { x: Lm - 8, y: y + 4, "text-anchor": "end", fill: "#a9bdd5", "font-size": TS }, svg); t.textContent = Math.round(v).toLocaleString("ja-JP");
  }
  for (let v = Math.ceil(cLo / stC) * stC; v <= cHi + 1e-9; v += stC) {
    const t = el("text", { x: Lm + pw + 8, y: yC(v) + 4, fill: "#a9bdd5", "font-size": TS }, svg); t.textContent = Math.round(v).toLocaleString("ja-JP");
  }
  const t1 = el("text", { x: sm ? 2 : Lm - 60, y: T - 18, fill: "#a9bdd5", "font-size": sm ? 10 : 12 }, svg); t1.textContent = `月次${label}（万円）`;
  const t2 = el("text", { x: W - 2, y: T - 18, fill: "#a9bdd5", "font-size": sm ? 10 : 12, "text-anchor": "end" }, svg); t2.textContent = `累計${label}（万円）`;

  const n = idx.length, slot = pw / n, bw = Math.min(54, slot * (sm ? 0.7 : 0.58)), cx = k => Lm + slot * k + slot / 2;
  idx.forEach((i, k) => { const t = el("text", { x: cx(k), y: H - 10, "text-anchor": "middle", fill: i > L ? "#6f87a3" : "#a9bdd5", "font-size": TS }, svg); t.textContent = s.months[i]; });

  // ---- 月次の棒
  if (showBars) {
    idx.forEach((i, k) => {
      const v = act[i], g = el("g", {}, svg);
      if (isNum(v)) {
        const pos = v >= 0, y0 = yM(0), y1 = yM(v), top = Math.min(y0, y1), hgt = Math.max(2, Math.abs(y1 - y0));
        const rect = el("rect", { class: reduce() ? "" : "bar-rect", x: cx(k) - bw / 2, y: top, width: bw, height: hgt, rx: 6, fill: costLike ? "url(#gCost)" : pos ? "url(#gPos)" : "url(#gNeg)", filter: "url(#glow)", opacity: .95 }, g);
        if (!reduce()) { rect.style.transformBox = "fill-box"; rect.style.transformOrigin = pos ? "bottom" : "top"; rect.style.animationDelay = (k * 40) + "ms"; }
        el("rect", { x: cx(k) - bw / 2 + 3, y: pos ? top : top + hgt - 2, width: bw - 6, height: 2, rx: 1, fill: "rgba(255,255,255,.6)" }, g);
        const tx = el("text", { x: cx(k), y: pos ? top - 8 : top + hgt + 16, "text-anchor": "middle", fill: "#f4f8ff", "font-size": FS, "font-weight": 700, class: reduce() ? "" : "pt", style: reduce() ? "" : `animation-delay:${k * 40 + 450}ms` }, g);
        tx.textContent = Math.round(v).toLocaleString("ja-JP");
      } else if (showPlan) {   // まだ実績が無い月は、計画だけを枠線で見せる
        const y0 = yM(0), y1 = yM(plan[i]), top = Math.min(y0, y1), hgt = Math.max(2, Math.abs(y1 - y0));
        el("rect", { x: cx(k) - bw / 2, y: top, width: bw, height: hgt, rx: 6, fill: "rgba(37,217,239,.05)", stroke: "rgba(37,217,239,.45)", "stroke-dasharray": "4 3" }, g);
      }
      if (showPlan && isNum(v)) { const py = yM(plan[i]); el("line", { x1: cx(k) - bw / 2 - 4, x2: cx(k) + bw / 2 + 4, y1: py, y2: py, stroke: "#66f3ff", "stroke-width": 2.2 }, g); }
      if (o.showYoY && isNum(prev[i]) && isNum(v)) { const py = yM(prev[i]); el("line", { x1: cx(k) - bw / 2 - 4, x2: cx(k) + bw / 2 + 4, y1: py, y2: py, stroke: "#c9b8ff", "stroke-width": 2, "stroke-dasharray": "4 3" }, g); }
    });
  }

  // ---- 累計の線・計画線・差
  let endInfo = null;
  if (showCum) {
    const ptsA = [], ptsP = [], ptsV = [];
    idx.forEach((i, k) => {
      ptsP.push([cx(k), yC(cP[i])]);
      if (isNum(cA[i])) ptsA.push([cx(k), yC(cA[i]), i]);
      if (isNum(cV[i])) ptsV.push([cx(k), yC(cV[i])]);
    });
    const smooth = pts => {
      if (!pts.length) return "";
      let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
        const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
        d += `C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
      }
      return d;
    };
    // 実績と計画のあいだ（差）を塗る。良い側は緑、悪い側はピンク（原価は逆）
    if (showPlan) for (let k = 0; k < ptsA.length - 1; k++) {
      const i1 = ptsA[k][2], i2 = ptsA[k + 1][2], d1 = cA[i1] - cP[i1], d2 = cA[i2] - cP[i2], avg = (d1 + d2) / 2;
      const good = costLike ? avg <= 0 : avg >= 0;
      const kk1 = idx.indexOf(i1), kk2 = idx.indexOf(i2);
      el("path", { d: `M${ptsA[k][0]} ${ptsA[k][1]}L${ptsA[k + 1][0]} ${ptsA[k + 1][1]}L${ptsP[kk2][0]} ${ptsP[kk2][1]}L${ptsP[kk1][0]} ${ptsP[kk1][1]}Z`, fill: good ? "rgba(75,227,181,.20)" : "rgba(242,106,157,.20)" }, svg);
    }
    if (showPlan && ptsP.length) el("path", { d: smooth(ptsP), fill: "none", stroke: "#25d9ef", "stroke-width": 2.2, "stroke-dasharray": "8 6", opacity: .95 }, svg);
    if (o.showYoY && ptsV.length) el("path", { d: smooth(ptsV), fill: "none", stroke: "#c9b8ff", "stroke-width": 1.6, "stroke-dasharray": "5 5", opacity: .7 }, svg);
    if (ptsA.length) {
      const d = smooth(ptsA);
      el("path", { d, fill: "none", stroke: "#ffc857", "stroke-width": 9, opacity: .18, filter: "url(#glow)", "stroke-linecap": "round" }, svg);
      const main = el("path", { d, fill: "none", stroke: "url(#gLine)", "stroke-width": 3.2, "stroke-linecap": "round", class: reduce() ? "" : "line-draw" }, svg);
      main.style.setProperty("--len", Math.ceil(main.getTotalLength()));
      ptsA.forEach((p, k) => el("circle", { cx: p[0], cy: p[1], r: sm ? 3.4 : 5, fill: "#ffd978", stroke: "#06101e", "stroke-width": 1.5, class: reduce() ? "" : "pt", style: reduce() ? "" : `animation-delay:${400 + k * 90}ms;filter:drop-shadow(0 0 6px #ffc857)` }, svg));
      const last = ptsA[ptsA.length - 1];
      if (!reduce()) el("circle", { cx: last[0], cy: last[1], r: 10, fill: "#ffc857", class: "pulse" }, svg);
      endInfo = last;
      // 終わりの吹き出し：累計と計画との差
      const i = last[2], diff = cA[i] - cP[i], good = costLike ? diff <= 0 : diff >= 0;
      const bw2 = sm ? 118 : 150, bx = Math.min(Math.max(last[0] - bw2 / 2, Lm + 4), W - Rm - bw2 + 20), by = Math.max(4, last[1] - 66);
      const g = el("g", {}, svg);
      el("rect", { x: bx, y: by, width: bw2, height: 52, rx: 8, fill: "rgba(10,24,42,.93)", stroke: "rgba(37,217,239,.6)" }, g);
      const l1 = el("text", { x: bx + bw2 / 2, y: by + 16, "text-anchor": "middle", fill: "#a9bdd5", "font-size": 11 }, g); l1.textContent = `${s.months[i]}までの累計${label}`;
      const l2 = el("text", { x: bx + bw2 / 2, y: by + 34, "text-anchor": "middle", fill: "#ffe18a", "font-size": sm ? 14 : 16, "font-weight": 700 }, g); l2.textContent = `${fmtMan(cA[i])} 万円`;
      const l3 = el("text", { x: bx + bw2 / 2, y: by + 47, "text-anchor": "middle", fill: good ? "#4be3b5" : "#ff91b5", "font-size": 11 }, g); l3.textContent = showPlan ? `計画との差 ${fmtMan(diff, { sign: true })}` : "";
    }
    if (showPlan && ptsP.length) {   // 計画線の終わりに年間の計画額
      const e = ptsP[ptsP.length - 1], above = endInfo ? e[1] <= endInfo[1] : true;
      const t = el("text", { x: e[0] + 4, y: e[1] + (above ? -8 : 16), "text-anchor": "end", fill: "#66f3ff", "font-size": sm ? 10 : 12, "font-weight": 600 }, svg);
      t.textContent = `計画 ${fmtMan(cP[b])}`;
    }
  }

  // ---- ホバー・キーボード
  const tip = wrap.querySelector(".tip"), hov = el("g", {}, svg);
  idx.forEach((i, k) => {
    const hasA = isNum(act[i]);
    const r = el("rect", { x: Lm + slot * k, y: T, width: slot, height: ph, fill: "transparent", tabindex: 0,
      "aria-label": `${s.months[i]}：月次${label} ${hasA ? fmtMan(act[i]) + "万円" : "実績なし"}、計画 ${fmtMan(plan[i])}万円`, style: "cursor:pointer;outline:none" }, hov);
    const show = () => {
      const rows = [`<b>${esc(s.months[i])}</b>`];
      rows.push(hasA ? `月次 <strong>${fmtMan(act[i])}</strong> 万円` : `月次 実績なし`);
      rows.push(`<span style="color:#66f3ff">月次の計画 ${fmtMan(plan[i])} 万円</span>`);
      if (hasA) { const d = act[i] - plan[i]; rows.push(`計画との差 <span class="${(costLike ? d <= 0 : d >= 0) ? "up" : "down"}">${fmtMan(d, { sign: true })} 万円</span>`); }
      if (isNum(cA[i])) { rows.push(`累計 <strong>${fmtMan(cA[i])}</strong> 万円（計画 ${fmtMan(cP[i])}、差 ${fmtMan(cA[i] - cP[i], { sign: true })}）`); }
      else rows.push(`<span style="color:#66f3ff">累計の計画 ${fmtMan(cP[i])} 万円</span>`);
      if (o.showYoY && isNum(prev[i])) rows.push(`<span style="color:#c9b8ff">前年同月 ${fmtMan(prev[i])} 万円</span>`);
      tip.innerHTML = rows.join("<br>"); tip.classList.add("on");
      const tw = tip.offsetWidth, th = tip.offsetHeight, bbw = wrap.getBoundingClientRect(), sx = bbw.width / W, sy = bbw.height / H;
      const yy = (isNum(cA[i]) && showCum) ? yC(cA[i]) : (hasA ? yM(act[i]) : yM(plan[i]));
      let x = cx(k) * sx + 14, y = yy * sy - th - 10;
      if (x + tw > bbw.width) x = cx(k) * sx - tw - 14; if (x < 0) x = 4; if (y < 0) y = 4;
      tip.style.left = x + "px"; tip.style.top = y + "px";
      hov.querySelectorAll(".hl").forEach(h => h.remove());
      el("rect", { class: "hl", x: Lm + slot * k, y: T, width: slot, height: ph, fill: "rgba(37,217,239,.07)", "pointer-events": "none" }, hov);
    };
    const hide = () => { tip.classList.remove("on"); hov.querySelectorAll(".hl").forEach(h => h.remove()); };
    r.addEventListener("mouseenter", show); r.addEventListener("mousemove", show); r.addEventListener("mouseleave", hide); r.addEventListener("focus", show); r.addEventListener("blur", hide);
  });

  // ---- 文字での要約
  const out = [];
  if (L >= a && L <= b) {
    const d = cA[L] - cP[L];
    out.push(`${s.months[L]}までの累計${label} ${fmtMan(cA[L])}万円（計画 ${fmtMan(cP[L])}万円、差 ${fmtMan(d, { sign: true })}万円）。`);
  }
  const tot = idx.filter(i => isNum(act[i])).reduce((x, i) => x + act[i], 0);
  out.unshift(`${s.months[a]}〜${s.months[b]}の月次${label}の合計 ${fmtMan(tot)}万円。`);
  return out.join(" ");
}
