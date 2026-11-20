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

/* ===================== アラート・商談記録の叩き台・職人の了承 ===================== */
export const LEVEL_ORDER = { "高": 0, "中": 1, "低": 2 };

/** 現場の「いま」：何をしているか・どこまで進んだか・次は何か。 */
export function siteNow(tasks, asOf) {
  if (!tasks.length) return null;
  const doing = tasks.filter(t => t.done < 100 && parseDate(asOf) >= parseDate(t.start));
  const next = tasks.find(t => t.done < 100 && parseDate(asOf) < parseDate(t.start));
  const finished = tasks.filter(t => t.done >= 100);
  return { doing, next: next || null, lastDone: finished.length ? finished[finished.length - 1] : null, doneCount: finished.length, total: tasks.length };
}

/** 抜け漏れ・遅れのアラート。入力：{ cases, dispatches, reports, asOf }。各アラートは決まった id を持つ（確認済みにできる）。 */
export function buildAlerts({ cases, dispatches = [], reports = [], memos = [], orders = [], asOf }) {
  const out = [], add = a => out.push(a);
  const days = d => dayDiff(d, asOf);
  for (const c of cases) {
    const active = c.status === "受注" || c.status === "進行中";
    if (active && c.tasks.length) {
      c.tasks.forEach((t, i) => {
        const st = taskState(t, asOf);
        if (st === "遅れ") add({ id: `late:${c.id}:${i}`, level: "高", kind: "遅れ", caseId: c.id, title: `工程の遅れ：${t.name}`, detail: `${c.name}。終了予定の ${t.end} を過ぎていますが、進み具合は ${Math.round(t.done)}% です。`, action: "工程表で、遅れの理由と新しい日程を確認する" });
        else if (st === "遅れ気味") add({ id: `slow:${c.id}:${i}`, level: "中", kind: "遅れ", caseId: c.id, title: `工程が遅れ気味：${t.name}`, detail: `${c.name}。計画どおりなら ${Math.round(expectedProgress(t, asOf))}% のところ、${Math.round(t.done)}% です。`, action: "職人に状況を確認する" });
      });
    }
    if (c.status === "進行中" && c.stage === 3) {   // 施工中は、毎日の日報が要る
      const mine = reports.filter(r => r.caseId === c.id).map(r => r.date).sort();
      const last = mine.length ? mine[mine.length - 1] : null, gap = last ? days(last) : null;
      if (last === null) add({ id: `rep:${c.id}`, level: "高", kind: "日報", caseId: c.id, title: "日報が1件もありません", detail: `${c.name}。施工中ですが、日報の記録がありません。`, action: "現場の担当者に、日報と写真を上げてもらう" });
      else if (gap >= 3) add({ id: `rep:${c.id}`, level: "高", kind: "日報", caseId: c.id, title: `日報が ${gap}日 止まっています`, detail: `${c.name}。最後の日報は ${last} です。`, action: "現場の状況を確認する" });
      else if (gap >= 1) add({ id: `rep:${c.id}`, level: "中", kind: "日報", caseId: c.id, title: "今日の日報がまだです", detail: `${c.name}。最後の日報は ${last} です。`, action: "今日の日報と写真を上げてもらう" });
    }
    const pendingChange = reports.filter(r => r.caseId === c.id && r.change && r.change.flag && r.change.approval === "未承認");
    if (pendingChange.length) add({ id: `chg:${c.id}`, level: "高", kind: "追加・変更", caseId: c.id, title: `追加・変更工事の承認待ち（${pendingChange.length}件）`, detail: `${c.name}。${pendingChange[0].change.text || "内容は日報を確認"}`, action: "費用と工期への影響を、お客様に提示して承認をもらう" });
    if (active && c.tasks.length) {
      const start = c.tasks.map(t => t.start).sort()[0], untilStart = dayDiff(asOf, start), cl = c.checklist || {};
      const labels = { neighborhood: "近隣挨拶", materials: "資材の手配", craftsmen: "職人の手配", curing: "養生の準備" };
      const missing = Object.keys(labels).filter(k => c.checklist && !cl[k]).map(k => labels[k]);
      if (untilStart >= 0 && untilStart <= 7 && missing.length) add({ id: `prep:${c.id}`, level: untilStart <= 3 ? "高" : "中", kind: "着工前", caseId: c.id, title: `着工まで ${untilStart}日：準備が終わっていません`, detail: `${c.name}。未完了：${missing.join("、")}。`, action: "着工前の準備を終わらせる" });
    }
    if (active && (c.contractDoc || "未") === "未") add({ id: `doc:${c.id}`, level: "中", kind: "契約", caseId: c.id, title: `${c.contractType === "元請け経由" ? "発注書" : "契約書"}がまだです`, detail: `${c.name}。受注の状態ですが、${c.contractType === "元請け経由" ? "発注書の受領" : "契約書の締結"}が記録されていません。`, action: "書類をそろえ、案件に記録する" });
    if (c.status === "見積り中" && c.quotedOn && days(c.quotedOn) >= 14) add({ id: `quote:${c.id}`, level: "低", kind: "見積", caseId: c.id, title: `見積の返事待ちが ${days(c.quotedOn)}日`, detail: `${c.name}。見積の提出日は ${c.quotedOn} です。`, action: "お客様に、結果の確認の連絡をする" });
  }
  for (const d of dispatches) {
    const c = cases.find(x => x.id === d.caseId); if (!c) continue;
    const t = c.tasks[d.taskIdx];
    if (d.status === "相談") add({ id: `consult:${d.id}`, level: "高", kind: "職人の相談", caseId: c.id, title: `職人から「代表に相談」：${d.craftsman}`, detail: `${c.name}の「${t ? t.name : ""}」（候補 ${d.start}〜${d.end}）。都合がつかないとの連絡です。${d.memo ? "ひと言：" + d.memo : ""}`, action: "別の日程を決め、もう一度依頼する" });
    if (d.status === "依頼中") { const w = days(d.sentOn); if (w >= 2) add({ id: `wait:${d.id}`, level: w >= 4 ? "高" : "中", kind: "職人の確認", caseId: c.id, title: `職人の確認待ちが ${w}日：${d.craftsman}`, detail: `${c.name}の「${t ? t.name : ""}」（候補 ${d.start}〜${d.end}）。依頼日は ${d.sentOn} です。`, action: "職人に、確認ボタンを押すよう連絡する" }); }
  }
  for (const o of orders) {   // 資材の発注期限（着工に間に合わせる。早すぎる発注は現場の邪魔になるので、期限に近づいてから知らせる）
    const c = cases.find(x => x.id === o.caseId), t = c && c.tasks[o.taskIdx];
    if (!c || !t || t.done >= 100 || !["受注", "進行中"].includes(c.status)) continue;
    const d = orderDue(o, t, asOf);
    if (d.state === "期限切れ") add({ id: `ord:${o.id}`, level: "高", kind: "資材発注", caseId: c.id, title: `資材の発注が間に合っていません：${o.name}`, detail: `${c.name}の「${t.name}」（着工 ${t.start}）。発注の期限は ${d.orderBy} で、${-d.daysLeft}日過ぎています。納品まで ${o.leadDays}日かかります。`, action: "すぐに発注し、納品日を確認する（遅れるなら、工程を調整する）" });
    else if (d.state === "期限間近") add({ id: `ord:${o.id}`, level: d.daysLeft <= 1 ? "中" : "低", kind: "資材発注", caseId: c.id, title: `資材の発注期限が近づいています：${o.name}`, detail: `${c.name}の「${t.name}」（着工 ${t.start}）。${d.orderBy}（あと${d.daysLeft}日）までに発注します。納品まで ${o.leadDays}日かかります。`, action: "期限までに発注して、「発注済み」にチェックを入れる" });
  }
  for (const m of memos) {   // 処理されていないメモのリマインド
    if (m.status === "処理済") continue;
    const age = dayDiff(m.date, asOf), c = m.caseId ? cases.find(x => x.id === m.caseId) : null, where = c ? c.name : "全体";
    const lv = memoLevel(m, asOf);
    if (lv) add({ id: `memo:${m.id}`, level: lv.level, kind: "メモ", caseId: m.caseId || "", title: lv.title, detail: `${where}（${m.kind}・${age}日前・${m.author}）：${m.text}`, action: "内容を処理して、処理済みにする" });
  }
  return out.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || String(a.caseId).localeCompare(String(b.caseId)));
}

