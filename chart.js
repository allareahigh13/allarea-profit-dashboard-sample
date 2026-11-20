/* 月次の積み上げ棒（資材費・人件費・利益）＋累計の線＋計画線のグラフ（SVG）。 */
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
  const cs = getComputedStyle(document.documentElement), T = n => cs.getPropertyValue(n).trim();
  const col = {
    axis: T("--axis"), grid: T("--grid"), zero: T("--zero"), bubble: T("--bubble-bg"), label: T("--label"), bg: T("--background"),
    mat: [T("--c-mat2"), T("--c-mat")], lab: [T("--c-lab2"), T("--c-lab")], prof: [T("--c-prof2"), T("--c-prof")], sales: [T("--c-sales2"), T("--c-sales")],
    plan: T("--c-plan"), prev: T("--c-prev"), frame: T("--c-frame"), gold: T("--gold"), goldL: T("--gold-light"), up: T("--up"), down: T("--down"), cyan: T("--cyan-light"),
  };
  const light = document.documentElement.dataset.theme === "light";
  const key = o.metric, L = s.L, N = 12, label = METRIC_LABEL[key];
  const act = s[key], plan = s.plan[key], prev = s.prev[key];
  const cA = C.cumulative(act), cP = C.cumulative(plan), cV = C.cumulative(prev);
  let a = 0, b = N - 1;
  if (o.range === "6") { a = Math.max(0, L - 5); b = L; }
  if (o.range === "3") { a = Math.max(0, L - 2); b = L; }
  const idx = []; for (let i = a; i <= b; i++) idx.push(i);
  const showBars = o.mode !== "cum" && o.ser.bars, showCum = o.mode !== "monthly" && o.ser.cum, showPlan = o.ser.plan;
  const costLike = key === "cost";
  const stacked = key === "sales" || key === "cost";   // 売上＝資材＋人件費＋利益、原価＝資材＋人件費

  const bb = wrap.getBoundingClientRect();
  const W = Math.max(300, Math.round(bb.width) || 1000), H = Math.max(240, Math.round(bb.height) || 420);
  const sm = W < 600, Lm = sm ? 42 : 66, Rm = sm ? 46 : 70, T0 = 38, B = 32;
  const pw = W - Lm - Rm, ph = H - T0 - B, FS = sm ? 10.5 : 14, TS = sm ? 10 : 13, SEG = sm ? 8.5 : 10.5;
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img",
    "aria-label": `月次${label}の積み上げ棒（${key === "sales" ? "資材費・人件費・利益" : key === "cost" ? "資材費・人件費" : "利益"}）と、累計${label}の線、目標の計画線のグラフ。数字は下の要約にも文字で出しています。` });
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
  const yM = v => T0 + ph * (1 - (v - mLo) / ((mHi - mLo) || 1)), yC = v => T0 + ph * (1 - (v - cLo) / ((cHi - cLo) || 1));
  const stM = niceRange(mLo, mHi, 4).st, stC = niceRange(cLo, cHi, 4).st;

  const defs = el("defs", {}, svg);
  const lg = (id, c, vert = true) => { const g = el("linearGradient", { id, x1: 0, y1: 0, x2: vert ? 0 : 1, y2: vert ? 1 : 0 }, defs); el("stop", { offset: "0%", "stop-color": c[0] }, g); el("stop", { offset: "100%", "stop-color": c[1] }, g); };
  lg("gMat", col.mat); lg("gLab", col.lab); lg("gProf", col.prof); lg("gSales", col.sales); lg("gNeg", col.lab); lg("gLine", [light ? "#e0a000" : "#fff4b8", col.gold], false);
  const f = el("filter", { id: "glow", x: "-20%", y: "-20%", width: "140%", height: "140%" }, defs); el("feGaussianBlur", { stdDeviation: 4, result: "b" }, f); const fm = el("feMerge", {}, f); el("feMergeNode", { in: "b" }, fm); el("feMergeNode", { in: "SourceGraphic" }, fm);
  const fb = el("filter", { id: "blur8", x: "-30%", y: "-60%", width: "160%", height: "220%" }, defs); el("feGaussianBlur", { stdDeviation: 9 }, fb);
  const fb2 = el("filter", { id: "blur3", x: "-30%", y: "-60%", width: "160%", height: "220%" }, defs); el("feGaussianBlur", { stdDeviation: 3.2 }, fb2);

  for (let v = Math.ceil(mLo / stM) * stM; v <= mHi + 1e-9; v += stM) {
    const y = yM(v);
    el("line", { x1: Lm, x2: Lm + pw, y1: y, y2: y, stroke: v === 0 ? col.zero : col.grid, "stroke-width": v === 0 ? 1.4 : 1 }, svg);
    const t = el("text", { x: Lm - 8, y: y + 4, "text-anchor": "end", fill: col.axis, "font-size": TS }, svg); t.textContent = Math.round(v).toLocaleString("ja-JP");
  }
  for (let v = Math.ceil(cLo / stC) * stC; v <= cHi + 1e-9; v += stC) {
    const t = el("text", { x: Lm + pw + 8, y: yC(v) + 4, fill: col.axis, "font-size": TS }, svg); t.textContent = Math.round(v).toLocaleString("ja-JP");
  }
  const t1 = el("text", { x: sm ? 2 : Lm - 60, y: T0 - 18, fill: col.axis, "font-size": sm ? 10 : 12 }, svg); t1.textContent = `月次${label}（万円）`;
  const t2 = el("text", { x: W - 2, y: T0 - 18, fill: col.axis, "font-size": sm ? 10 : 12, "text-anchor": "end" }, svg); t2.textContent = `累計${label}（万円）`;

  const n = idx.length, slot = pw / n, bw = Math.min(58, slot * (sm ? 0.72 : 0.6)), cx = k => Lm + slot * k + slot / 2;
  idx.forEach((i, k) => { const t = el("text", { x: cx(k), y: H - 10, "text-anchor": "middle", fill: i > L ? col.axis : col.axis, opacity: i > L ? .6 : 1, "font-size": TS }, svg); t.textContent = s.months[i]; });

  // 見やすい印：下に濃い縁をしいてから、明るい色で描く
  const mark = (g, x1, x2, y, color, w = 3) => {
    el("line", { x1, x2, y1: y, y2: y, stroke: col.bg, "stroke-width": w + 3, "stroke-linecap": "round", opacity: .75 }, g);
    el("line", { x1, x2, y1: y, y2: y, stroke: color, "stroke-width": w, "stroke-linecap": "round" }, g);
  };

  // ---- 月次の棒（積み上げ）
  if (showBars) {
    idx.forEach((i, k) => {
      const v = act[i], g = el("g", {}, svg), x0 = cx(k) - bw / 2;
      if (isNum(v)) {
        const bd = stacked ? C.breakdownAt(s, i) : null;
        const segs = [];   // 下から順に
        if (key === "sales" && bd) { segs.push(["資材費", bd.materials, "gMat"], ["人件費", bd.labor, "gLab"], ["利益", bd.profit, bd.profit >= 0 ? "gProf" : "gNeg"]); }
        else if (key === "cost") { segs.push(["資材費", s.materials[i], "gMat"], ["人件費", s.labor[i], "gLab"]); }
        else { segs.push([label, v, v >= 0 ? "gProf" : "gNeg"]); }
        const posTotal = segs.filter(x => x[1] > 0).reduce((q, x) => q + x[1], 0);
        const y0 = yM(0), yTop = yM(posTotal);
        const cid = "cp" + k + "_" + i;
        const cp = el("clipPath", { id: cid }, defs); el("rect", { x: x0, y: Math.min(yTop, y0), width: bw, height: Math.max(2, Math.abs(y0 - yTop)), rx: 6 }, cp);
        const bar = el("g", { "clip-path": `url(#${cid})`, filter: "url(#glow)", class: reduce() ? "" : "bar-rect" }, g);
        if (!reduce()) { bar.style.transformBox = "fill-box"; bar.style.transformOrigin = "bottom"; bar.style.animationDelay = (k * 40) + "ms"; }
        let acc = 0;
        segs.forEach(([nm, val, grad]) => {
          if (val > 0) {
            const yb = yM(acc), yt = yM(acc + val), h = Math.max(0.5, yb - yt);
            el("rect", { x: x0, y: yt, width: bw, height: h, fill: `url(#${grad})` }, bar);
            if (acc > 0) el("line", { x1: x0, x2: x0 + bw, y1: yb, y2: yb, stroke: col.bg, "stroke-width": 1.2, opacity: .55 }, bar);
            if (h >= 17 && stacked && !sm) {
              const t = el("text", { x: cx(k), y: yt + h / 2 + SEG / 2 - 1, "text-anchor": "middle", fill: "#fff", stroke: "rgba(0,0,0,.45)", "stroke-width": 2.4, "paint-order": "stroke", "font-size": SEG, "font-weight": 700, class: reduce() ? "" : "pt", style: reduce() ? "" : `animation-delay:${k * 40 + 450}ms` }, g);
              t.textContent = Math.round(val).toLocaleString("ja-JP");
            }
            acc += val;
          }
        });
        el("rect", { x: x0 + 3, y: yTop, width: bw - 6, height: 2, rx: 1, fill: "rgba(255,255,255,.55)" }, bar);
        // ガラスのつや（左の細い光の帯）
        el("rect", { x: x0 + bw * 0.14, y: yTop + 2, width: Math.max(2, bw * 0.16), height: Math.max(0, y0 - yTop - 4), rx: 2, fill: "rgba(255,255,255,.17)" }, bar);
        // 棒全体を、1つの薄い黄緑のネオンの枠で囲む（区分ごとには囲まない）
        el("rect", { x: x0 - 0.8, y: Math.min(yTop, y0) - 0.8, width: bw + 1.6, height: Math.max(2, Math.abs(y0 - yTop)) + 1.6, rx: 6.5, fill: "none", stroke: col.frame, "stroke-width": 1.3, opacity: .8, style: `filter:drop-shadow(0 0 3px ${col.frame})` }, g);
        // 利益がマイナスのとき：0 より下へピンクで出す
        const negSeg = segs.find(x => x[1] < 0);
        if (negSeg) { const yb = yM(0), yt = yM(negSeg[1]); el("rect", { x: x0, y: yb, width: bw, height: Math.max(2, yt - yb), rx: 5, fill: "url(#gNeg)", filter: "url(#glow)" }, g); }
        const topLabelY = (v >= 0 ? yTop : yM(v)) - 8;
        if (!sm || i === L) {
        const tx = el("text", { x: cx(k), y: v >= 0 ? topLabelY : yM(v) + 16, "text-anchor": "middle", fill: col.label, "font-size": FS, "font-weight": 700, class: reduce() ? "" : "pt", style: reduce() ? "" : `animation-delay:${k * 40 + 450}ms` }, g);
        tx.textContent = Math.round(v).toLocaleString("ja-JP");
        }
      } else if (showPlan) {   // まだ実績が無い月は、計画だけを枠線で見せる
        const y0 = yM(0), y1 = yM(plan[i]), top = Math.min(y0, y1), hgt = Math.max(2, Math.abs(y1 - y0));
        el("rect", { x: x0, y: top, width: bw, height: hgt, rx: 6, fill: "rgba(125,255,155,.06)", stroke: col.plan, "stroke-opacity": .6, "stroke-dasharray": "4 3" }, g);
      }
      if (showPlan && isNum(v)) mark(g, x0 - 6, x0 + bw + 6, yM(plan[i]), col.plan, 3);            // 計画：明るい緑の太い横線
      if (o.showYoY && isNum(prev[i]) && isNum(v)) {                                               // 前年：ラベンダーの菱形と横線
        const py = yM(prev[i]);
        mark(g, x0 - 6, x0 + bw + 6, py, col.prev, 2.4);
        el("path", { d: `M${x0 + bw + 10} ${py - 5.5}l5.5 5.5l-5.5 5.5l-5.5 -5.5z`, fill: col.prev, stroke: col.bg, "stroke-width": 1.2 }, g);
      }
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
      const i1 = ptsA[k][2], i2 = ptsA[k + 1][2], avg = ((cA[i1] - cP[i1]) + (cA[i2] - cP[i2])) / 2;
      const good = costLike ? avg <= 0 : avg >= 0, kk1 = idx.indexOf(i1), kk2 = idx.indexOf(i2);
      el("path", { d: `M${ptsA[k][0]} ${ptsA[k][1]}L${ptsA[k + 1][0]} ${ptsA[k + 1][1]}L${ptsP[kk2][0]} ${ptsP[kk2][1]}L${ptsP[kk1][0]} ${ptsP[kk1][1]}Z`, fill: good ? "rgba(75,227,181,.22)" : "rgba(242,106,157,.22)" }, svg);
    }
    // 計画線：明るい緑の太い点線（下に濃い縁と、ぼんやりした光）
    if (showPlan && ptsP.length) {
      const dp = smooth(ptsP);
      el("path", { d: dp, fill: "none", stroke: col.plan, "stroke-width": 8, opacity: .22, filter: "url(#blur3)" }, svg);
      el("path", { d: dp, fill: "none", stroke: col.bg, "stroke-width": 6.5, opacity: .6, "stroke-linecap": "round" }, svg);
      el("path", { d: dp, fill: "none", stroke: col.plan, "stroke-width": 3, "stroke-dasharray": "11 7", "stroke-linecap": "round" }, svg);
    }
    // 前年の累計：ラベンダーの実線と丸印
    if (o.showYoY && ptsV.length) {
      const dv = smooth(ptsV);
      el("path", { d: dv, fill: "none", stroke: col.bg, "stroke-width": 5.5, opacity: .55, "stroke-linecap": "round" }, svg);
      el("path", { d: dv, fill: "none", stroke: col.prev, "stroke-width": 2.6, "stroke-linecap": "round" }, svg);
      ptsV.forEach(p => el("circle", { cx: p[0], cy: p[1], r: sm ? 2.6 : 3.8, fill: col.bg, stroke: col.prev, "stroke-width": 2 }, svg));
    }
    if (ptsA.length) {
      const d = smooth(ptsA);
      // もや（ゆっくり明るさが変わる光）
      el("path", { d, fill: "none", stroke: col.gold, "stroke-width": 26, "stroke-linecap": "round", filter: "url(#blur8)", opacity: .26, class: "haze" }, svg);
      el("path", { d, fill: "none", stroke: col.goldL, "stroke-width": 11, "stroke-linecap": "round", filter: "url(#blur3)", opacity: .45, class: "haze2" }, svg);
      el("path", { d, fill: "none", stroke: col.bg, "stroke-width": 7, opacity: .5, "stroke-linecap": "round" }, svg);
      const main = el("path", { d, fill: "none", stroke: "url(#gLine)", "stroke-width": 3.6, "stroke-linecap": "round", class: reduce() ? "" : "line-draw" }, svg);
      main.style.setProperty("--len", Math.ceil(main.getTotalLength()));
      if (!reduce()) {
        el("path", { d, fill: "none", stroke: "#fff", "stroke-width": 3.2, "stroke-linecap": "round", "stroke-dasharray": "30 970", opacity: .8, class: "trail", style: "mix-blend-mode:screen" }, svg);
        // 線に沿って流れる光の粒（2つ）
        [0, 3.5].forEach(delay => {
          const c = el("circle", { r: sm ? 3 : 4.2, fill: "#fff", filter: "url(#glow)", opacity: .95 }, svg);
          const am = el("animateMotion", { dur: "7s", repeatCount: "indefinite", begin: `${delay + 1.5}s`, path: d, rotate: "auto" }, c); void am;
        });
      }
      ptsA.forEach((p, k) => el("circle", { cx: p[0], cy: p[1], r: sm ? 3.4 : 5, fill: col.goldL, stroke: col.bg, "stroke-width": 1.5, class: reduce() ? "" : "pt", style: reduce() ? "" : `animation-delay:${400 + k * 90}ms;filter:drop-shadow(0 0 6px ${col.gold})` }, svg));
      const last = ptsA[ptsA.length - 1];
      if (!reduce()) el("circle", { cx: last[0], cy: last[1], r: 10, fill: col.gold, class: "pulse" }, svg);
      endInfo = last;
      const i = last[2], diff = cA[i] - cP[i], good = costLike ? diff <= 0 : diff >= 0;
      const bw2 = sm ? 118 : 150, bx = sm ? Lm + 4 : Math.min(Math.max(last[0] - bw2 / 2, Lm + 4), W - Rm - bw2 + 20), by = sm ? T0 + 2 : Math.max(4, last[1] - 70);
      const g = el("g", {}, svg);
      el("rect", { x: bx, y: by, width: bw2, height: 52, rx: 8, fill: col.bubble, stroke: col.cyan, "stroke-opacity": .6 }, g);
      const l1 = el("text", { x: bx + bw2 / 2, y: by + 16, "text-anchor": "middle", fill: col.axis, "font-size": 11 }, g); l1.textContent = `${s.months[i]}までの累計${label}`;
      const l2 = el("text", { x: bx + bw2 / 2, y: by + 34, "text-anchor": "middle", fill: light ? "#8a5a00" : "#ffe18a", "font-size": sm ? 14 : 16, "font-weight": 700 }, g); l2.textContent = `${fmtMan(cA[i])} 万円`;
      const l3 = el("text", { x: bx + bw2 / 2, y: by + 47, "text-anchor": "middle", fill: good ? col.up : col.down, "font-size": 11 }, g); l3.textContent = showPlan ? `計画との差 ${fmtMan(diff, { sign: true })}` : "";
    }
    if (showPlan && ptsP.length) {   // 計画線の終わりに年間の計画額
      const e = ptsP[ptsP.length - 1], above = endInfo ? e[1] <= endInfo[1] : true;
      const t = el("text", { x: e[0] + 4, y: e[1] + (above ? -9 : 17), "text-anchor": "end", fill: col.plan, stroke: col.bg, "stroke-width": 3, "paint-order": "stroke", "font-size": sm ? 10 : 12.5, "font-weight": 700 }, svg);
      t.textContent = `計画 ${fmtMan(cP[b])}`;
    }
  }

  // ---- ホバー・キーボード
  const tip = wrap.querySelector(".tip"), hov = el("g", {}, svg);
  idx.forEach((i, k) => {
    const hasA = isNum(act[i]);
    const r = el("rect", { x: Lm + slot * k, y: T0, width: slot, height: ph, fill: "transparent", tabindex: 0,
      "aria-label": `${s.months[i]}：月次${label} ${hasA ? fmtMan(act[i]) + "万円" : "実績なし"}、計画 ${fmtMan(plan[i])}万円`, style: "cursor:pointer;outline:none" }, hov);
    const show = () => {
      const rows = [`<b>${esc(s.months[i])}</b>`];
      rows.push(hasA ? `月次 <strong>${fmtMan(act[i])}</strong> 万円` : `月次 実績なし`);
      const bd = hasA && key === "sales" ? C.breakdownAt(s, i) : null;
      if (bd) {
        const pc = x => (bd.sales ? ` <span style="opacity:.75">${(x / bd.sales * 100).toFixed(1)}%</span>` : "");
        rows.push(`<span style="color:var(--c-mat2)">■</span> 資材費 ${fmtMan(bd.materials)} 万円${pc(bd.materials)}`);
        rows.push(`<span style="color:var(--c-lab2)">■</span> 人件費 ${fmtMan(bd.labor)} 万円${pc(bd.labor)}`);
        rows.push(`<span style="color:var(--c-prof2)">■</span> 利益 ${fmtMan(bd.profit)} 万円${pc(bd.profit)}`);
      }
      rows.push(`<span style="color:var(--c-plan)">━</span> 月次の計画 ${fmtMan(plan[i])} 万円`);
      if (hasA) { const d = act[i] - plan[i]; rows.push(`計画との差 <span class="${(costLike ? d <= 0 : d >= 0) ? "up" : "down"}">${fmtMan(d, { sign: true })} 万円</span>`); }
      if (isNum(cA[i])) rows.push(`累計 <strong>${fmtMan(cA[i])}</strong> 万円（計画 ${fmtMan(cP[i])}、差 ${fmtMan(cA[i] - cP[i], { sign: true })}）`);
      else rows.push(`<span style="color:var(--c-plan)">累計の計画 ${fmtMan(cP[i])} 万円</span>`);
      if (o.showYoY && isNum(prev[i])) rows.push(`<span style="color:var(--c-prev)">◆</span> 前年同月 ${fmtMan(prev[i])} 万円`);
      tip.innerHTML = rows.join("<br>"); tip.classList.add("on");
      const tw = tip.offsetWidth, th = tip.offsetHeight, bbw = wrap.getBoundingClientRect(), sx = bbw.width / W, sy = bbw.height / H;
      const yy = (isNum(cA[i]) && showCum) ? yC(cA[i]) : (hasA ? yM(act[i]) : yM(plan[i]));
      let x = cx(k) * sx + 14, y = yy * sy - th - 10;
      if (x + tw > bbw.width) x = cx(k) * sx - tw - 14; if (x < 0) x = 4; if (y < 0) y = 4;
      tip.style.left = x + "px"; tip.style.top = y + "px";
      hov.querySelectorAll(".hl").forEach(h => h.remove());
      el("rect", { class: "hl", x: Lm + slot * k, y: T0, width: slot, height: ph, fill: "rgba(128,170,255,.10)", "pointer-events": "none" }, hov);
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
  if (key === "sales") {
    const rng = idx.filter(i => isNum(act[i])), sum = k => rng.reduce((x, i) => x + s[k][i], 0), sl = sum("sales");
    if (sl) out.push(`この期間の内訳：資材費 ${fmtMan(sum("materials"))}万円（${(sum("materials") / sl * 100).toFixed(1)}%）、人件費 ${fmtMan(sum("labor"))}万円（${(sum("labor") / sl * 100).toFixed(1)}%）、利益 ${fmtMan(sum("profit"))}万円（${(sum("profit") / sl * 100).toFixed(1)}%）。`);
  }
  return out.join(" ");
}
