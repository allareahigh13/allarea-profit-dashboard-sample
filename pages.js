/* 各ページの中身。どのページも state と calc の数字だけから作る（固定の数字は書かない）。 */
import * as C from "./calc.js";
import { state, getScope, store, getAlerts, getCases, getMemos, getReports } from "./state.js";
import { esc, ICON, svgI, tag, diffTag, spark, pbar, bar, kpi, donut, fmtMan, fmtPct, bizColor, palette, bizLogo } from "./ui.js";
import { drawChart, metricLabel } from "./chart.js";
import { insights, bizInsights } from "./insights.js";
import { renderCases, renderEstimate, casesCsv, sitesCsv, estCsv } from "./pages2.js";
import { renderSites, renderCraftsman, alertListHtml } from "./sites.js";
import { siteMoneyHtml } from "./money.js";
import { renderMemos, memosCsv } from "./memos.js";
import { renderPeople, peopleCsv } from "./people.js";
import { caseDetailHtml } from "./casedetail.js";
import { renderTasks } from "./tasks.js";
import { topBarHtml, renderTalks } from "./talks.js";

const $ = s => document.querySelector(s);
const SCOPE_NAME = { all: "全事業（統合）", reform: "リフォーム事業", staffing: "人材紹介業" };
const lastN = (a, L, n = 6) => a.slice(Math.max(0, L - n + 1), L + 1);

/* ---------- 共通の小さな部品 ---------- */
function trendTags(m, inverse = false) {
  let t = "";
  if (state.showMoM) t += tag("前月比", m.momPct, !inverse);
  if (state.showYoY) t += tag("前年比", m.yoyPct, !inverse);
  return t;
}
function insightPanel(scope) {
  const list = scope === "all" ? [...bizInsights(state.data, state.overrides), ...insights(scope)] : insights(scope);
  const first = list.filter(x => x.level === "warn").slice(0, 1).concat(list.filter(x => x.level !== "warn").slice(0, 1)).slice(0, 2);
  const acts = list.slice(0, 3).map(x => x.title);
  return `<section class="card insight" aria-labelledby="aiTitle">
    <div class="aih"><svg viewBox="0 0 24 24" fill="none" stroke="#66f3ff" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path d="${ICON.ai}" fill="rgba(102,243,255,.2)"/></svg><span id="aiTitle">AIインサイト</span></div>
    <div class="txt">${first.map(x => `<p><b>${esc(x.title)}。</b>${esc(x.detail)}</p>`).join("")}<p style="font-size:11px;color:var(--text-muted)">AIは未接続です。数字から決まった規則で作った分析です。</p></div>
    <div class="acts"><small>くわしい分析</small><div class="row"><a class="chip" href="#/ai">${svgI(ICON.check)}AI分析で全${list.length}件を見る</a></div></div></section>`;
}
const tableWrap = t => `<div class="tablewrap">${t}</div>`;
const th = (t, extra = "") => `<th scope="col"${extra}>${esc(t)}</th>`;

/* ---------- 損益分析（統合・事業別） ---------- */
function plTabs(scope) {
  const items = [["pl", "all"], ["pl/reform", "reform"], ["pl/staffing", "staffing"]];
  return `<nav class="page-tabs" aria-label="事業の切り替え">${items.map(([p, k]) => `<a href="#/${p}" ${k === scope ? 'aria-current="page"' : ""}>${esc(SCOPE_NAME[k])}</a>`).join("")}</nav>`;
}

function plKpis(s, sm) {
  const m = sm.metrics, L = s.L, mo = s.months[L];
  const salesCard = kpi({ tone: "sky", icon: "coin", label: `売上（${mo}）`, value: fmtMan(m.sales.now), unit: "万円",
    sub: `累計 ${fmtMan(m.sales.cum)}万円`, tags: trendTags(m.sales), sparkHtml: spark(lastN(s.sales, L), "#7fd8ff", "a") });
  const costCard = kpi({ tone: "amber", icon: "cost", label: `原価（${mo}）`, value: fmtMan(m.cost.now), unit: "万円",
    sub: `売上原価率 ${fmtPct(sm.costRateNow)}（資材 ${fmtMan(m.materials.now)}／人件費 ${fmtMan(m.labor.now)}）`, tags: trendTags(m.cost, true), sparkHtml: spark(lastN(s.cost, L), "#ffd23f", "b") });
  const goalCard = kpi({ tone: "gold", icon: "target", label: "目標に対する進捗（売上）", value: fmtPct(m.sales.progress).replace("%", ""), unit: "%",
    sub: `累計 ${fmtMan(m.sales.cum)} ／ 目標 ${fmtMan(m.sales.target)}万円`, tags: diffTag("計画との差", m.sales.diff),
    barHtml: pbar(m.sales.progress, m.sales.planProgress, "売上の目標進捗") });
  const profCard = kpi({ tone: "teal", icon: "layers", label: `累計利益（期初〜${mo}）`, value: fmtMan(m.profit.cum), unit: "万円",
    sub: `利益率 ${fmtPct(sm.profitRate)}／利益目標の進捗 ${fmtPct(m.profit.progress)}`,
    tags: (state.showYoY ? tag("前年累計比", m.profit.cumYoyPct) : "") + diffTag("計画との差", m.profit.diff),
    sparkHtml: spark(C.cumulative(s.profit).slice(0, L + 1), "#35d6ff", "c") });
  return `<section class="kpis k5" aria-label="主要な数字">${salesCard}${costCard}${goalCard}${profCard}</section>`;
}

function chartCard(s, { metricFixed = null } = {}) {
  const metric = metricFixed || state.metric, lab = metricLabel(metric);
  const tabs = metricFixed ? "" : `<div class="metric-tabs" role="group" aria-label="グラフの数字">${["sales", "cost", "profit"].map(k => `<button type="button" data-metric="${k}" aria-pressed="${k === metric}">${metricLabel(k)}</button>`).join("")}</div>`;
  return `<article class="card chart" aria-labelledby="chTitle">
    <div class="ctl-row"><h2 class="ttl" id="chTitle">月次${lab}と累計${lab}の推移（計画との比較）</h2>${tabs}</div>
    <div class="svgwrap" id="chartWrap"><div class="tip" id="tip" role="status"></div></div>
    <div class="legend" id="legend">
      <button type="button" data-ser="bars" aria-pressed="${state.ser.bars}">${metric === "sales" ? '<span class="sq-sw mat"></span>資材費（黄） <span class="sq-sw lab"></span>人件費（赤） <span class="sq-sw prof"></span>利益（水色）<span class="frame-sw"></span>棒全体の枠（月次の積み上げ棒）' : metric === "cost" ? '<span class="sq-sw mat"></span>資材費 <span class="sq-sw lab"></span>人件費（月次の積み上げ棒）' : '<span class="sq-sw prof"></span>月次の利益（棒）'}</button>
      <button type="button" data-ser="cum" aria-pressed="${state.ser.cum}"><span class="dot"></span>累計の実績（金色の線）</button>
      <button type="button" data-ser="plan" aria-pressed="${state.ser.plan}"><span class="tick"></span><span class="dotted"></span>目標の計画（緑の太線＝月次／緑の点線＝累計）</button>
      ${state.showYoY ? `<span style="display:flex;align-items:center;gap:8px"><span class="tick v"></span>前年（紫の横線＝月次／紫の実線＝累計）</span>` : ""}
    </div><p class="summary" id="summary"></p></article>`;
}
function postChart(post, s, metricFixed = null) {
  post.push(() => {
    const sum = drawChart($("#chartWrap"), s, { metric: metricFixed || state.metric, range: state.range, mode: state.mode, showYoY: state.showYoY, ser: state.ser });
    const el = $("#summary"); if (el) el.textContent = sum;
  });
}

