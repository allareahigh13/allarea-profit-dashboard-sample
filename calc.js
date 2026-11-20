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

/** ある月の売上の内訳（資材費・人件費・利益）。実績がまだ無い月は null。合計は必ず売上と一致する。 */
export function breakdownAt(s, i) {
  if (!isNum(s.sales[i]) || !isNum(s.materials[i]) || !isNum(s.labor[i])) return null;
  const sales = s.sales[i], materials = s.materials[i], labor = s.labor[i];
  return { sales, materials, labor, profit: sales - materials - labor };
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

/* ===================== 案件管理・現場進捗・見積（金額は円） ===================== */
export const CASE_STATUSES = ["見積り中", "受注", "進行中", "請求済", "入金済", "失注", ""];
/** 月ごとの表に出す状況（見積り中・失注・空欄は出さない）。 */
export const MONTH_VISIBLE = ["受注", "進行中", "請求済", "入金済"];

export function caseGrossRate(c) {
  return isNum(c.gross) && isNum(c.amount) && c.amount > 0 ? c.gross / c.amount * 100 : null;
}

/** 状況ごとの件数と金額。 */
export function statusSummary(cases) {
  const out = {};
  for (const st of CASE_STATUSES) out[st] = { count: 0, amount: 0 };
  for (const c of cases) { const k = CASE_STATUSES.includes(c.status) ? c.status : ""; out[k].count++; out[k].amount += isNum(c.amount) ? c.amount : 0; }
  return out;
}

/** 月ごとの集計。「請求済のみ」（年間集計の決まり）と「請求済＋入金済」（月の表の決まり）の両方を出す。 */
export function monthlyCases(cases, months) {
  return months.map(m => {
    const list = cases.filter(c => c.month === m && MONTH_VISIBLE.includes(c.status));
    const sum = (f, k) => list.filter(f).reduce((a, c) => a + (isNum(c[k]) ? c[k] : 0), 0);
    const amount = sum(() => true, "amount"), gross = sum(() => true, "gross");
    return { month: m, count: list.length, amount, gross, grossRate: ratio(gross, amount),
      invoicedOnly: sum(c => c.status === "請求済", "amount"), invoicedPaid: sum(c => c.status === "請求済" || c.status === "入金済", "amount") };
  });
}

/** 受注済みなのに粗利が入っていない案件の数。 */
export function grossMissing(cases) {
  return cases.filter(c => MONTH_VISIBLE.includes(c.status) && !isNum(c.gross)).length;
}

export function pipeline(cases) {
  const s = statusSummary(cases), a = k => s[k].amount;
  return { estimating: a("見積り中"), ordered: a("受注") + a("進行中"), invoiced: a("請求済"), paid: a("入金済"), lost: a("失注") };
}

/* ---- 工程表（日付は "YYYY-MM-DD"） ---- */
export function parseDate(s) { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); }
export function dayDiff(a, b) { return Math.round((parseDate(b) - parseDate(a)) / 86400000); }
export function addDays(s, n) { const t = new Date(parseDate(s) + n * 86400000); return t.toISOString().slice(0, 10); }

/** 計画どおりなら、その日までに何％進んでいるか。 */
export function expectedProgress(task, asOf) {
  const dur = dayDiff(task.start, task.end) + 1, passed = dayDiff(task.start, asOf) + 1;
  return Math.max(0, Math.min(100, passed / dur * 100));
}
export function taskState(task, asOf) {
  if (task.done >= 100) return "完了";
  if (parseDate(asOf) > parseDate(task.end)) return "遅れ";
  if (parseDate(asOf) >= parseDate(task.start)) return task.done + 0.5 < expectedProgress(task, asOf) - 15 ? "遅れ気味" : "進行中";
  return "未着手";
}
/** 現場全体の進み具合（工程の長さで重みをつける）。 */
export function siteProgress(tasks, asOf) {
  if (!tasks.length) return null;
  let w = 0, act = 0, plan = 0;
  for (const t of tasks) { const dur = dayDiff(t.start, t.end) + 1; w += dur; act += dur * t.done; plan += dur * expectedProgress(t, asOf); }
  return { actual: act / w, planned: plan / w, delta: (act - plan) / w, start: tasks.map(t => t.start).sort()[0], end: tasks.map(t => t.end).sort().pop() };
}

/* ---- 見積 ---- */
/** 明細の金額（数量×単価。円未満は切り捨て。端数の決まりは仮）。 */
export function lineAmount(l) { const q = Number(l.qty), p = Number(l.price); return Number.isFinite(q) && Number.isFinite(p) && q > 0 && p >= 0 ? Math.floor(q * p) : 0; }
export function estimateTotals(est) {
  const lines = est.lines || [];
  const subtotal = lines.reduce((a, l) => a + lineAmount(l), 0);
  const overhead = Math.floor(subtotal * Math.max(0, Number(est.overheadPct) || 0) / 100);
  const discount = Math.max(0, Math.floor(Number(est.discount) || 0));
  const taxable = Math.max(0, subtotal + overhead - discount);
  const tax = Math.floor(taxable * Math.max(0, Number(est.taxRate) || 0) / 100);
  const cost = lines.reduce((a, l) => { const q = Number(l.qty), c = Number(l.cost); return a + (Number.isFinite(q) && Number.isFinite(c) && q > 0 && c > 0 ? Math.floor(q * c) : 0); }, 0);
  const hasCost = lines.some(l => Number(l.cost) > 0);
  const gross = hasCost ? taxable - cost : null;
  return { subtotal, overhead, discount, taxable, tax, total: taxable + tax, cost, gross, grossRate: hasCost ? ratio(gross, taxable) : null };
}

/** 日付（YYYY-MM-DD）から、売上月の名前（「12月」など）を作る。読めない日付は null。 */
export function monthLabelOf(dateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || ""));
  if (!m) return null;
  const n = Number(m[2]);
  return n >= 1 && n <= 12 ? n + "月" : null;
}
