/* レポート：週間・月次・四半期・年間を切り替え、数字とグラフ、担当者別の実績、アドバイザーの意見（規則による）を1枚にまとめる。 */
import * as C from "./calc.js";
import { state, getScope, getCases, getAlerts, getMemos, getReports, getMeetings, getTasks } from "./state.js";
import { esc, fmtMan, fmtPct, tag, bar } from "./ui.js";
import { myReminders } from "./tasks.js";

export const AXES = [["week", "週間"], ["month", "月次"], ["quarter", "四半期"], ["year", "年間"]];
const MODE = { week: "month", month: "month", quarter: "quarter", year: "ytd" };
const ymd = d => d.toISOString().slice(0, 10);
const monthIdx = (dateStr, s) => { const m = Number(dateStr.slice(5, 7)), first = Number(String(s.months[0]).replace("月", "")); return (m - first + 12) % 12; };
const daysIn = dateStr => { const y = Number(dateStr.slice(0, 4)), m = Number(dateStr.slice(5, 7)); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };

/** 軸ごとの、グラフの点（ラベル・売上・原価・利益・計画の売上）。 */
function points(s, axis, asOf) {
  const L = s.L, g = i => ({ sales: s.sales[i], cost: s.cost[i], profit: s.profit[i], plan: s.plan.sales[i] });
  if (axis === "month") return { kind: "bars", unit: "月ごと", pts: [...Array(6)].map((_, k) => L - 5 + k).filter(i => i >= 0).map(i => ({ label: s.months[i], ...g(i) })) };
  if (axis === "quarter") {
    const out = []; for (let a = 0; a <= L; a += 3) { const b = Math.min(L, a + 2), sum = k => { let x = 0; for (let i = a; i <= b; i++) x += s[k][i] || 0; return x; }; let pl = 0; for (let i = a; i <= b; i++) pl += s.plan.sales[i] || 0; out.push({ label: `${s.months[a]}〜${s.months[b]}${b - a < 2 ? "（途中）" : ""}`, sales: sum("sales"), cost: sum("cost"), profit: sum("profit"), plan: pl }); }
    return { kind: "bars", unit: "四半期ごと", pts: out };
  }
  if (axis === "year") {
    const cs = C.cumulative(s.sales), cp = C.cumulative(s.plan.sales), cv = C.cumulative(s.prev.sales), cf = C.cumulative(s.profit);
    return { kind: "lines", unit: "累計の推移", pts: s.months.slice(0, L + 1).map((m, i) => ({ label: m, sales: cs[i], plan: cp[i], prev: cv[i], profit: cf[i] })) };
  }
  // 週間：日ごとの数字は、その月の数字を日数で割った見本（実データでは、週ごとの入力が必要）
  const end = new Date(asOf + "T00:00:00Z"), out = [];
  for (let w = 5; w >= 0; w--) {
    const e = new Date(end.getTime() - w * 7 * 86400000), st = new Date(e.getTime() - 6 * 86400000); let sales = 0, cost = 0, profit = 0, plan = 0;
    for (let d = 0; d < 7; d++) { const day = ymd(new Date(st.getTime() + d * 86400000)), i = monthIdx(day, s), n = daysIn(day); if (i <= L && i >= 0) { sales += s.sales[i] / n; cost += s.cost[i] / n; profit += s.profit[i] / n; plan += s.plan.sales[i] / n; } }
    out.push({ label: `${Number(ymd(st).slice(5, 7))}/${Number(ymd(st).slice(8))}〜`, sales, cost, profit, plan });
  }
  return { kind: "bars", unit: "週ごと", pts: out, note: "週ごとの金額は、月の数字を日数で割った見本です。実データでは、週ごとの数字を入れる必要があります。" };
}