function composeCard(scope, s, sm) {
  if (scope === "all") {
    const comp = C.composition(state.data, state.overrides), meas = state.compMeasure;
    const lab = { sales: "売上", cost: "原価", profit: "利益" }[meas], pctKey = meas + "Pct";
    const segs = comp.parts.map(p => ({ label: p.name, value: p[meas], ...bizColor(p.id) }));
    const rows = comp.parts.map(p => `<div class="row-item" style="grid-template-columns:auto 1fr auto"><i style="width:10px;height:10px;border-radius:3px;background:${bizColor(p.id).c2}"></i><div><div class="nm">${esc(p.name)}</div><div class="sub2">${lab} ${fmtMan(p[meas])}万円</div></div><div class="vl">${fmtPct(p[pctKey])}</div></div>`).join("");
    return `<article class="card compose" aria-labelledby="coTitle"><div class="ctl-row"><h2 class="ttl" id="coTitle">損益構成（事業別）</h2>
      <div class="seg small" role="group" aria-label="構成の見方">${["sales", "cost", "profit"].map(k => `<button type="button" data-comp="${k}" aria-pressed="${k === meas}">${metricLabel(k)}</button>`).join("")}</div></div>
      <div class="donutbox">${donut(segs, fmtMan(comp.total[meas]), `${lab}（累計・万円）`, "co")}<div class="dleg">${rows}</div></div>
      <p class="note">期初〜${esc(s.months[s.L])}の累計です。割合は、事業の${lab}を全体の${lab}で割っています。</p></article>`;
  }
  const pl = palette(), m = sm.metrics, segs = [
    { label: "資材費", value: m.materials.cum, ...pl.mat },
    { label: "人件費", value: m.labor.cum, ...pl.lab },
    { label: "利益", value: Math.max(0, m.profit.cum), ...pl.prof }];
  const rows = segs.map(x => `<div class="row-item" style="grid-template-columns:auto 1fr auto"><i style="width:10px;height:10px;border-radius:3px;background:${x.c2}"></i><div><div class="nm">${x.label}</div><div class="sub2">${fmtMan(x.value)}万円</div></div><div class="vl">${fmtPct(C.ratio(x.value, m.sales.cum))}</div></div>`).join("");
  return `<article class="card compose" aria-labelledby="coTitle"><h2 class="ttl" id="coTitle">損益構成（売上に対する割合）</h2>
    <div class="donutbox">${donut(segs, fmtMan(m.sales.cum), "売上（累計・万円）", "co")}<div class="dleg">${rows}</div></div>
    <p class="note">売上を、資材費・人件費・利益に分けています。期初〜${esc(s.months[s.L])}の累計です。${m.materials.cum === 0 ? "この事業には資材費がありません。" : ""}</p></article>`;
}

function compareCard(s, sm) {
  const m = sm.metrics, sales = m.sales.cum;
  const items = [
    { nm: "売上", c: "sky", v: "sales", x: m.sales, pct: 100, base: "売上を100%としたときの割合", inv: false },
    { nm: "資材費（コスト）", c: "amber", v: "mat", x: m.materials, pct: C.ratio(m.materials.cum, sales), base: "売上に対する割合", inv: true },
    { nm: "人件費（コスト）", c: "pink", v: "lab", x: m.labor, pct: C.ratio(m.labor.cum, sales), base: "売上に対する割合", inv: true },
    { nm: "利益", c: "teal", v: "prof", x: m.profit, pct: C.ratio(m.profit.cum, sales), base: "売上に対する割合（利益率）", inv: false },
  ];
  const sq = v => `<i class="sq" style="background:linear-gradient(var(--c-${v}2),var(--c-${v}))"></i>`;
  const rows = items.map(it => `<div class="cmp"><div class="r"><span class="nmc">${sq(it.v)}${it.nm}</span><span class="val"><b>${fmtMan(it.x.cum)}万円</b><span class="pc ${it.c}">${fmtPct(it.pct)}</span></span></div>
      <div class="track" role="img" aria-label="${it.nm} ${it.base} ${fmtPct(it.pct)}"><i class="${it.c}" data-w="${Math.max(2, Math.min(100, it.pct || 0))}"></i></div>
      <div class="f"><span>${it.base}${state.showYoY ? `・前年累計 ${fmtMan(it.x.cumYoy)}万円` : ""}</span>${state.showYoY ? `<span class="${(it.x.cumYoyPct ?? 0) >= 0 !== it.inv ? "up" : "down"}">前年比 ${fmtPct(it.x.cumYoyPct, { sign: true })}</span>` : ""}</div></div>`).join("");
  const prog = m.sales.progress;
  return `<article class="card compare" aria-labelledby="cmTitle"><h2 class="ttl" id="cmTitle">主要指標の比較</h2><div style="display:grid;gap:12px">${rows}
    <div class="cmp"><div class="r"><span class="nmc">${sq("goal")}目標進捗（売上）</span><span class="val"><b>${fmtMan(sales)}万円</b><span class="pc gold">${fmtPct(prog)}</span></span></div>${pbar(prog, m.sales.planProgress, "売上の目標進捗", "gold")}
      <div class="f"><span>目標 ${fmtMan(m.sales.target)}万円・計画どおりなら ${fmtPct(m.sales.planProgress)}</span><span class="${m.sales.diff >= 0 ? "up" : "down"}">計画との差 ${fmtMan(m.sales.diff, { sign: true })}万円</span></div></div></div></article>`;
}

function costCard(s, sm) {
  const m = sm.metrics, planCr = s.target.cost / s.target.sales * 100;
  const items = sm.costBreakdown.map(c => `<div class="cost-item"><div class="top"><span>${c.name}</span><span class="amt">${fmtMan(c.amount)}<small style="font-size:13px;font-weight:500"> 万円</small></span></div>
    ${bar(c.ofCost, c.key === "materials" ? "amber" : "pink")}
    <div class="meta"><span>原価に占める割合 <b>${fmtPct(c.ofCost)}</b></span><span>売上に対する割合 <b>${fmtPct(c.ofSales)}</b></span>${state.showYoY ? tag("前年比", c.yoyPct, false) : ""}</div></div>`).join("");
  return `<article class="card panel" aria-labelledby="ccTitle"><h2 class="ttl" id="ccTitle">原価の内訳（資材費・人件費）</h2>
    <div class="cost-item"><div class="top"><span>原価の合計</span><span class="amt">${fmtMan(m.cost.cum)}<small style="font-size:13px;font-weight:500"> 万円</small></span></div>
      <div class="meta"><span>売上原価率 <b>${fmtPct(sm.costRate)}</b></span><span>計画の原価率 <b>${fmtPct(planCr)}</b></span>${sm.costRatePrev != null && state.showYoY ? `<span>前年の原価率 <b>${fmtPct(sm.costRatePrev)}</b></span>` : ""}</div></div>
    ${items}<p class="note">期初〜${esc(s.months[s.L])}の累計です。「原価に占める割合」は原価の合計を100%としたときの割合、「売上に対する割合」は売上を100%としたときの割合です。</p></article>`;
}