/** 商談の記録（文字起こしやメモ）から、叩き台を作る。AI ではなく、決まった言葉の規則で拾う（音声の解析は未接続）。 */
const MEETING_RULES = {
  requests: ["したい", "希望", "お願い", "ほしい", "欲しい", "変えたい", "交換", "張替", "張り替え", "直したい", "気になる", "困って"],
  budget: ["予算", "万円", "円まで", "円くらい", "円以内"],
  schedule: ["いつ", "までに", "着工", "工期", "完了", "引っ越し", "来月", "今月", "年内", "年明け"],
  agree: ["それでお願いします", "進めてください", "決めました", "決定", "それでいきます", "合意", "契約します", "お受けする"],
  decline: ["見送り", "やめます", "他社", "検討の結果", "高すぎ", "今回は"],
};
const ITEM_RULES = [["ユニットバス交換", /ユニットバス|お風呂|浴室|バス/], ["システムキッチン交換", /キッチン|台所/], ["トイレ交換", /トイレ|便器/], ["フローリング張替", /フローリング|床/], ["クロス張替", /クロス|壁紙/], ["解体・撤去工事", /解体|撤去/], ["電気工事", /電気|コンセント|照明/], ["給排水工事", /給排水|水道|配管/]];
export function extractMeeting(text, templates = []) {
  const sentences = String(text || "").split(/[。\n!！?？]+/).map(s => s.trim()).filter(Boolean);
  const has = (s, ws) => ws.some(w => s.includes(w));
  const requests = sentences.filter(s => has(s, MEETING_RULES.requests)), schedule = sentences.filter(s => has(s, MEETING_RULES.schedule));
  const agree = sentences.filter(s => has(s, MEETING_RULES.agree)), decline = sentences.filter(s => has(s, MEETING_RULES.decline));
  let budget = null;
  for (const s of sentences.filter(x => has(x, MEETING_RULES.budget))) {
    const m = /([\d,.]+)\s*万円/.exec(s) || null, y = /([\d,]{5,})\s*円/.exec(s) || null;
    if (m) budget = Math.round(parseFloat(m[1].replace(/,/g, "")) * 10000); else if (y) budget = parseInt(y[1].replace(/,/g, ""), 10);
    if (budget) break;
  }
  const lines = [];
  for (const [name, re] of ITEM_RULES) {
    if (!re.test(text || "")) continue;
    const tpl = templates.find(t => t.name === name), area = new RegExp(String.raw`(?:${re.source})[^。\n]{0,12}?([\d.]+)\s*(?:㎡|平米|m2)`).exec(text || "");
    lines.push({ name, qty: tpl && tpl.unit === "㎡" ? (area ? parseFloat(area[1]) : 1) : 1, unit: tpl ? tpl.unit : "式", price: tpl ? tpl.price : 0, cost: "" });
  }
  const result = decline.length && !agree.length ? "不成立" : agree.length && !decline.length ? "合意" : "検討中";
  return { requests, schedule, decisions: agree, declines: decline, budget, lines, resultGuess: result };
}

/** 職人の依頼を、工程表に反映する（了承なら日程を確定、依頼中なら「確認待ち」の印）。元の配列は変えない。 */
export function applyDispatches(cases, dispatches) {
  return cases.map(c => {
    const mine = dispatches.filter(d => d.caseId === c.id);
    if (!mine.length) return c;
    const tasks = c.tasks.map(t => ({ ...t }));
    for (const d of mine) {
      const t = tasks[d.taskIdx]; if (!t) continue;
      if (d.status === "了承") { t.start = d.start; t.end = d.end; t.confirmed = true; t.craftsman = d.craftsman; t.pending = null; }
      else if (d.status === "依頼中" || d.status === "相談") { t.pending = { craftsman: d.craftsman, start: d.start, end: d.end, status: d.status }; if (!t.craftsman) t.craftsman = d.craftsman; }
    }
    return { ...c, tasks };
  });
}

/* ===================== 現場ごとの収支（金額は円） ===================== */
export const originOf = c => (c.contractType === "直接" ? "個人（直接）" : c.contractor);
export const kindOf = c => (c.contractType === "直接" ? "個人発注" : "元請け経由");