function chartSvg(model) {
  const W = 680, H = 270, Lm = 52, Rm = 14, T = 16, B = 40, pw = W - Lm - Rm, ph = H - T - B, pts = model.pts;
  if (!pts.length) return `<p class="empty">グラフにできる数字がありません。</p>`;
  const keys = model.kind === "bars" ? ["sales", "cost", "profit", "plan"] : ["sales", "plan", "prev", "profit"];
  const mx = Math.max(1, ...pts.flatMap(p => keys.map(k => Number(p[k]) || 0))), mn = Math.min(0, ...pts.flatMap(p => keys.map(k => Number(p[k]) || 0)));
  const nice = (() => { const r = mx - mn, e = Math.pow(10, Math.floor(Math.log10(r))), f = r / e; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * e / 4; })();
  const hi = Math.ceil(mx / nice) * nice, lo = Math.floor(mn / nice) * nice, y = v => T + ph - (v - lo) / ((hi - lo) || 1) * ph, slot = pw / pts.length;
  let grid = ""; for (let v = lo; v <= hi + 1e-9; v += nice) grid += `<line x1="${Lm}" x2="${W - Rm}" y1="${y(v)}" y2="${y(v)}" stroke="var(--grid)" stroke-width="1"/><text x="${Lm - 6}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="var(--axis)">${Math.round(v).toLocaleString("ja-JP")}</text>`;
  const cx = i => Lm + slot * i + slot / 2;
  let body = "";
  if (model.kind === "bars") {
    const bw = Math.min(26, slot / 4.6), cols = { sales: "var(--c-sales)", cost: "var(--c-mat)", profit: "var(--c-prof)" };
    pts.forEach((p, i) => ["sales", "cost", "profit"].forEach((k, j) => { const v = p[k] || 0, x = cx(i) + (j - 1) * (bw + 3) - bw / 2, y0 = y(0), y1 = y(v); body += `<rect x="${x.toFixed(1)}" y="${Math.min(y0, y1).toFixed(1)}" width="${bw}" height="${Math.max(1.5, Math.abs(y0 - y1)).toFixed(1)}" rx="4" fill="${cols[k]}" stroke="var(--c-frame)" stroke-width=".8" class="rp-bar" style="animation-delay:${i * 50 + j * 25}ms"><title>${esc(p.label)}　${{ sales: "売上", cost: "原価", profit: "利益" }[k]} ${Math.round(v).toLocaleString("ja-JP")}万円</title></rect>`; }));
    pts.forEach((p, i) => { body += `<line x1="${cx(i) - slot * .38}" x2="${cx(i) + slot * .38}" y1="${y(p.plan)}" y2="${y(p.plan)}" stroke="var(--c-plan)" stroke-width="3" stroke-linecap="round"><title>${esc(p.label)}　売上の計画 ${Math.round(p.plan).toLocaleString("ja-JP")}万円</title></line>`; });
  } else {
    const line = (k, col, dash = "", w = 3) => { const d = pts.map((p, i) => `${i ? "L" : "M"}${cx(i).toFixed(1)} ${y(p[k]).toFixed(1)}`).join(""); return `<path d="${d}" fill="none" stroke="${col}" stroke-width="${w}" ${dash ? `stroke-dasharray="${dash}"` : ""} stroke-linecap="round" stroke-linejoin="round"/>` + pts.map((p, i) => `<circle cx="${cx(i).toFixed(1)}" cy="${y(p[k]).toFixed(1)}" r="3.4" fill="var(--background)" stroke="${col}" stroke-width="1.8"><title>${esc(p.label)}　${{ sales: "売上の累計", plan: "計画の累計", prev: "前年の累計", profit: "利益の累計" }[k]} ${Math.round(p[k]).toLocaleString("ja-JP")}万円</title></circle>`).join(""); };
    body += line("plan", "var(--c-plan)", "9 6") + line("prev", "var(--c-prev)") + line("sales", "var(--gold)", "", 3.6) + line("profit", "var(--c-prof)");
  }
  const xl = pts.map((p, i) => `<text x="${cx(i).toFixed(1)}" y="${H - 14}" text-anchor="middle" font-size="${pts.length > 8 ? 10 : 11.5}" fill="var(--axis)">${esc(p.label)}</text>`).join("");
  const leg = model.kind === "bars" ? [["var(--c-sales)", "売上"], ["var(--c-mat)", "原価"], ["var(--c-prof)", "利益"], ["var(--c-plan)", "売上の計画（緑の横線）"]] : [["var(--gold)", "売上の累計"], ["var(--c-plan)", "計画の累計（点線）"], ["var(--c-prev)", "前年の累計"], ["var(--c-prof)", "利益の累計"]];
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(model.unit)}の売上・原価・利益のグラフ（単位：万円）" class="rp-svg">${grid}${body}${xl}</svg>
    <div class="legend rp-legend">${leg.map(([c, t]) => `<span><i class="sq-sw" style="background:${c}"></i>${t}</span>`).join("")}</div>`;
}

function rangeFor(axis, L) { return axis === "year" ? [0, L] : axis === "quarter" ? [Math.max(0, L - 2), L] : [L, L]; }

export function reportTopHtml() {
  const axis = state.rp.axis, s = getScope("all"), L = s.L, asOf = state.data.asOf, pm = C.periodMetrics(s, MODE[axis]), [a, b] = rangeFor(axis, L);
  if (!pm) return `<div class="card empty">実績の数字がまだありません。</div>`;
  const model = points(s, axis, asOf);
  const tabs = `<nav class="page-tabs" aria-label="レポートの期間">${AXES.map(([k, t]) => `<a href="#/report" data-rp-axis="${k}" ${axis === k ? 'aria-current="page"' : ""}>${t}</a>`).join("")}</nav>`;
  const label = axis === "week" ? `直近6週（${esc(asOf)}まで）` : pm.label;
  const sums = [["売上", pm.cur.sales, pm.yoyPct.sales, false], ["原価", pm.cur.cost, pm.yoyPct.cost, true], ["利益", pm.cur.profit, pm.yoyPct.profit, false]].map(([n, v, y, inv]) => `<div class="rp-sum"><small>${n}</small><b>${fmtMan(v)}<span>万円</span></b>${state.showYoY ? tag("前年の同じ期間比", y, !inv) : ""}</div>`).join("") + `<div class="rp-sum"><small>売上の計画達成率</small><b>${fmtPct(pm.achievement)}</b><span class="sub2">計画 ${fmtMan(pm.plan.sales)}万円</span></div>`;
  // 担当者別（人材紹介のアドバイザー）
  const trim = adv => { const c = k => (adv[k] || []).slice(a, b + 1); return { ...adv, interviews: c("interviews"), hours: c("hours"), recommended: c("recommended"), offers: c("offers"), hires: c("hires"), sales: c("sales") }; };
  const team = C.teamStats(state.data.advisors.map(trim), b - a), maxS = Math.max(1, ...team.list.map(x => x.sales));
  const rows = team.list.map(x => `<tr><td>${esc(x.name)}</td><td>${x.interviews}</td><td>${x.recommended}</td><td>${x.offers}</td><td>${x.hires}</td><td>${fmtPct(x.hireRate)}</td><td style="min-width:120px"><div style="display:flex;align-items:center;gap:8px">${bar(x.sales / maxS * 100)}<span>${fmtMan(x.sales)}</span></div></td></tr>`).join("");
  const people = `<section class="card panel"><h2 class="ttl">担当者別の実績（人材紹介のアドバイザー・${axis === "week" ? "今月" : esc(pm.label)}）</h2><div class="tablewrap"><table class="tbl"><thead><tr>${["担当者", "面談", "推薦", "内定", "入社", "面談からの成約率", "売上（万円）"].map(t => `<th scope="col">${t}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div>
    <p class="note">リフォームの担当者別（売上・コスト・利益・受注率）は、<a href="#/staff">担当者別</a>のページにあります。数字は評価の材料で、点数は付けていません。${axis === "week" ? "週ごとの担当者の数字は、月の数字を使っています。" : ""}</p></section>`;
  // アドバイザーの意見
  const ms = getMeetings().filter(m => { const i = monthIdx(m.date, s); return i >= a && i <= b; }), funnel = C.salesFunnel(ms, getCases());
  const cases = getCases(), q = cases.filter(c => c.status === "見積り中"), alerts = getAlerts(true);
  const ops = { delay: cases.filter(c => ["受注", "進行中"].includes(c.status)).reduce((n, c) => n + c.tasks.filter(t => ["遅れ", "遅れ気味"].includes(C.taskState(t, asOf))).length, 0), noReport: alerts.filter(x => x.kind === "日報").length, orderLate: alerts.filter(x => x.kind === "資材発注" && x.level === "高").length,
    changePending: getReports().filter(r => r.change && r.change.flag && r.change.approval === "未承認").length, openMemos: getMemos().filter(m => m.status !== "処理済").length, waiting: myReminders().filter(x => x.kind === "預けたまま").length, quoting: q.length, quotingAmount: q.reduce((x, c) => x + (Number.isFinite(c.amount) ? c.amount : 0), 0) };
  const board = C.adviceBoard({ pm, funnel, loss: C.lossReasons(ms, cases), team, ops, planCostRate: C.ratio(pm.plan.cost, pm.plan.sales) });
  const tone = { warn: "要対応", info: "参考", good: "良い点" };
  const advice = `<section class="card panel"><h2 class="ttl">アドバイザーの意見：何が起きていて、何をしていなくて、どう手を打つか</h2>
    <p class="sub2">売上・損益・商談・現場・タスクの数字から、立場の違う5つの視点で見立てています（決まった規則で作っています。AIの文章生成は、まだつないでいません）。</p>
    <div class="adv-grid">${board.map(x => `<article class="adv ${x.tone}"><div class="adv-h"><b>${esc(x.who)}</b><span class="adv-tag ${x.tone}">${tone[x.tone]}</span></div><p class="adv-head">${esc(x.headline)}</p>
      <h5>根拠（数字）</h5><ul>${x.evidence.map(e => `<li>${esc(e)}</li>`).join("")}</ul>
      ${x.notDone.length ? `<h5>できていないこと（可能性）</h5><ul class="nd">${x.notDone.map(e => `<li>${esc(e)}</li>`).join("")}</ul>` : ""}
      <h5>打つ手</h5><ol>${x.actions.map(e => `<li>${esc(e)}</li>`).join("")}</ol>
      <details><summary>AIが代わりにできること</summary><ul class="can">${x.ai.map(e => `<li>${esc(e)}</li>`).join("")}</ul></details></article>`).join("")}</div></section>`;
  return `${tabs}<section class="card panel"><div class="ctl-row"><h2 class="ttl" style="margin:0">${AXES.find(x => x[0] === axis)[1]}レポート（${label}）</h2>${axis !== "month" ? '<button class="btn no-print" type="button" id="btnPrint">印刷</button>' : ""}</div>
    <div class="rp-sums">${sums}</div>
    <h3 class="h3">${esc(model.unit)}の推移（万円）</h3>${chartSvg(model)}${model.note ? `<p class="note">${esc(model.note)}</p>` : ""}
    <p class="period-note"><b>分析期間：${esc(label)}</b>　比較：前年の同じ期間／単位：万円</p></section>${people}${advice}`;
}