function goalCard(s, sm) {
  const line = (label, k) => {
    const x = sm.metrics[k];
    return `<div class="goal-line"><span class="lbl">${label}</span><span class="big">${fmtPct(x.progress)}</span>
      <div style="grid-column:1/-1">${pbar(x.progress, x.planProgress, label + "の進捗")}</div>
      <div class="mt"><span>目標 <b>${fmtMan(x.target)}万円</b></span><span>実績の累計 <b>${fmtMan(x.cum)}万円</b></span><span>計画の累計 <b>${fmtMan(x.planCum)}万円</b></span>
        <span>計画との差 <b class="${x.diff >= 0 ? "up" : "down"}">${fmtMan(x.diff, { sign: true })}万円</b></span>
        <span>このペースの年間見込み <b>${fmtMan(x.forecast)}万円</b>（目標との差 <b class="${x.forecast - x.target >= 0 ? "up" : "down"}">${fmtMan(x.forecast - x.target, { sign: true })}</b>）</span></div></div>`;
  };
  return `<article class="card panel" aria-labelledby="gcTitle"><h2 class="ttl" id="gcTitle">目標値に対する進捗</h2>${line("売上の目標", "sales")}${line("利益の目標", "profit")}
    <p class="note">金色の印は「計画どおりなら、いまここ」の位置です。目標額は「目標・予実」ページで変えられます。</p></article>`;
}

export function renderPL(route, post) {
  const scope = route.scope, s = getScope(scope), sm = C.summarize(s);
  if (!sm) return emptyHtml();
  postChart(post, s);
  return `${plTabs(scope)}${plKpis(s, sm)}
    <section class="grid">${chartCard(s)}${composeCard(scope, s, sm)}${compareCard(s, sm)}</section>
    <section class="grid2">${costCard(s, sm)}${goalCard(s, sm)}</section>${insightPanel(scope)}`;
}

/* ---------- ホーム ---------- */
export function renderHome(route, post) {
  const s = getScope("all"), sm = C.summarize(s), m = sm.metrics, mo = s.months[sm.L];
  const cards = [
    kpi({ tone: "sky", icon: "coin", label: `売上（${mo}）`, value: fmtMan(m.sales.now), unit: "万円", sub: `累計 ${fmtMan(m.sales.cum)}万円`, tags: trendTags(m.sales), sparkHtml: spark(lastN(s.sales, sm.L), "#25d9ef", "h1"), href: "#/sales" }),
    kpi({ tone: "amber", icon: "cost", label: `原価（${mo}）`, value: fmtMan(m.cost.now), unit: "万円", sub: `売上原価率 ${fmtPct(sm.costRateNow)}`, tags: trendTags(m.cost, true), href: "#/pl" }),
    kpi({ tone: "gold", icon: "target", label: "売上の目標進捗", value: fmtPct(m.sales.progress).replace("%", ""), unit: "%", sub: `目標 ${fmtMan(m.sales.target)}万円`, tags: diffTag("計画との差", m.sales.diff), barHtml: pbar(m.sales.progress, m.sales.planProgress, "売上の目標進捗"), href: "#/goals" }),
    kpi({ tone: "teal", icon: "layers", label: "累計利益", value: fmtMan(m.profit.cum), unit: "万円", sub: `利益率 ${fmtPct(sm.profitRate)}`, tags: state.showYoY ? tag("前年累計比", m.profit.cumYoyPct) : "", href: "#/pl" }),
  ].join("");
  const alertsAll = getAlerts(), cases = getCases(), memosOpen = getMemos().filter(m => m.status !== "処理済").length;
  const working = cases.filter(c => c.status === "進行中" && c.stage === 3), posted = working.filter(c => getReports().some(r => r.caseId === c.id && r.date === state.data.asOf)).length;
  const check = `<section class="today-strip" aria-label="今日のチェック"><a href="#/sites" class="today ${alertsAll.some(a => a.level === "高") ? "hot" : ""}"><b>${alertsAll.filter(a => a.kind !== "メモ").length}</b><span>対応が必要なアラート</span><small>高 ${alertsAll.filter(a => a.level === "高" && a.kind !== "メモ").length}件</small></a>
    <a href="#/memos" class="today ${memosOpen ? "warn" : ""}"><b>${memosOpen}</b><span>処理されていないメモ</span><small>リマインド ${alertsAll.filter(a => a.kind === "メモ").length}件</small></a>
    <a href="#/sites" class="today"><b>${posted}/${working.length}</b><span>今日の日報（施工中）</span><small>${posted === working.length ? "すべて提出済み" : "未提出あり"}</small></a>
    <a href="#/cases" class="today"><b>${cases.filter(c => c.status === "見積り中").length}</b><span>見積り中の案件</span><small>返事待ちの確認へ</small></a></section>`;
  const bizCards = state.data.businesses.map(b => {
    const bs = getScope(b.id), sm = C.summarize(bs), bm = sm.metrics, c = bizColor(b.id), L = bs.L, mo = bs.months[L];
    const own = b.id === "reform" ? cases : [];
    let extra = "";
    if (b.id === "reform") {
      const act = own.filter(x => x.status === "進行中").length, wait = own.filter(x => x.status === "受注").length, quo = own.filter(x => x.status === "見積り中").length, al = alertsAll.filter(a => a.caseId && own.some(x => x.id === a.caseId) && a.kind !== "メモ");
      extra = `<div class="bz-facts"><div><small>施工中の現場</small><b>${act}件</b></div><div><small>着工待ち</small><b>${wait}件</b></div><div><small>見積り中</small><b>${quo}件</b></div><div class="${al.length ? "warn" : ""}"><small>要対応</small><b>${al.length}件</b></div></div>`;
    } else {
      const ts = C.teamStats(state.data.advisors, L).total;
      extra = `<div class="bz-facts"><div><small>面談</small><b>${ts.interviews}件</b></div><div><small>成約</small><b>${ts.hires}件</b></div><div><small>成約率</small><b>${fmtPct(ts.hireRate)}</b></div><div><small>平均単価</small><b>${fmtMan(ts.unitPrice)}万円</b></div></div>`;
    }
    const links = b.id === "reform" ? [["損益を見る", "#/pl/reform"], ["現場の進捗", "#/sites"], ["担当者別", "#/staff"]] : [["損益を見る", "#/pl/staffing"], ["活動分析", "#/activity"], ["担当者別", "#/staff"]];
    return `<article class="card biz-home" style="--bz1:${c.c1};--bz2:${c.c2}"><div class="bz-head">${bizLogo(b.id)}<div><h3>${esc(b.name)}</h3><p class="bz-tag">${b.id === "reform" ? "工事の受注から引き渡しまで" : "求人・面談から成約まで"}</p></div><div class="bz-spark">${spark(lastN(bs.sales, L), c.c2, "bz" + b.id)}</div></div>
      <div class="bz-main"><div><small>累計の売上（期初〜${mo}）</small><div class="big">${fmtMan(bm.sales.cum)}<span>万円</span></div></div><div class="bz-chips">${diffTag("計画との差", bm.sales.diff)}${tag("前年累計比", bm.sales.cumYoyPct)}${tag("前月比", bm.sales.momPct)}</div></div>
      <div class="bz-prog"><div class="r2"><span>売上の目標進捗</span><b>${fmtPct(bm.sales.progress)}</b></div>${pbar(bm.sales.progress, bm.sales.planProgress, b.name + "の売上進捗", "gold")}<div class="r2"><span>目標 ${fmtMan(bm.sales.target)}万円・計画どおりなら ${fmtPct(bm.sales.planProgress)}</span><span>${mo}の売上 ${fmtMan(bm.sales.now)}万円</span></div></div>
      <div class="bz-profit"><div><small>累計の利益</small><b class="${bm.profit.cum >= 0 ? "up" : "down"}">${fmtMan(bm.profit.cum, { sign: true })}万円</b></div><div><small>利益率</small><b>${fmtPct(sm.profitRate)}</b></div><div><small>原価率</small><b>${fmtPct(sm.costRate)}</b></div></div>${extra}
      <div class="bz-links">${links.map(([t, h]) => `<a class="btn small" href="${h}">${t}</a>`).join("")}</div></article>`;
  }).join("");
  const list = [...bizInsights(state.data, state.overrides), ...insights("all")].slice(0, 4);
  const finds = list.map(f => findingHtml(f)).join("");
  const quick = ROUTES.filter(r => !["home"].includes(r.path)).slice(0, 12).map(r => `<a href="#/${r.path}">${svgI(ICON[r.icon])}<span>${esc(r.nav)}</span></a>`).join("");
  void post;
  return `<section class="kpis k5" aria-label="主要な数字">${cards}</section>${check}
    <section class="grid2">${bizCards}</section>
    <section class="card panel"><h2 class="ttl">現場でいま対応が必要なこと（アラート）</h2>${alertListHtml(getAlerts(), { limit: 4 })}<div class="tools"><a class="btn small" href="#/sites">現場進捗状況で全部見る</a></div></section>
    <section class="card panel"><h2 class="ttl">いま気をつけたいこと</h2>${finds}<p class="note">AIは未接続です。数字から決まった規則で作っています。</p></section>
    <section><h2 class="ttl" style="margin:0 0 10px">ページへ移る</h2><div class="quick">${quick}</div></section>`;
}

