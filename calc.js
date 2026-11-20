/* 損益の計算（画面から切り離した部分）。ブラウザと node の両方で使う。
   単位は万円。実績がまだ無い月は null。利益 ＝ 売上 − 原価（原価 ＝ 資材費 ＋ 人件費）。 */

export const SCOPES = ["all", "reform", "staffing"];

const isNum = v => typeof v === "number" && Number.isFinite(v);

/** 配列を足し合わせる。どれかが null の月は null（実績がまだ無い月）。 */
export function addArrays(...arrs) {
  const n = arrs[0].length;
  const out = [];
  for (let i = 0; i < n; i++) {
    let s = 0, none = false;
    for (const a of arrs) { if (!isNum(a[i])) { none = true; break; } s += a[i]; }
    out.push(none ? null : s);
  }
  return out;
}

export function subArrays(a, b) {
  return a.map((v, i) => (isNum(v) && isNum(b[i])) ? v - b[i] : null);
}

/** 累計。null の月から後ろは null。 */
export function cumulative(arr) {
  let s = 0, stop = false;
  return arr.map(v => {
    if (stop || !isNum(v)) { stop = true; return null; }
    s += v; return s;
  });
}

/** 最後に実績がある月の番号（無ければ -1）。 */
export function lastIndex(arr) {
  let L = -1;
  for (let i = 0; i < arr.length; i++) if (isNum(arr[i])) L = i; else break;
  return L;
}

/** 増減率（％）。基準が 0 または無いときは null。 */
export function pctChange(now, base) {
  if (!isNum(now) || !isNum(base) || base === 0) return null;
  return (now - base) / Math.abs(base) * 100;
}

export function ratio(part, whole) {
  if (!isNum(part) || !isNum(whole) || whole === 0) return null;
  return part / whole * 100;
}

/** 目標（上書き）を反映した事業ごとの目標。 */
export function effectiveTargets(data, overrides) {
  const t = {};
  for (const b of data.businesses) {
    const o = (overrides && overrides[b.id]) || {};
    t[b.id] = {
      sales: isNum(o.sales) && o.sales >= 0 ? o.sales : b.salesTarget,
      profit: isNum(o.profit) && o.profit >= 0 ? o.profit : b.profitTarget,
    };
  }
  return t;
}

/** ある範囲（全体／事業）の月ごとの系列を作る。 */
export function buildScope(data, scope, overrides) {
  const bs = scope === "all" ? data.businesses : data.businesses.filter(b => b.id === scope);
  if (!bs.length) throw new Error("範囲が違う: " + scope);
  const tg = effectiveTargets(data, overrides);
  const sales = addArrays(...bs.map(b => b.sales));
  const materials = addArrays(...bs.map(b => b.materials));
  const labor = addArrays(...bs.map(b => b.labor));
  const cost = addArrays(materials, labor);
  const profit = subArrays(sales, cost);
  const p = {
    sales: addArrays(...bs.map(b => b.prev.sales)),
    materials: addArrays(...bs.map(b => b.prev.materials)),
    labor: addArrays(...bs.map(b => b.prev.labor)),
  };
  p.cost = addArrays(p.materials, p.labor);
  p.profit = subArrays(p.sales, p.cost);
  const salesTarget = bs.reduce((a, b) => a + tg[b.id].sales, 0);
  const profitTarget = bs.reduce((a, b) => a + tg[b.id].profit, 0);
  const planSales = data.weights.map(w => salesTarget * w);
  const planProfit = data.weights.map(w => profitTarget * w);
  const planCost = planSales.map((s, i) => s - planProfit[i]);
  return {
    scope, name: scope === "all" ? "全事業（統合）" : bs[0].name, businesses: bs,
    months: data.months, weights: data.weights,
    sales, materials, labor, cost, profit, prev: p,
    target: { sales: salesTarget, profit: profitTarget, cost: salesTarget - profitTarget },
    plan: { sales: planSales, profit: planProfit, cost: planCost },
    L: lastIndex(sales),
  };
}