/** 1現場の収支。売上は「進み具合に応じた出来高」、コストはこれまでにかかった実績。 */
export function siteMoney(c, fin) {
  const costs = { materials: 0, labor: 0, subcontract: 0, other: 0, ...(fin.costs || {}) };
  const cost = costs.materials + costs.labor + costs.subcontract + costs.other;
  const progress = Math.max(0, Math.min(100, fin.progress));
  const earned = c.amount * progress / 100, profit = earned - cost, plannedProfit = c.amount - fin.plannedCost;
  const forecastCost = progress > 0 ? cost / (progress / 100) : null, forecastProfit = forecastCost == null ? null : c.amount - forecastCost;
  return { id: c.id, name: c.name, person: c.person, contractor: c.contractor, origin: originOf(c), kind: kindOf(c), month: c.month, status: c.status,
    start: fin.start, end: fin.end, days: dayDiff(fin.start, fin.end) + 1, progress, planned: c.amount, plannedCost: fin.plannedCost, plannedProfit, plannedMargin: ratio(plannedProfit, c.amount),
    earned, cost, costs, profit, margin: ratio(profit, earned), marginDiff: (ratio(profit, earned) ?? 0) - (ratio(plannedProfit, c.amount) ?? 0),
    forecastProfit, forecastMargin: forecastProfit == null ? null : ratio(forecastProfit, c.amount) };
}
export function siteMoneyRows(cases, finMap) {
  return cases.filter(c => finMap[c.id] && finMap[c.id].progress > 0).map(c => siteMoney(c, finMap[c.id]));
}
export function moneyTotals(rows) {
  const sum = k => rows.reduce((a, r) => a + r[k], 0), earned = sum("earned"), profit = sum("profit");
  return { count: rows.length, planned: sum("planned"), plannedCost: sum("plannedCost"), earned, cost: sum("cost"), profit, margin: ratio(profit, earned),
    plus: rows.filter(r => r.profit > 0).length, minus: rows.filter(r => r.profit < 0).length, days: rows.length ? Math.round(sum("days") / rows.length) : 0 };
}
export function groupMoney(rows, keyFn) {
  const m = new Map();
  for (const r of rows) { const k = keyFn(r); if (!m.has(k)) m.set(k, []); m.get(k).push(r); }
  return [...m.entries()].map(([key, list]) => ({ key, ...moneyTotals(list) })).sort((a, b) => b.profit - a.profit);
}

/** 処理されていないメモを、どれくらい放置したかで、重さを決める。 */
export function memoLevel(m, asOf) {
  if (m.status === "処理済") return null;
  const age = dayDiff(m.date, asOf);
  if (m.due && parseDate(m.due) < parseDate(asOf)) return { level: "高", title: `メモの期限が過ぎています（${dayDiff(m.due, asOf)}日）` };
  const t = m.kind === "要確認" ? { mid: 1, hi: 3 } : m.kind === "あとで整理" ? { mid: 3, hi: 7 } : { mid: 14, hi: 30 };
  if (age >= t.hi) return { level: "高", title: `処理されていないメモが ${age}日 たまっています` };
  if (age >= t.mid) return { level: "中", title: `処理されていないメモ（${age}日）` };
  return null;
}

/* ===================== 担当者別（経営の分析用） ===================== */
const sumTo = (a, upto) => a.slice(0, upto + 1).reduce((x, v) => x + (isNum(v) ? v : 0), 0);

/** 人材紹介のアドバイザー1人の数字（期初〜upto 月）。単価の単位は売上と同じ（万円）。 */
export function advisorStats(adv, upto) {
  const interviews = sumTo(adv.interviews, upto), hours = sumTo(adv.hours, upto), recommended = sumTo(adv.recommended, upto),
    offers = sumTo(adv.offers, upto), hires = sumTo(adv.hires, upto), sales = sumTo(adv.sales, upto);
  return { name: adv.name, interviews, hours, recommended, offers, hires, sales,
    unitPrice: hires ? sales / hires : null, hireRate: ratio(hires, interviews), salesPerHour: hours ? sales / hours : null, salesPerInterview: interviews ? sales / interviews : null,
    recRate: ratio(recommended, interviews), offerRate: ratio(offers, recommended), acceptRate: ratio(hires, offers), minutesPerInterview: interviews ? hours * 60 / interviews : null };
}
export function teamStats(advisors, upto) {
  const list = advisors.map(a => advisorStats(a, upto)), sum = k => list.reduce((x, a) => x + a[k], 0);
  const interviews = sum("interviews"), hours = sum("hours"), recommended = sum("recommended"), offers = sum("offers"), hires = sum("hires"), sales = sum("sales");
  return { list, total: { interviews, hours, recommended, offers, hires, sales, unitPrice: hires ? sales / hires : null, hireRate: ratio(hires, interviews), salesPerHour: hours ? sales / hours : null,
    salesPerInterview: interviews ? sales / interviews : null, recRate: ratio(recommended, interviews), offerRate: ratio(offers, recommended), acceptRate: ratio(hires, offers) } };
}
/** 平均との差（％）。平均が0または無いときは null。 */
export const vsAvg = (v, avg) => (isNum(v) && isNum(avg) && avg !== 0 ? (v - avg) / Math.abs(avg) * 100 : null);

/** リフォーム：担当者ごとの売上・コスト・利益・現場数・受注率。現場の収支（siteMoneyRows）と、案件の状況から作る。 */
export function reformPeople(moneyRows, cases) {
  const names = [...new Set([...moneyRows.map(r => r.person), ...cases.map(c => c.person)])].filter(Boolean);
  return names.map(name => {
    const rows = moneyRows.filter(r => r.person === name), t = moneyTotals(rows), mine = cases.filter(c => c.person === name);
    const ordered = mine.filter(c => ["受注", "進行中", "請求済", "入金済"].includes(c.status)).length, lost = mine.filter(c => c.status === "失注").length;
    const pipeline = mine.filter(c => c.status === "見積り中").reduce((a, c) => a + (isNum(c.amount) ? c.amount : 0), 0);
    return { name, sites: t.count, earned: t.earned, cost: t.cost, profit: t.profit, margin: t.margin, plus: t.plus, minus: t.minus, avgSize: t.count ? t.earned / t.count : null,
      ordered, lost, winRate: ordered + lost ? ordered / (ordered + lost) * 100 : null, pipeline, quoting: mine.filter(c => c.status === "見積り中").length };
  }).filter(p => p.sites || p.ordered || p.lost || p.quoting).sort((a, b) => b.profit - a.profit);
}