function findingHtml(f) {
  const lv = { warn: ["注意", "warn"], good: ["良い点", "good"], info: ["参考", "info"] }[f.level];
  return `<div class="finding"><span class="lv ${lv[1]}">${lv[0]}</span><div><h3>${esc(f.title)}</h3><p>${esc(f.detail)}</p>${f.action ? `<div class="act">→ ${esc(f.action)}</div>` : ""}</div></div>`;
}

/* ---------- 売上分析 ---------- */
export function renderSales(route, post) {
  const s = getScope("all"), sm = C.summarize(s), m = sm.metrics, L = s.L, mo = s.months[L];
  const comp = C.composition(state.data, state.overrides);
  const top = [...comp.parts].sort((a, b) => b.salesPct - a.salesPct)[0];
  const kpis = [
    kpi({ tone: "sky", icon: "coin", label: `売上（${mo}）`, value: fmtMan(m.sales.now), unit: "万円", sub: `前月 ${fmtMan(m.sales.mom)}万円／前年同月 ${fmtMan(m.sales.yoy)}万円`, tags: trendTags(m.sales), sparkHtml: spark(lastN(s.sales, L), "#25d9ef", "s1") }),
    kpi({ tone: "sky", icon: "layers", label: `累計売上（期初〜${mo}）`, value: fmtMan(m.sales.cum), unit: "万円", sub: `前年の同じ時期 ${fmtMan(m.sales.cumYoy)}万円`, tags: state.showYoY ? tag("前年比", m.sales.cumYoyPct) : "" }),
    kpi({ tone: "gold", icon: "target", label: "売上の目標進捗", value: fmtPct(m.sales.progress).replace("%", ""), unit: "%", sub: `目標 ${fmtMan(m.sales.target)}万円`, tags: diffTag("計画との差", m.sales.diff), barHtml: pbar(m.sales.progress, m.sales.planProgress, "売上の目標進捗") }),
    kpi({ tone: "cyan", icon: "reform", label: "売上の最も大きい事業", value: fmtPct(top.salesPct).replace("%", ""), unit: "%", sub: `${esc(top.name)}（${fmtMan(top.sales)}万円）` }),
  ].join("");
  // 月ごとの表
  const rs = getScope("reform"), ss = getScope("staffing");
  let rows = "", cumA = 0;
  for (let i = 0; i <= L; i++) {
    cumA += s.sales[i];
    const mom = i > 0 ? C.pctChange(s.sales[i], s.sales[i - 1]) : null, yoy = C.pctChange(s.sales[i], s.prev.sales[i]), d = s.sales[i] - s.plan.sales[i];
    rows += `<tr><td>${esc(s.months[i])}</td><td>${fmtMan(rs.sales[i])}</td><td>${fmtMan(ss.sales[i])}</td><td><b>${fmtMan(s.sales[i])}</b></td>
      ${state.showMoM ? `<td class="${(mom ?? 0) >= 0 ? "up" : "down"}">${fmtPct(mom, { sign: true })}</td>` : ""}${state.showYoY ? `<td>${fmtMan(s.prev.sales[i])}</td><td class="${(yoy ?? 0) >= 0 ? "up" : "down"}">${fmtPct(yoy, { sign: true })}</td>` : ""}
      <td>${fmtMan(s.plan.sales[i])}</td><td class="${d >= 0 ? "up" : "down"}">${fmtMan(d, { sign: true })}</td></tr>`;
  }
  const tot = k => { let a = 0; for (let i = 0; i <= L; i++) a += k[i]; return a; };
  const totPrev = tot(s.prev.sales), totPlan = tot(s.plan.sales);
  rows += `<tr class="total"><td>累計</td><td>${fmtMan(tot(rs.sales))}</td><td>${fmtMan(tot(ss.sales))}</td><td>${fmtMan(cumA)}</td>${state.showMoM ? "<td></td>" : ""}${state.showYoY ? `<td>${fmtMan(totPrev)}</td><td class="${cumA >= totPrev ? "up" : "down"}">${fmtPct(C.pctChange(cumA, totPrev), { sign: true })}</td>` : ""}<td>${fmtMan(totPlan)}</td><td class="${cumA - totPlan >= 0 ? "up" : "down"}">${fmtMan(cumA - totPlan, { sign: true })}</td></tr>`;
  const head = `<tr>${th("月")}${th("リフォーム")}${th("人材紹介")}${th("売上合計")}${state.showMoM ? th("前月比") : ""}${state.showYoY ? th("前年同月") + th("前年比") : ""}${th("計画")}${th("計画との差")}</tr>`;
  const compose = composeCard("all", s, sm);
  postChart(post, s, "sales");
  return `${`<section class="kpis k5" aria-label="売上の主な数字">${kpis}</section>`}
    <section class="grid">${chartCard(s, { metricFixed: "sales" })}${compose}
      <article class="card compare" aria-labelledby="bzTitle"><h2 class="ttl" id="bzTitle">事業ごとの伸び</h2><div style="display:grid;gap:12px">${state.data.businesses.map(b => { const bm = C.summarize(getScope(b.id)).metrics.sales; return `<div class="cmp"><div class="r"><span>${esc(b.name)}</span><span>${fmtMan(bm.cum)}万円</span></div>${pbar(bm.progress, bm.planProgress, b.name)}<div class="f"><span>目標進捗 ${fmtPct(bm.progress)}</span><span class="tags">${state.showYoY ? tag("前年累計比", bm.cumYoyPct) : ""}${state.showMoM ? tag("前月比", bm.momPct) : ""}</span></div></div>`; }).join("")}</div></article></section>
    ${siteMoneyHtml()}
    <section class="card panel"><h2 class="ttl">月ごとの売上（万円）</h2>${tableWrap(`<table class="tbl"><caption class="sr-only" style="position:absolute;left:-9999px">月ごとの売上</caption><thead>${head}</thead><tbody>${rows}</tbody></table>`)}</section>`;
}