/** 画面に出す主な数字（当月・累計・計画との差・前月比・前年比）をまとめる。 */
export function summarize(s) {
  const L = s.L;
  if (L < 0) return null;
  const at = (a, i = L) => (i >= 0 && i < a.length && isNum(a[i])) ? a[i] : null;
  const cum = a => cumulative(a)[L];
  const cumPrev = a => cumulative(a)[L];
  const out = { L, month: s.months[L], metrics: {} };
  for (const k of ["sales", "cost", "profit", "materials", "labor"]) {
    const now = at(s[k]);
    const mom = L > 0 ? at(s[k], L - 1) : null;
    const yoy = at(s.prev[k]);
    const cumNow = cum(s[k]);
    const cumYoy = cumulative(s.prev[k])[L];
    out.metrics[k] = {
      now, mom, yoy, momPct: pctChange(now, mom), yoyPct: pctChange(now, yoy),
      cum: cumNow, cumYoy, cumYoyPct: pctChange(cumNow, cumYoy),
    };
  }
  const sumW = s.weights.slice(0, L + 1).reduce((a, b) => a + b, 0);
  for (const k of ["sales", "profit", "cost"]) {
    const planCum = s.plan[k].slice(0, L + 1).reduce((a, b) => a + b, 0);
    const act = out.metrics[k].cum;
    out.metrics[k].target = s.target[k];
    out.metrics[k].planCum = planCum;
    out.metrics[k].diff = act - planCum;                     // 計画との差（実績 − 計画）
    out.metrics[k].diffPct = pctChange(act, planCum);
    out.metrics[k].progress = ratio(act, s.target[k]);       // 目標に対する進捗（％）
    out.metrics[k].planProgress = ratio(planCum, s.target[k]); // 計画どおりなら、いまここ（％）
    out.metrics[k].forecast = sumW > 0 ? Math.round(act / sumW) : null;  // 着地見込み（季節の重みを考えた年間換算）
  }
  const m = out.metrics;
  out.costRate = ratio(m.cost.cum, m.sales.cum);             // 売上原価率（累計）
  out.profitRate = ratio(m.profit.cum, m.sales.cum);
  out.costRateNow = ratio(m.cost.now, m.sales.now);
  out.profitRateNow = ratio(m.profit.now, m.sales.now);
  out.costRatePrev = ratio(cumulative(s.prev.cost)[L], cumulative(s.prev.sales)[L]);
  // 原価の内訳（累計）。原価に対する％と売上に対する％の両方
  const mat = m.materials.cum, lab = m.labor.cum, cost = m.cost.cum, sales = m.sales.cum;
  out.costBreakdown = [
    { key: "materials", name: "資材費", amount: mat, ofCost: ratio(mat, cost), ofSales: ratio(mat, sales),
      yoyPct: m.materials.cumYoyPct },
    { key: "labor", name: "人件費", amount: lab, ofCost: ratio(lab, cost), ofSales: ratio(lab, sales),
      yoyPct: m.labor.cumYoyPct },
  ];
  return out;
}

/** 事業ごとの構成（全体に対する売上・原価・利益の金額と％）。 */
export function composition(data, overrides) {
  const parts = data.businesses.map(b => {
    const s = buildScope(data, b.id, overrides); const sm = summarize(s);
    return { id: b.id, name: b.name, short: b.short, sales: sm.metrics.sales.cum, cost: sm.metrics.cost.cum, profit: sm.metrics.profit.cum };
  });
  const tot = k => parts.reduce((a, p) => a + p[k], 0);
  const ts = tot("sales"), tc = tot("cost"), tp = tot("profit");
  return {
    parts: parts.map(p => ({ ...p, salesPct: ratio(p.sales, ts), costPct: ratio(p.cost, tc), profitPct: ratio(p.profit, tp) })),
    total: { sales: ts, cost: tc, profit: tp },
  };
}

/** 担当者別。範囲で絞る。 */
export function peopleTable(data, scope, uptoIndex) {
  const rows = data.people.filter(p => scope === "all" || p.business === scope).map(p => {
    const take = a => a.slice(0, uptoIndex + 1).reduce((x, v) => x + (isNum(v) ? v : 0), 0);
    const sales = take(p.sales), labor = take(p.labor), profit = sales - labor;
    const bname = data.businesses.find(b => b.id === p.business).short;
    return { name: p.name, business: p.business, businessName: bname, sales, labor, profit, profitRate: ratio(profit, sales) };
  });
  const tot = rows.reduce((a, r) => a + r.sales, 0);
  rows.forEach(r => { r.salesPct = ratio(r.sales, tot); });
  return rows;
}

/** 活動（件数）の累計と、段ごとの通過率。 */
export function funnel(business, uptoIndex) {
  const keys = Object.keys(business.activity);
  const sum = k => business.activity[k].slice(0, uptoIndex + 1).reduce((a, v) => a + (isNum(v) ? v : 0), 0);
  const stages = keys.map(k => ({ name: k, count: sum(k) }));
  stages.forEach((st, i) => { st.fromPrev = i === 0 ? null : ratio(st.count, stages[i - 1].count); st.fromFirst = ratio(st.count, stages[0].count); });
  return stages;
}

export function fmtMan(v, opt = {}) {
  if (!isNum(v)) return "—";
  const r = Math.round(v * 10) / 10;
  const s = Math.abs(r).toLocaleString("ja-JP", { maximumFractionDigits: 1 });
  return (opt.sign ? (r > 0 ? "+" : r < 0 ? "−" : "") : (r < 0 ? "−" : "")) + s;
}
export function fmtPct(v, opt = {}) {
  if (!isNum(v)) return "—";
  const r = Math.round(v * 10) / 10;
  return (opt.sign ? (r > 0 ? "+" : r < 0 ? "−" : "") : (r < 0 ? "−" : "")) + Math.abs(r).toFixed(1) + "%";
}