/** 案件の期間（ガントチャートの1本の長さ）。工程表があればその全体、無ければ施工の実績の期間、受付・見積の段階なら、現調日から見積の提出日（無ければ基準日）まで。日付が無い案件は null。 */
export function caseSpan(c, fin, asOf) {
  if (c.tasks && c.tasks.length) { const st = c.tasks.map(t => t.start).sort(), en = c.tasks.map(t => t.end).sort(); return { start: st[0], end: en[en.length - 1], kind: "工程表" }; }
  if (fin && fin.start && fin.end) return { start: fin.start, end: fin.end, kind: "施工の期間" };
  if (c.visitDate) { const end = c.quotedOn && parseDate(c.quotedOn) >= parseDate(c.visitDate) ? c.quotedOn : (parseDate(asOf) >= parseDate(c.visitDate) ? asOf : c.visitDate); return { start: c.visitDate, end: parseDate(end) >= parseDate(c.visitDate) ? end : c.visitDate, kind: "受付〜見積" }; }
  return null;
}

/* ===================== タスク（依頼・委任・報告・リマインド） ===================== */
export const TASK_STATUSES = ["未着手", "対応中", "報告済", "完了", "差し戻し"];
const isDelegated = t => t.createdBy !== t.assignee;

/** 見ている人（me）にとってのリマインド。受けた側：新着・早く報告して。預けた側：報告が届いた・預けたまま。 */
export function taskReminders(tasks, asOf, me) {
  const out = [], add = a => out.push(a);
  for (const t of tasks) {
    if (t.status === "完了") continue;
    const age = dayDiff(t.createdOn, asOf), overdue = !!(t.due && parseDate(t.due) < parseDate(asOf));
    if (t.assignee === me) {
      if (t.status === "差し戻し") add({ id: `task:back:${t.id}`, level: "高", role: "受け手", kind: "差し戻し", taskId: t.id, title: `${t.createdBy}から差し戻されました`, detail: `「${t.title}」${t.reportNote ? "（" + t.reportNote + "）" : ""}`, action: "やり直して、もう一度報告する" });
      else if (isDelegated(t) && t.status !== "報告済") {
        if (!t.ackedOn) add({ id: `task:new:${t.id}`, level: "低", role: "受け手", kind: "新着", taskId: t.id, title: `${t.createdBy}からタスクが来ています`, detail: `「${t.title}」${t.due ? "（期限 " + t.due + "）" : ""}`, action: "内容を確認して「受け取りました」を押す" });
        if (age >= 2 || overdue) add({ id: `task:rep:${t.id}`, level: age >= 4 || overdue ? "高" : "中", role: "受け手", kind: "報告", taskId: t.id, title: `${t.createdBy}に、早く報告してください（${age}日経過${overdue ? "・期限切れ" : ""}）`, detail: `「${t.title}」`, action: "進み具合を更新して、「報告する」を押す" });
        if (t.nudgedOn) add({ id: `task:nudge:${t.id}:${t.nudges}`, level: "中", role: "受け手", kind: "催促", taskId: t.id, title: `${t.createdBy}から催促が来ています（${t.nudgedOn}）`, detail: `「${t.title}」`, action: "状況を報告する" });
      } else if (!isDelegated(t) && overdue && t.status !== "報告済") add({ id: `task:self:${t.id}`, level: "中", role: "自分", kind: "期限切れ", taskId: t.id, title: "自分のタスクの期限が過ぎています", detail: `「${t.title}」（期限 ${t.due}）`, action: "進めるか、期限を決め直す" });
    }
    if (t.createdBy === me && isDelegated(t)) {
      if (t.status === "報告済") add({ id: `task:got:${t.id}`, level: "中", role: "依頼者", kind: "報告が届いた", taskId: t.id, title: `${t.assignee}から報告が届いています`, detail: `「${t.title}」${t.reportNote ? "：" + t.reportNote : ""}`, action: "確認して、完了にするか、差し戻す" });
      else if (age >= 2 || overdue) add({ id: `task:wait:${t.id}`, level: age >= 4 || overdue ? "高" : "中", role: "依頼者", kind: "預けたまま", taskId: t.id, title: `預けたタスクの報告が、まだ来ていません：${t.assignee}（${age}日${overdue ? "・期限切れ" : ""}）`, detail: `「${t.title}」${t.status === "未着手" && !t.ackedOn ? "（まだ受け取られていません）" : ""}`, action: "催促するか、状況を確認する" });
    }
  }
  return out.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
}
/** 見ている人のタスクの数（自分のもの／預けているもの／報告待ちなど）。完了は数えない。 */
/** タスクの進み具合（%）。小項目があれば、チェックが入った割合。報告済み・完了は100。小項目がなければ、自分で入れた値。 */
export function taskProgress(t) {
  if (t.status === "完了" || t.status === "報告済") return 100;
  const s = t.subs || [];
  return s.length ? Math.round(s.filter(x => x.done).length / s.length * 100) : Math.max(0, Math.min(100, Number(t.progress) || 0));
}
export function taskCounts(tasks, me) {
  const open = tasks.filter(t => t.status !== "完了");
  return { mine: open.filter(t => t.assignee === me).length, newForMe: open.filter(t => t.assignee === me && isDelegated(t) && !t.ackedOn && t.status !== "報告済").length,
    delegated: open.filter(t => t.createdBy === me && isDelegated(t)).length, reportedToMe: open.filter(t => t.createdBy === me && isDelegated(t) && t.status === "報告済").length };
}

/* ===================== 商談 → 案件 → 受注・失注（営業の見える化） ===================== */
export const OUTCOMES = ["案件化", "案件化せず", "検討中"];