/* ---------- 活動分析 ---------- */
export function renderActivity(route, post) {
  const L = getScope("all").L; void post;
  const cards = state.data.businesses.map(b => {
    const f = C.funnel(b, L), sales = C.cumulative(b.sales)[L];
    const maxC = f[0].count || 1;
    const bars = f.map((st, i) => `<div class="fn"><span>${esc(st.name)}</span><div class="bar-h" role="img" aria-label="${esc(st.name)} ${st.count}${b.activityUnit}"><i style="width:${st.count / maxC * 100}%"></i></div><div class="c">${st.count.toLocaleString("ja-JP")}${b.activityUnit}<small>${i === 0 ? "最初の段階" : `前の段階から ${fmtPct(st.fromPrev)}`}</small></div></div>`).join("");
    const last = f[f.length - 1], second = f[1];
    const derived = b.id === "reform"
      ? [["受注率（見積→受注）", fmtPct(C.ratio(second.count, f[0].count))], ["平均受注単価", `${fmtMan(sales / second.count)}万円`], ["完工率（受注→完工）", fmtPct(C.ratio(last.count, second.count))]]
      : [["成約率（面談→入社）", fmtPct(C.ratio(last.count, second.count))], ["内定→入社", fmtPct(C.ratio(last.count, f[f.length - 2].count))], ["1成約あたりの売上", `${fmtMan(sales / last.count)}万円`]];
    let trs = ""; const keys = Object.keys(b.activity);
    for (let i = 0; i <= L; i++) trs += `<tr><td>${esc(state.data.months[i])}</td>${keys.map(k => `<td>${b.activity[k][i]}</td>`).join("")}</tr>`;
    return `<article class="card panel"><h2 class="ttl">${svgI(ICON[b.id]).replace("<svg", '<svg style="width:18px;height:18px;stroke:#66f3ff;fill:none;stroke-width:1.7"')} ${esc(b.name)}の流れ（期初〜${esc(state.data.months[L])}）</h2>
      <div class="funnel">${bars}</div>
      <div class="tags" style="margin:12px 0">${derived.map(d => `<span class="tag flat">${esc(d[0])} <b style="color:#fff">${d[1]}</b></span>`).join("")}</div>
      ${tableWrap(`<table class="tbl"><thead><tr>${th("月")}${keys.map(k => th(k)).join("")}</tr></thead><tbody>${trs}</tbody></table>`)}
      <p class="note">${b.id === "staffing" ? "人材紹介の流れ：求人受付 → 求職者面談 → 推薦 → 選考 → 内定 → 入社。" : "リフォームの流れ：見積 → 受注 → 着工 → 完工。"}件数は合成サンプルです。</p></article>`;
  }).join("");
  return `<section class="grid2">${cards}</section>`;
}

/* ---------- 担当者別 ---------- */
export function renderStaff(route, post) {
  const L = getScope("all").L; void post;
  const rows0 = C.peopleTable(state.data, state.staffBiz, L), { key, dir } = state.sort;
  const rows = [...rows0].sort((a, b) => (typeof a[key] === "string" ? a[key].localeCompare(b[key], "ja") : (a[key] - b[key])) * dir);
  const tot = rows.reduce((a, r) => ({ sales: a.sales + r.sales, labor: a.labor + r.labor }), { sales: 0, labor: 0 });
  const sortBtn = (k, label) => `<button type="button" class="sort" data-sort="${k}" aria-pressed="${state.sort.key === k}" title="${label}で並べ替え">${label}${state.sort.key === k ? (state.sort.dir < 0 ? " ↓" : " ↑") : ""}</button>`;
  const trs = rows.map((r, i) => `<tr><td>${i + 1}. ${esc(r.name)}</td><td>${esc(r.businessName)}</td><td>${fmtMan(r.sales)}</td><td>${fmtMan(r.labor)}</td><td class="${r.profit >= 0 ? "up" : "down"}">${fmtMan(r.profit)}</td><td>${fmtPct(r.profitRate)}</td><td style="min-width:140px"><div style="display:flex;align-items:center;gap:8px">${bar(r.salesPct)}<span>${fmtPct(r.salesPct)}</span></div></td></tr>`).join("");
  const ths = `<tr>${th("担当者")}${th("事業")}<th scope="col" aria-sort="${key === "sales" ? (dir < 0 ? "descending" : "ascending") : "none"}">${sortBtn("sales", "売上")}</th><th scope="col">${sortBtn("labor", "人件費")}</th><th scope="col">${sortBtn("profit", "利益")}</th><th scope="col">${sortBtn("profitRate", "利益率")}</th>${th("売上の構成比")}</tr>`;
  return `<section class="card panel"><div class="ctl-row"><h2 class="ttl">担当者別の売上・人件費・利益（期初〜${esc(state.data.months[L])}）</h2>
    <div class="ctl"><label for="staffBiz">事業</label><select class="sel" id="staffBiz"><option value="all"${state.staffBiz === "all" ? " selected" : ""}>すべて</option>${state.data.businesses.map(b => `<option value="${b.id}"${state.staffBiz === b.id ? " selected" : ""}>${esc(b.name)}</option>`).join("")}</select></div></div>
    ${tableWrap(`<table class="tbl"><thead>${ths}</thead><tbody>${trs}<tr class="total"><td>合計</td><td></td><td>${fmtMan(tot.sales)}</td><td>${fmtMan(tot.labor)}</td><td>${fmtMan(tot.sales - tot.labor)}</td><td>${fmtPct(C.ratio(tot.sales - tot.labor, tot.sales))}</td><td></td></tr></tbody></table>`)}
    <p class="note">担当者名と数字は合成サンプルです。利益は「担当した売上 − 人件費」で、資材費は含めていません（担当者に分けていないため）。見出しを押すと並べ替えられます。</p></section>`;
}