/** 商談の数・案件になった数・案件化せず・検討中。案件になったあとの受注・失注・進行中も数える。monthLabel（例「12月」）で、商談の日の月に絞れる。 */
export function salesFunnel(meetings, cases, monthLabel = null) {
  const list = meetings.filter(m => !monthLabel || monthLabelOf(m.date) === monthLabel);
  const total = list.length, converted = list.filter(m => m.outcome === "案件化"), declined = list.filter(m => m.outcome === "案件化せず").length, pending = list.filter(m => m.outcome === "検討中").length;
  const linked = [...new Set(converted.map(m => m.caseId).filter(Boolean))].map(id => cases.find(c => c.id === id)).filter(Boolean);
  const won = linked.filter(c => ["受注", "進行中", "請求済", "入金済"].includes(c.status)), lost = linked.filter(c => c.status === "失注"), open = linked.filter(c => c.status === "見積り中" || !c.status);
  const amount = a => a.reduce((x, c) => x + (isNum(c.amount) ? c.amount : 0), 0);
  return { total, converted: converted.length, declined, pending, convertRate: ratio(converted.length, total), cases: linked.length, won: won.length, lost: lost.length, open: open.length,
    wonRate: ratio(won.length, linked.length), lostRate: ratio(lost.length, linked.length), lostAmount: amount(lost), wonAmount: amount(won), openAmount: amount(open) };
}
/** 月ごと（商談の日の月）の数。 */
export function funnelByMonth(meetings, cases, months) {
  return months.map(m => ({ month: m, ...salesFunnel(meetings, cases, m) })).filter(r => r.total > 0);
}
/** 失注・見送りの理由ごとの件数。案件の失注（lossReason）と、案件化せずの商談（lossReason）を合わせる。 */
export function lossReasons(meetings, cases) {
  const m = new Map(), add = r => { const k = r || "（理由なし）"; m.set(k, (m.get(k) || 0) + 1); };
  cases.filter(c => c.status === "失注").forEach(c => add(c.lossReason));
  meetings.filter(x => x.outcome === "案件化せず").forEach(x => add(x.lossReason));
  return [...m.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count);
}

/** 商談の文字起こしを、記録の形に整える（規則による。AI ではない）。担当者名・相手・元請けか直接か・物件名・場所を拾い、要望・予算・見積の候補も付ける。 */
export function structureMeeting(text, templates = [], staff = []) {
  const t = String(text || ""), base = extractMeeting(t, templates);
  const speakers = [...new Set([...t.matchAll(/(?:^|\n)\s*([^\s：:\n]{1,12})\s*[：:]/g)].map(m => m[1]))];
  const staffHere = staff.filter(n => speakers.includes(n) || t.includes(n));
  const customers = speakers.filter(s => !staff.includes(s));
  const honor = [...t.matchAll(/([^\s、。「」：:（）()]{1,12}?)(様|さん)/g)].map(m => m[1] + m[2]).filter(x => !staff.some(n => x.startsWith(n)) && !/^(お客様|皆様|元請け)/.test(x));
  const counterpart = customers.find(c => /(様|さん)$/.test(c)) || honor[0] || customers[0] || "";
  const viaContractor = /元請け|発注書|管理会社|ゼネコン/.test(t);
  const contractor = viaContractor ? ((/(元請け[A-Za-zＡ-Ｚ0-9]{0,2})/.exec(t) || [])[1] || "元請け") : "";
  const property = (/([^\s、。「」：:（）()]{1,14}?(?:邸|マンション|ビル|アパート|店舗)[A-Za-zＡ-Ｚ0-9０-９]{0,4})/.exec(t) || [])[1] || "";
  const place = ["オンライン", "お客様宅", "事務所", "現地"].find(p => t.includes(p)) || "";
  return { ...base, speakers, participants: staffHere, counterpart, contractType: viaContractor ? "元請け経由" : "直接", contractor, property, place };
}

/* ===================== 資材の発注（工程表の中の「発注するもの」） ===================== */
/** 発注の期限。納品は、早すぎると現場の邪魔になるので、着工の buffer 日前（既定1日前）に合わせる。発注期限＝納品の必要日 − 納品までの日数。 */
export function orderDue(item, task, asOf, buffer = 1) {
  const needBy = addDays(task.start, -buffer), orderBy = addDays(needBy, -(Number(item.leadDays) || 0)), daysLeft = dayDiff(asOf, orderBy);
  const state = item.orderedOn ? "発注済み" : daysLeft < 0 ? "期限切れ" : daysLeft <= 5 ? "期限間近" : "まだ先";
  return { needBy, orderBy, daysLeft, state };
}

/* ===================== 秘書の提案（原因・対応・AIが代わりにできること） ===================== */
/** アラート・リマインドの種類ごとの、原因の見立てと対応案。規則による提案（AIによる文章生成ではない）。AIを足すときは、この形をそのまま渡せる。 */
const ADVICE = {
  "遅れ": { cause: "計画より進みが遅れています。資材の遅れ・職人の都合・追加工事のどれかが、よくある原因です。", steps: ["日報と写真で、止まっている理由を確認する", "職人に、日程をやり直して依頼する", "後ろの工程に響くなら、元請け・お客様へ先に連絡する"], aiCan: ["日報の内容から、原因の候補を整理する", "遅れた日数を反映した、新しい工程の叩き台を作る", "お客様向けの連絡文を下書きする"], aiCannot: ["職人との日程の約束", "お客様へ送るかどうかの判断（代表の承認が要ります）"] },
  "日報": { cause: "現場の様子が、今日はまだ共有されていません。忙しくて上げ忘れている場合が多いです。", steps: ["担当者に、今日の日報と写真を上げてもらう", "上がらない日が続くなら、上げやすい時間（昼・夕方）を決める"], aiCan: ["担当者へのリマインド文の下書き", "写真と一言メモから、日報の文章を整える"], aiCannot: ["現場の写真を撮ること", "現場の状況が本当かの確認"] },
  "資材発注": { cause: "着工に間に合わせるための発注の期限が、近い（または過ぎて）います。工程がずれると、期限も動きます。", steps: ["品名と数量を確認して、取引先へ発注する", "届くまでの日数を確認し、間に合わないなら工程の順番を入れ替える", "発注したら「発注済み」にチェックを入れる"], aiCan: ["発注書・メールの下書き", "同じ資材の過去の納期との比較", "間に合わないときの、工程の組み替え案"], aiCannot: ["取引先への実際の発注（承認と送信は人がします）", "金額が大きい発注の判断"] },
  "職人の確認": { cause: "依頼した日程を、職人がまだ確認していません。通知に気づいていないか、都合がつかず迷っている可能性があります。", steps: ["職人へ、確認のお願いを再送する", "返事がなければ、電話で日程を直接確認する"], aiCan: ["再送のメッセージ下書き", "ほかの職人の空き状況の整理"], aiCannot: ["電話での調整", "職人の都合の判断"] },
  "職人の相談": { cause: "職人から「代表に相談」が届いています。日程が合わない場合がほとんどです。", steps: ["相談の中身（ひと言）を読む", "別の日程を提案するか、別の職人に依頼する"], aiCan: ["代わりの日程・職人の候補を出す", "返信の下書き"], aiCannot: ["日程の最終決定", "職人との条件の合意"] },
  "追加・変更": { cause: "日報に、追加・変更の工事が出ています。承認が済むまで、費用と工程に入れられません。", steps: ["日報と写真で、追加の内容と理由を確認する", "追加の見積を作り、お客様の承認を取る", "承認したら「承認済み」にする"], aiCan: ["追加分の見積の叩き台", "お客様向けの説明文の下書き"], aiCannot: ["追加費用の金額の決定", "お客様の承認を取ること"] },
  "着工前": { cause: "着工前の準備（近隣挨拶・資材・職人・養生）に、済んでいないものがあります。", steps: ["チェックが付いていない項目を、担当者に確認する", "着工日までに終わらないなら、着工日を見直す"], aiCan: ["近隣挨拶の文面の下書き", "着工前の確認リストの作成"], aiCannot: ["近隣へ伺うこと", "着工日の変更の判断"] },
  "契約": { cause: "契約書または発注書が、まだ締結済みになっていません。着工前に整える必要があります。", steps: ["書類の送付・返送の状況を確認する", "元請けの場合は、発注書の受領を確認する"], aiCan: ["契約書・発注書の確認項目の整理", "催促の文面の下書き"], aiCannot: ["契約の締結", "契約内容の法的な判断（専門家に確認します）"] },
  "見積": { cause: "見積を出してから時間がたち、お客様の返事を待っている状態です。", steps: ["お客様へ、ご検討状況を伺う", "返事が出ない理由（金額・時期・他社）を聞き取る"], aiCan: ["フォローの連絡文の下書き", "値引き・内容変更の案の整理"], aiCannot: ["値引きの判断", "お客様への送信（承認が要ります）"] },
  "受付〜見積": { cause: "受付から見積までの間が、あいています。返事が遅れるほど、失注しやすくなります。", steps: ["現地調査の日程を決める", "見積の作成を、いつまでに出すか決める"], aiCan: ["商談記録から見積の叩き台を作る", "調査日の候補の提示"], aiCannot: ["現地調査", "見積金額の最終決定"] },
  "工程表": { cause: "工程表が入っていない（または古い）現場です。進み具合と遅れが測れません。", steps: ["工程表を作る（見積の項目から叩き台を作れます）", "職人の日程を依頼する"], aiCan: ["見積の項目から、工程の叩き台を作る"], aiCannot: ["職人の確保", "工期の約束"] },
  "施工の期間": { cause: "施工の期間が、予定より長くなっています。長引くほど、人件費が増えます。", steps: ["残りの工程と終わる見込みを確認する", "工期が延びる場合は、お客様へ先に連絡する"], aiCan: ["延びた場合の、人件費への影響の試算", "お客様向けの連絡文の下書き"], aiCannot: ["工期の変更の約束"] },
  "メモ": { cause: "現場のメモが、処理されないまま残っています。放っておくと、手配の漏れにつながります。", steps: ["メモを読んで、タスクにするか、処理済みにする"], aiCan: ["メモをタスクにする下書き", "似たメモのまとめ"], aiCannot: ["現場の判断"] },
  "預けたまま": { cause: "預けたタスクの報告が、まだ来ていません。忙しい・内容が伝わっていない・忘れている、のどれかです。", steps: ["「催促する」を押して、相手に知らせる", "それでも動かないときは、直接連絡する"], aiCan: ["催促の文面の下書き", "相手のタスクの量の整理"], aiCannot: ["相手の事情の判断"] },
  "報告が届いた": { cause: "預けたタスクの報告が届いています。確認して完了にするまで、相手は待っています。", steps: ["報告の内容を読む", "よければ完了に、足りなければ差し戻す"], aiCan: ["報告の要点の整理", "差し戻しの理由の下書き"], aiCannot: ["完了にする判断"] },
  "報告": { cause: "依頼されたタスクの報告が、遅れています。", steps: ["進み具合を更新する", "終わっていれば「報告する」を押す"], aiCan: ["報告文の下書き"], aiCannot: ["作業そのもの"] },
  "新着": { cause: "新しいタスクが来ています。「受け取りました」を押すまで、依頼した人は状況が分かりません。", steps: ["内容を確認して「受け取りました」を押す"], aiCan: ["内容の要点の整理", "小項目の叩き台"], aiCannot: ["引き受けるかの判断"] },
  "催促": { cause: "依頼した人から、催促が来ています。", steps: ["状況を報告する（途中でも構いません）"], aiCan: ["報告文の下書き"], aiCannot: ["作業そのもの"] },
  "差し戻し": { cause: "報告が差し戻されました。足りない点を直す必要があります。", steps: ["差し戻しの理由を読む", "直して、もう一度報告する"], aiCan: ["理由から、直す項目を整理する"], aiCannot: ["作業そのもの"] },
  "期限切れ": { cause: "自分のタスクの期限が過ぎています。", steps: ["進めるか、期限を決め直す"], aiCan: ["残りの小項目の整理"], aiCannot: ["作業そのもの"] },
};
const ADVICE_DEFAULT = { cause: "対応が必要な項目です。", steps: ["内容を確認して、対応する"], aiCan: ["状況の整理", "連絡文の下書き"], aiCannot: ["最終的な判断・外部への送信"] };
export const secretaryAdvice = kind => ADVICE[kind] || ADVICE_DEFAULT;
export const ADVICE_KINDS = Object.keys(ADVICE);