/* ---------- 目標・予実 ---------- */
export function renderGoals(route, post) {
  const tg = C.effectiveTargets(state.data, state.overrides), all = getScope("all"), L = all.L;
  const f = (id, k, label) => `<div class="field"><label for="g_${id}_${k}">${esc(label)}（万円）</label><input id="g_${id}_${k}" name="${id}.${k}" type="number" min="0" step="1" inputmode="numeric" value="${tg[id][k]}"></div>`;
  const form = `<section class="card panel"><h2 class="ttl">目標額（年間）</h2>
    <form id="goalForm" novalidate><div class="form-grid">${state.data.businesses.map(b => f(b.id, "sales", b.short + "の売上目標") + f(b.id, "profit", b.short + "の利益目標")).join("")}</div>
    <div class="tools" style="margin-top:12px"><button class="btn" type="submit">この目標で計算し直す</button><button class="btn" type="button" id="goalReset">元の目標に戻す</button></div>
    <p class="msg" id="goalMsg" role="status"></p></form>
    <p class="note">ここで入れた目標は、この端末のこのブラウザにだけ保存されます（本番の目標額は、納品時に決めます）。</p></section>`;
  const rowFor = (sc, k, label) => { const s = getScope(sc), x = C.summarize(s).metrics[k];
    return `<tr><td>${esc(SCOPE_NAME[sc])}</td><td>${label}</td><td>${fmtMan(x.target)}</td><td>${fmtMan(x.cum)}</td><td>${fmtPct(x.progress)}</td><td>${fmtMan(x.planCum)}</td><td class="${x.diff >= 0 ? "up" : "down"}">${fmtMan(x.diff, { sign: true })}</td><td>${fmtMan(x.forecast)}</td><td class="${x.forecast - x.target >= 0 ? "up" : "down"}">${fmtMan(x.forecast - x.target, { sign: true })}</td></tr>`; };
  let tr = ""; for (const sc of ["all", "reform", "staffing"]) tr += rowFor(sc, "sales", "売上") + rowFor(sc, "profit", "利益");
  const sum = `<section class="card panel"><h2 class="ttl">目標と実績（期初〜${esc(all.months[L])}）</h2>${tableWrap(`<table class="tbl"><thead><tr>${th("範囲")}${th("項目")}${th("年間目標")}${th("実績の累計")}${th("進捗")}${th("計画の累計")}${th("計画との差")}${th("年間の見込み")}${th("見込みと目標の差")}</tr></thead><tbody>${tr}</tbody></table>`)}
    <p class="note">「年間の見込み」は、ここまでの実績を、季節の重み（月ごとの計画の割合）で1年分に直した数字です。確かな予測ではありません。</p></section>`;
  // 月ごとの予実（全体の売上）
  let mt = "", cA = 0, cP = 0;
  for (let i = 0; i < 12; i++) {
    cP += all.plan.sales[i]; const has = typeof all.sales[i] === "number"; if (has) cA += all.sales[i];
    mt += `<tr class="${has ? "" : "future"}"><td>${esc(all.months[i])}</td><td>${fmtMan(all.plan.sales[i])}</td><td>${has ? fmtMan(all.sales[i]) : "—"}</td><td class="${has ? (all.sales[i] - all.plan.sales[i] >= 0 ? "up" : "down") : ""}">${has ? fmtMan(all.sales[i] - all.plan.sales[i], { sign: true }) : "—"}</td><td>${fmtMan(cP)}</td><td>${has ? fmtMan(cA) : "—"}</td><td class="${has ? (cA - cP >= 0 ? "up" : "down") : ""}">${has ? fmtMan(cA - cP, { sign: true }) : "—"}</td></tr>`;
  }
  const monthly = `<section class="card panel"><h2 class="ttl">月ごとの予実（売上・全事業）</h2>${tableWrap(`<table class="tbl"><thead><tr>${th("月")}${th("計画")}${th("実績")}${th("差")}${th("累計の計画")}${th("累計の実績")}${th("累計の差")}</tr></thead><tbody>${mt}</tbody></table>`)}</section>`;
  postChart(post, all, "sales");
  return `${form}${sum}<section class="grid">${chartCard(all, { metricFixed: "sales" })}${goalCard(all, C.summarize(all))}</section>${monthly}`;
}

/* ---------- レポート ---------- */
function statAt(s, key, j) {
  const a = s[key], p = s.prev[key], cum = C.cumulative(a), cp = C.cumulative(p);
  return { now: a[j], mom: j > 0 ? a[j - 1] : null, yoy: p[j], cum: cum[j], cumYoy: cp[j] };
}
export function reportModel(j) {
  const s = getScope("all");
  const rows = [["売上", "sales"], ["資材費", "materials"], ["人件費", "labor"], ["原価（合計）", "cost"], ["利益", "profit"]].map(([n, k]) => ({ name: n, key: k, ...statAt(s, k, j) }));
  const plan = k => s.plan[k].slice(0, j + 1).reduce((a, b) => a + b, 0);
  const biz = state.data.businesses.map(b => { const bs = getScope(b.id), sa = statAt(bs, "sales", j), pr = statAt(bs, "profit", j), co = statAt(bs, "cost", j); return { name: b.name, sales: sa.now, salesCum: sa.cum, cost: co.now, costCum: co.cum, profit: pr.now, profitCum: pr.cum }; });
  const totS = biz.reduce((a, x) => a + x.salesCum, 0), totP = biz.reduce((a, x) => a + x.profitCum, 0);
  biz.forEach(x => { x.salesPct = C.ratio(x.salesCum, totS); x.profitPct = C.ratio(x.profitCum, totP); });
  const goals = [["売上", "sales"], ["利益", "profit"]].map(([n, k]) => { const cum = rows.find(r => r.key === k).cum; return { name: n, target: s.target[k], cum, progress: C.ratio(cum, s.target[k]), planCum: plan(k), diff: cum - plan(k) }; });
  return { s, month: s.months[j], rows, biz, goals, j };
}
export function renderReport(route, post) {
  void post; const L = getScope("all").L, j = state.reportIdx == null ? L : Math.min(state.reportIdx, L), r = reportModel(j);
  const opts = r.s.months.slice(0, L + 1).map((m, i) => `<option value="${i}"${i === j ? " selected" : ""}>${esc(m)}</option>`).join("");
  const t1 = r.rows.map(x => `<tr class="${x.key === "profit" || x.key === "sales" ? "total" : ""}"><td>${x.name}</td><td>${fmtMan(x.now)}</td><td>${fmtMan(x.mom)}</td><td class="${(C.pctChange(x.now, x.mom) ?? 0) >= 0 ? "up" : "down"}">${fmtPct(C.pctChange(x.now, x.mom), { sign: true })}</td><td>${fmtMan(x.yoy)}</td><td class="${(C.pctChange(x.now, x.yoy) ?? 0) >= 0 ? "up" : "down"}">${fmtPct(C.pctChange(x.now, x.yoy), { sign: true })}</td><td>${fmtMan(x.cum)}</td><td>${fmtMan(x.cumYoy)}</td></tr>`).join("");
  const t2 = r.biz.map(x => `<tr><td>${esc(x.name)}</td><td>${fmtMan(x.sales)}</td><td>${fmtMan(x.salesCum)}</td><td>${fmtPct(x.salesPct)}</td><td>${fmtMan(x.costCum)}</td><td>${fmtMan(x.profitCum)}</td><td>${fmtPct(x.profitPct)}</td></tr>`).join("");
  const t3 = r.goals.map(x => `<tr><td>${x.name}</td><td>${fmtMan(x.target)}</td><td>${fmtMan(x.cum)}</td><td>${fmtPct(x.progress)}</td><td>${fmtMan(x.planCum)}</td><td class="${x.diff >= 0 ? "up" : "down"}">${fmtMan(x.diff, { sign: true })}</td></tr>`).join("");
  return `<section class="card report-sheet" aria-labelledby="rpTitle"><div class="ctl-row no-print"><h2 id="rpTitle" style="margin:0">月次レポート（${esc(r.month)}）</h2>
    <div class="tools"><div class="ctl"><label for="reportIdx">対象の月</label><select class="sel" id="reportIdx" style="min-width:100px">${opts}</select></div>
    <button class="btn" type="button" id="btnPrint" style="align-self:flex-end">印刷</button></div></div>
    <h2 class="print-only" style="display:none">月次レポート（${esc(r.month)}）</h2>
    <p class="note">${esc(state.data.fiscalYear)}。単位は万円。合成サンプルの数字です。</p>
    <h3>損益のまとめ</h3>${tableWrap(`<table class="tbl"><thead><tr>${th("項目")}${th(r.month)}${th("前月")}${th("前月比")}${th("前年同月")}${th("前年比")}${th("累計")}${th("前年の累計")}</tr></thead><tbody>${t1}</tbody></table>`)}
    <h3>事業別</h3>${tableWrap(`<table class="tbl"><thead><tr>${th("事業")}${th(r.month + "の売上")}${th("売上の累計")}${th("売上の構成比")}${th("原価の累計")}${th("利益の累計")}${th("利益の構成比")}</tr></thead><tbody>${t2}</tbody></table>`)}
    <h3>目標に対する進捗</h3>${tableWrap(`<table class="tbl"><thead><tr>${th("項目")}${th("年間目標")}${th("累計の実績")}${th("進捗")}${th("計画の累計")}${th("計画との差")}</tr></thead><tbody>${t3}</tbody></table>`)}</section>`;
}