/* ===================== 分析期間（単月／直近3か月／年累計）：全ページで同じ期間にそろえる ===================== */
export const PERIODS = [["month", "単月"], ["quarter", "直近3か月"], ["ytd", "年累計"]];
export function periodRange(L, mode) { return mode === "month" ? [L, L] : mode === "quarter" ? [Math.max(0, L - 2), L] : [0, L]; }
/** 選んだ期間の合計（実績・前年・計画）と、比率。上のカードも、円グラフも、比較も、すべてこの1つの数字から作る。 */
export function periodMetrics(s, mode = "month") {
  const L = s.L; if (L < 0) return null;
  const [a, b] = periodRange(L, mode), sum = arr => (arr || []).slice(a, b + 1).reduce((x, v) => x + (isNum(v) ? v : 0), 0);
  const keys = ["sales", "cost", "profit", "materials", "labor"], cur = {}, prevYear = {}, plan = {};
  for (const k of keys) { cur[k] = sum(s[k]); prevYear[k] = sum(s.prev[k]); plan[k] = s.plan[k] ? sum(s.plan[k]) : null; }
  const n = b - a + 1, label = mode === "month" ? `${s.months[L]}（単月）` : mode === "quarter" ? `${s.months[a]}〜${s.months[b]}（直近${n}か月）` : `期初〜${s.months[b]}（年累計）`;
  return { mode, a, b, n, label, cur, prevYear, plan, yoyPct: { sales: pctChange(cur.sales, prevYear.sales), cost: pctChange(cur.cost, prevYear.cost), profit: pctChange(cur.profit, prevYear.profit), materials: pctChange(cur.materials, prevYear.materials), labor: pctChange(cur.labor, prevYear.labor) },
    costRate: ratio(cur.cost, cur.sales), profitRate: ratio(cur.profit, cur.sales), achievement: plan.sales ? ratio(cur.sales, plan.sales) : null, profitAchievement: plan.profit ? ratio(cur.profit, plan.profit) : null };
}

/* ===================== 期間ごとの担当者の実績と、アドバイザーの意見（規則による） ===================== */
/** 担当者（人材紹介のアドバイザー）の、a月〜b月の実績。 */
export function advisorRange(adv, a, b) {
  const cut = arr => (arr || []).slice(a, b + 1);
  return advisorStats({ name: adv.name, interviews: cut(adv.interviews), hours: cut(adv.hours), recommended: cut(adv.recommended), offers: cut(adv.offers), hires: cut(adv.hires), sales: cut(adv.sales) }, b - a);
}
const fm = v => (isNum(v) ? Math.round(v).toLocaleString("ja-JP") : "—"), fp = v => (isNum(v) ? (Math.round(v * 10) / 10) + "%" : "—");
/**
 * 数字から「何が起きているか・何をしていないか・どう手を打つか」を、立場の違う5つの視点で返す。AIの文章生成ではなく、決まった規則。
 * ctx: { pm（全事業の期間）, bizPm:{reform,staffing}, funnel（商談）, loss, team（期間の人材紹介）, teamPrev, ops:{delay,noReport,orderLate,changePending,openMemos,waiting,quoting,quotingAmount}, planCostRate }
 */