/* ---------- AI分析 ---------- */
export function renderAI(route, post) {
  void post;
  const sc = state.aiScope || "all", list = [...(sc === "all" ? bizInsights(state.data, state.overrides) : []), ...insights(sc)];
  const n = { warn: 0, good: 0, info: 0 }; list.forEach(x => n[x.level]++);
  const order = { warn: 0, info: 1, good: 2 }; list.sort((a, b) => order[a.level] - order[b.level]);
  return `<section class="card panel"><div class="ctl-row"><h2 class="ttl" id="aiTitle">AIインサイト（数字から決まった規則で作成）</h2>
    <div class="ctl"><label for="aiScope">分析の範囲</label><select class="sel" id="aiScope">${["all", "reform", "staffing"].map(k => `<option value="${k}"${sc === k ? " selected" : ""}>${esc(SCOPE_NAME[k])}</option>`).join("")}</select></div></div>
    <div class="tags" style="margin-bottom:6px"><span class="tag down">注意 ${n.warn}件</span><span class="tag flat">参考 ${n.info}件</span><span class="tag up">良い点 ${n.good}件</span></div>
    ${list.map(findingHtml).join("")}<p class="note">AI（文章を作る仕組み）はまだつないでいません。売上・原価・利益・目標の数字から、決まった規則で作っています。出した数字の根拠は、損益分析・目標・予実のページで確かめられます。</p></section>`;
}

function emptyHtml() { return `<div class="card empty">実績の数字がまだありません。データを確かめてください。</div>`; }

/* ---------- ページの一覧 ---------- */
export const ROUTES = [
  { path: "home", nav: "ホーム", icon: "home", eyebrow: "OVERVIEW", title: "経営ホーム", desc: "全事業の売上・原価・利益・目標進捗のまとめ。気になる所から各ページへ移れます。", ctrl: ["compare", "refresh"], render: renderHome, csv: "pl" },
  { path: "tasks", nav: "タスク", icon: "task", eyebrow: "TASKS", title: "タスク（自分のタスク・預けたタスク）", desc: "自分のタスクと、人に預けたタスクを見ます。頼む・受ける・報告する・確認するが、ここでできます。", ctrl: ["refresh"], render: renderTasks },
  { path: "cases", nav: "案件管理", icon: "cases", eyebrow: "CASE MANAGEMENT", title: "案件管理", desc: "案件の一覧と状況、受注額・粗利、月ごとの集計を管理します。商談の記録から、案件になったか・失注したかも見られます。", ctrl: ["refresh", "csv"], render: (r, post) => topBarHtml() + (state.cf.tab === "talks" ? renderTalks() : renderCases(r, post) + caseDetailHtml()), csv: "cases" },
  { path: "sites", nav: "現場進捗状況", icon: "site", eyebrow: "SITE PROGRESS", title: "現場進捗状況", desc: "現場ごとの進み具合と、工程表を確認します。工程の流れは仮です。", ctrl: ["refresh", "csv"], render: renderSites, csv: "sites" },
  { path: "craftsman", nav: "職人の確認ページ", icon: "person", sub: true, eyebrow: "CRAFTSMAN", title: "職人の確認ページ", desc: "職人が、日程の依頼を確認するページの見本です。ボタンを1回押すだけで、工程表に反映されます。", ctrl: ["refresh"], render: renderCraftsman },
  { path: "estimate", nav: "見積もり作成", icon: "estimate", eyebrow: "ESTIMATE", title: "見積もり作成", desc: "明細から、諸経費・値引き・消費税・粗利を自動で計算し、見積書を作ります。", ctrl: [], render: renderEstimate, csv: "estimate" },
  { path: "memos", nav: "メモ", icon: "memo", eyebrow: "MEMO", title: "メモ（現場の小さな記録）", desc: "現場でちょっと残したいことを、すぐ書き残す場所です。処理されていないメモは、リマインドします。", ctrl: ["refresh", "csv"], render: renderMemos, csv: "memos" },
  { path: "sales", nav: "売上分析", icon: "sales", eyebrow: "SALES ANALYTICS", title: "売上分析", desc: "売上の推移を、前月・前年・計画と比べます。事業ごとの伸びも見られます。", ctrl: ["range", "compare", "refresh", "csv"], render: renderSales, csv: "sales" },
  { path: "pl", nav: "損益分析", icon: "pl", eyebrow: "PROFIT ANALYTICS", title: "損益分析（全事業）", desc: "売上・原価（資材費と人件費）・利益と、目標に対する進捗を確認できます。", ctrl: ["range", "compare", "mode", "refresh", "csv"], scope: "all", render: renderPL, csv: "pl" },
  { path: "pl/reform", nav: "リフォーム事業", icon: "reform", sub: true, eyebrow: "PROFIT ANALYTICS", title: "損益分析（リフォーム事業）", desc: "リフォーム事業の売上・原価・利益と、目標に対する進捗です。", ctrl: ["range", "compare", "mode", "refresh", "csv"], scope: "reform", render: renderPL, csv: "pl" },
  { path: "pl/staffing", nav: "人材紹介業", icon: "staffing", sub: true, eyebrow: "PROFIT ANALYTICS", title: "損益分析（人材紹介業）", desc: "人材紹介業の売上・原価・利益と、目標に対する進捗です。", ctrl: ["range", "compare", "mode", "refresh", "csv"], scope: "staffing", render: renderPL, csv: "pl" },
  { path: "activity", nav: "活動分析", icon: "act", eyebrow: "ACTIVITY", title: "活動分析", desc: "売上につながる活動の件数と、段階ごとの通過率を事業別に見ます。", ctrl: ["refresh", "csv"], render: renderActivity, csv: "activity" },
  { path: "staff", nav: "担当者別", icon: "person", eyebrow: "BY STAFF", title: "担当者別（経営の分析）", desc: "担当者ごとの数字を、経営が分析的に見ます。リフォームは売上・コスト・利益、人材紹介のアドバイザーは面談・時間・単価・成約・売上です。", ctrl: ["refresh", "csv"], render: renderPeople, csv: "people" },
  { path: "goals", nav: "目標・予実", icon: "goal", eyebrow: "GOALS & FORECAST", title: "目標・予実", desc: "目標額と実績・計画の差、年間の見込みを確認します。目標額はここで変えられます。", ctrl: ["compare", "refresh", "csv"], render: renderGoals, csv: "goals" },
  { path: "report", nav: "レポート", icon: "report", eyebrow: "REPORT", title: "レポート", desc: "月ごとのまとめを作ります。印刷と CSV 出力ができます。", ctrl: ["refresh", "csv"], render: renderReport, csv: "report" },
  { path: "ai", nav: "AI分析", icon: "ai", eyebrow: "AI INSIGHT", title: "AI分析", desc: "数字から、注意する点と良い点、次の一手を出します。", ctrl: ["refresh"], render: renderAI, ai: true },
];

/* ---------- ページ上部（見出し・操作） ---------- */
export function headHtml(r) {
  const c = r.ctrl || [];
  let controls = "";
  if (c.includes("range")) controls += `<div class="ctl"><label for="selRange">期間</label><select class="sel" id="selRange"><option value="year"${state.range === "year" ? " selected" : ""}>今期（4月〜3月）</option><option value="6"${state.range === "6" ? " selected" : ""}>直近6か月</option><option value="3"${state.range === "3" ? " selected" : ""}>直近3か月</option></select></div>`;
  if (c.includes("compare")) controls += `<div class="ctl"><span style="display:block;font-size:11px;color:var(--text-muted);margin:0 0 4px 2px">比較の表示</span><div class="chips" role="group" aria-label="比較の表示">
    <button type="button" class="chip-toggle" data-toggle="mom" aria-pressed="${state.showMoM}"><span class="box"></span>前月比</button>
    <button type="button" class="chip-toggle" data-toggle="yoy" aria-pressed="${state.showYoY}"><span class="box"></span>前年比</button></div></div>`;
  if (c.includes("mode")) controls += `<div class="ctl"><span id="lblMode" style="display:block;font-size:11px;color:var(--text-muted);margin:0 0 4px 2px">表示</span><div class="seg" role="group" aria-labelledby="lblMode" id="seg">${[["both", "月次＋累計"], ["monthly", "月次のみ"], ["cum", "累計のみ"]].map(([k, t]) => `<button type="button" data-mode="${k}" aria-pressed="${state.mode === k}">${t}</button>`).join("")}</div></div>`;
  controls += `<div class="ctl"><span style="display:block;font-size:11px;color:var(--text-muted);margin:0 0 4px 2px">色味</span><div class="theme-switch" role="group" aria-label="色味">${[["navy", "ネイビー"], ["violet", "バイオレット"], ["forest", "フォレスト"], ["light", "ライト"]].map(([k, t]) => `<button type="button" data-theme="${k}" aria-pressed="${state.theme === k}" aria-label="${t}" title="${t}"></button>`).join("")}</div></div>`;
  let tools = "";
  if (c.includes("refresh")) tools += `<button class="btn" id="btnRefresh" type="button">データ更新</button>`;
  if (c.includes("csv")) tools += `<button class="btn" id="btnCsv" type="button">CSV出力</button>`;
  if (tools) controls += `<div class="tools">${tools}</div>`;
  return `<div><p class="eyebrow">${esc(r.eyebrow)}<span class="banner" id="banner"${state.data.isSample ? "" : " hidden"}>合成サンプル（実データではありません）</span></p><h1>${esc(r.title)}</h1><p class="sub">${esc(r.desc)}</p></div><div class="controls">${controls}</div>`;
}

/* ---------- CSV ---------- */
export function csvFor(r) {
  if (r.csv === "memos") return memosCsv();
  if (r.csv === "people") return peopleCsv();
  if (r.csv === "cases") return casesCsv();
  if (r.csv === "sites") return sitesCsv();
  if (r.csv === "estimate") return estCsv();
  const s = getScope(r.scope || "all"), L = s.L, rows = [];
  const kind = r.csv || "pl";
  if (kind === "staff") {
    rows.push(["担当者", "事業", "売上(万円)", "人件費(万円)", "利益(万円)", "利益率(%)", "売上の構成比(%)"]);
    C.peopleTable(state.data, state.staffBiz, L).forEach(p => rows.push([p.name, p.businessName, p.sales, p.labor, p.profit, p.profitRate?.toFixed(1), p.salesPct?.toFixed(1)]));
  } else if (kind === "activity") {
    state.data.businesses.forEach(b => { const keys = Object.keys(b.activity); rows.push([b.name]); rows.push(["月", ...keys]); for (let i = 0; i <= L; i++) rows.push([state.data.months[i], ...keys.map(k => b.activity[k][i])]); rows.push([]); });
  } else if (kind === "report") {
    const rep = reportModel(Math.min(state.reportIdx ?? L, L)); rows.push([`月次レポート ${rep.month}`]); rows.push(["項目", rep.month, "前月", "前年同月", "累計", "前年の累計"]);
    rep.rows.forEach(x => rows.push([x.name, x.now, x.mom, x.yoy, x.cum, x.cumYoy])); rows.push([]); rows.push(["事業", "売上の累計", "売上の構成比(%)", "利益の累計", "利益の構成比(%)"]);
    rep.biz.forEach(b => rows.push([b.name, b.salesCum, b.salesPct?.toFixed(1), b.profitCum, b.profitPct?.toFixed(1)]));
  } else if (kind === "goals") {
    rows.push(["月", "計画(売上)", "実績(売上)", "差"]); const a = getScope("all");
    for (let i = 0; i < 12; i++) rows.push([a.months[i], a.plan.sales[i].toFixed(1), a.sales[i] ?? "", a.sales[i] == null ? "" : (a.sales[i] - a.plan.sales[i]).toFixed(1)]);
  } else {
    rows.push([`対象：${s.name}`]); rows.push(["月", "売上", "資材費", "人件費", "原価", "利益", "売上の計画", "前年の売上"]);
    for (let i = 0; i < 12; i++) rows.push([s.months[i], s.sales[i] ?? "", s.materials[i] ?? "", s.labor[i] ?? "", s.cost[i] ?? "", s.profit[i] ?? "", s.plan.sales[i].toFixed(1), s.prev.sales[i]]);
  }
  const name = `${r.title.replace(/[（）]/g, "_")}.csv`;
  return { name, text: "﻿" + rows.map(x => x.map(v => { const t = v == null ? "" : String(v); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; }).join(",")).join("\r\n") };
}