export function adviceBoard(ctx) {
  const { pm, funnel, loss = [], team, ops = {}, planCostRate } = ctx, out = [], add = o => out.push({ evidence: [], actions: [], notDone: [], ai: [], ...o });
  // 営業
  const s = { who: "営業コンサルの視点", tone: "info", evidence: [], actions: [], notDone: [], ai: ["商談の記録から、見積の叩き台とフォロー文を作る", "失注理由の傾向を集計する"] };
  if (isNum(pm.achievement)) s.evidence.push(`売上は計画の ${fp(pm.achievement)}（${fm(pm.cur.sales)}万円／計画 ${fm(pm.plan.sales)}万円）`);
  if (funnel && funnel.total) s.evidence.push(`商談 ${funnel.total}件のうち案件になったのは ${funnel.converted}件（${fp(funnel.convertRate)}）。受注 ${funnel.won}件・失注 ${funnel.lost}件・返事待ち ${funnel.open}件`);
  if (!funnel || !funnel.total) { s.tone = "warn"; s.headline = "商談の記録が、この期間にありません。"; s.notDone.push("商談を記録していない（数字の見立ての土台がありません）"); s.actions.push("商談のたびに、日付・相手・結果を1件ずつ残す（音声から自動で作れます）"); }
  else if (isNum(pm.achievement) && pm.achievement < 95) {
    s.tone = "warn"; s.headline = `売上が計画に届いていません（${fp(pm.achievement)}）。`;
    if (funnel.convertRate != null && funnel.convertRate < 50) { s.notDone.push(`商談の半分以上が案件になっていない（${fp(funnel.convertRate)}）。初回の提案・次の約束を取れていない可能性`); s.actions.push("商談の終わりに「次に会う日」を必ず決める。案件にならなかった商談の理由を見直す"); }
    if (funnel.open) { s.notDone.push(`見積りを出して返事待ちのもの ${funnel.open}件（${fm(funnel.openAmount / 10000)}万円）に、追いかけの連絡が入っていない恐れ`); s.actions.push("返事待ちの案件へ、今週中に状況を伺う連絡を入れる（優先は金額の大きいもの）"); }
  } else { s.tone = "good"; s.headline = isNum(pm.achievement) ? `売上は計画どおり、または上回っています（${fp(pm.achievement)}）。` : "売上の計画との比較は、まだできません。"; s.actions.push("うまくいった商談の進め方を、型として残す（次の担当者も再現できるように）"); }
  if (loss[0] && loss[0].count >= 1) { s.evidence.push(`失注・見送りの理由で多いのは「${loss[0].reason}」（${loss[0].count}件）`); s.actions.push(`「${loss[0].reason}」を先回りして伝える（見積の説明・条件の出し方を変える）`); }
  add(s);
  // 財務
  const f = { who: "財務（お金）の視点", tone: "info", ai: ["原価の伸びと売上の伸びを比べる表を作る", "月次の着地見込みを試算する"] };
  const cr = pm.costRate, pc = planCostRate, py = ratio(pm.prevYear.cost, pm.prevYear.sales);
  f.evidence = [`原価率 ${fp(cr)}${isNum(pc) ? `（計画 ${fp(pc)}）` : ""}${isNum(py) ? `、前年の同じ期間 ${fp(py)}` : ""}`, `利益 ${fm(pm.cur.profit)}万円（利益率 ${fp(pm.profitRate)}）`, `資材費 ${fm(pm.cur.materials)}万円（前年比 ${fp(pm.yoyPct.materials)}）・人件費 ${fm(pm.cur.labor)}万円（前年比 ${fp(pm.yoyPct.labor)}）`];
  f.actions = []; f.notDone = [];
  if (isNum(cr) && isNum(pc) && cr > pc + 1) { f.tone = "warn"; f.headline = `原価率が計画より ${(cr - pc).toFixed(1)}ポイント高くなっています。`; const mm = (pm.yoyPct.materials ?? 0) > (pm.yoyPct.labor ?? 0); f.notDone.push(mm ? "資材の仕入れ先・単価を見直していない可能性" : "人件費（外注・残業）の使い方を見直していない可能性"); f.actions.push(mm ? "資材費の大きい品目を、2社以上で見積もり直す／まとめ買いにする" : "外注と自社の振り分けを見直す。残業の多い現場を特定する"); }
  else { f.tone = "good"; f.headline = "原価率は、計画の範囲に収まっています。"; f.actions.push("このまま、現場ごとの粗利（収支）を月1回見て、赤字になりかけた現場を早めに止める"); }
  add(f);
  // 現場運営
  const o = { who: "現場運営の視点", tone: "info", ai: ["遅れの原因候補の整理", "職人・取引先への連絡文の下書き"], evidence: [], actions: [], notDone: [] };
  o.evidence = [`遅れ・遅れ気味の工程 ${ops.delay || 0}件／日報が未提出の施工中現場 ${ops.noReport || 0}件`, `資材の発注が間に合っていないもの ${ops.orderLate || 0}件／追加・変更の承認待ち ${ops.changePending || 0}件`];
  if ((ops.delay || 0) + (ops.orderLate || 0) + (ops.noReport || 0) > 0) {
    o.tone = "warn"; o.headline = "現場の抜け・遅れが出ています。放っておくと、工期と人件費に響きます。";
    if (ops.noReport) { o.notDone.push("日報を毎日上げる習慣ができていない現場がある"); o.actions.push("日報の提出時刻を決める（例：17時）。上がらない現場には当日のうちに連絡"); }
    if (ops.orderLate) { o.notDone.push("発注の期限を、工程表と見比べていない"); o.actions.push("毎朝、発注期限のアラートを見て、その日のうちに発注する"); }
    if (ops.delay) o.actions.push("遅れた工程は、原因（資材・職人・追加工事）を1行で書き、後ろの工程の日程を職人に再依頼する");
  } else { o.tone = "good"; o.headline = "現場は、おおむね計画どおりに進んでいます。"; o.actions.push("着工前チェックと発注期限の確認を、これまでどおり続ける"); }
  add(o);
  // 人材紹介
  if (team && team.total.interviews > 0) {
    const t = team.total, p = { who: "人材紹介（面談・成約）の視点", tone: "info", ai: ["面談の録音から、推薦につながらない理由を整理する", "担当者ごとの面談メモの要点づくり"], evidence: [], actions: [], notDone: [] };
    const stages = [["面談→推薦", t.recRate], ["推薦→内定", t.offerRate], ["内定→入社", t.acceptRate]].filter(x => isNum(x[1]));
    const weak = stages.slice().sort((a, b) => a[1] - b[1])[0], spread = team.list.filter(a => a.interviews > 0 && isNum(a.salesPerHour)).sort((a, b) => a.salesPerHour - b.salesPerHour);
    p.evidence = [`面談 ${t.interviews}件→推薦 ${t.recommended}→内定 ${t.offers}→入社 ${t.hires}（面談からの成約率 ${fp(t.hireRate)}）`, `1時間あたりの売上 ${fm(t.salesPerHour)}万円／1成約あたり ${fm(t.unitPrice)}万円`];
    if (weak) { p.tone = weak[1] < 40 ? "warn" : "info"; p.headline = `いちばん弱い段階は「${weak[0]}」（${fp(weak[1])}）です。`; p.notDone.push(weak[0] === "面談→推薦" ? "面談のあと、求人との相性づけ（推薦の準備）が追いついていない" : weak[0] === "推薦→内定" ? "推薦後の企業との連絡・面接対策が足りていない" : "内定後の入社まで、本人への連絡を続けていない"); p.actions.push(weak[0] === "面談→推薦" ? "面談の終わりに、推薦できる求人を最低1件は挙げる。求人の開拓（受付）を増やす" : weak[0] === "推薦→内定" ? "推薦のたびに、面接対策を1回入れる。企業へ推薦理由を一言添える" : "内定から入社までの連絡を、1週間に1回入れる"); }
    if (spread.length >= 2) { const lo = spread[0], hi = spread[spread.length - 1]; if (hi.salesPerHour > lo.salesPerHour * 1.5) { p.evidence.push(`担当者で差があります：${lo.name}は1時間あたり ${fm(lo.salesPerHour)}万円、${hi.name}は ${fm(hi.salesPerHour)}万円`); p.actions.push(`${hi.name}の面談の進め方を、${lo.name}が同席して見る（点数ではなく、やり方の共有として）`); } }
    add(p);
  }
  // 組織
  const g = { who: "組織・育成の視点", tone: (ops.waiting || ops.openMemos) ? "warn" : "info", ai: ["預けたタスクの催促文の下書き", "未処理メモのタスク化"], evidence: [`預けたまま報告がないタスク ${ops.waiting || 0}件／処理されていないメモ ${ops.openMemos || 0}件`, `見積りを出している案件 ${ops.quoting || 0}件（${fm((ops.quotingAmount || 0) / 10000)}万円）`], actions: [], notDone: [] };
  if (ops.waiting) { g.notDone.push("頼みっぱなしになっているタスクがある（確認の習慣）"); g.actions.push("預けたタスクは、2日たったら催促する。期限と、報告の形（何を・いつまでに）を依頼時に決める"); }
  if (ops.openMemos) { g.notDone.push("現場のメモが処理されないまま残っている"); g.actions.push("メモは、その日のうちに「タスクにする」か「処理済み」にする"); }
  g.headline = (ops.waiting || ops.openMemos) ? "頼んだこと・書いたことが、次の行動につながっていない所があります。" : "タスクとメモは、おおむね回っています。";
  if (!g.actions.length) g.actions.push("担当者ごとの数字は、点数にせず、困りごとの早期発見と、やり方の共有に使う（評価への使い方は、会社として決めます）");
  add(g);
  return out;
}
