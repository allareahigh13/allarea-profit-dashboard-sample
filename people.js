/* 担当者別：経営の分析用。リフォーム＝売上・コスト・利益、人材紹介のアドバイザー＝面談・時間・単価・成約・売上。評価の「材料」を見るページ（点数は付けない）。 */
import * as C from "./calc.js";
import { state, getCases } from "./state.js";
import { esc, kpi, bar, fmtMan, fmtPct } from "./ui.js";

const man = v => fmtMan((Number.isFinite(v) ? v : NaN) / 10000);        // 円 → 万円
const th = t => `<th scope="col">${esc(t)}</th>`;
const f1 = v => (Number.isFinite(v) ? (Math.round(v * 10) / 10).toLocaleString("ja-JP") : "—");
const cls = v => (v == null ? "" : v >= 0 ? "up" : "down");
const L = () => C.buildScope(state.data, "all").L;
const sortBtn = (grp, cur, k, label) => `<th scope="col" aria-sort="${cur.key === k ? (cur.dir < 0 ? "descending" : "ascending") : "none"}"><button type="button" class="sort" data-pp-sort="${grp}:${k}" aria-pressed="${cur.key === k}" title="${label}で並べ替え">${label}${cur.key === k ? (cur.dir < 0 ? " ↓" : " ↑") : ""}</button></th>`;
const dv = m => (m == null ? "" : `<span class="dv" role="img" aria-label="${fmtPct(m)}"><i class="${m >= 0 ? "pos" : "neg"}" style="${m >= 0 ? "left:50%" : "right:50%"};width:${Math.min(Math.abs(m) / 40 * 50, 50)}%"></i><b></b></span>`);
const chip = (v, avg, good = true) => { const d = C.vsAvg(v, avg); if (d == null) return ""; const up = d > 3, down = d < -3, c = up ? (good ? "up" : "down") : down ? (good ? "down" : "up") : "flat"; return `<span class="tag ${c}" title="全体の平均との差">${d >= 0 ? "+" : "−"}${Math.abs(d).toFixed(0)}%</span>`; };

export function renderPeople(route, post) {
  void post;
  const tab = state.pp.tab, tabs = `<nav class="page-tabs" aria-label="担当者の種類"><a href="#/staff" data-pp-tab="reform" ${tab === "reform" ? 'aria-current="page"' : ""}>リフォーム事業（営業・現場の担当）</a><a href="#/staff" data-pp-tab="staffing" ${tab === "staffing" ? 'aria-current="page"' : ""}>人材紹介（アドバイザー）</a></nav>`;
  const note = `<section class="card panel"><h2 class="ttl">この画面の見方（評価につなげるときの注意）</h2><ul class="memo"><li>数字は、評価の<b>材料</b>です。点数や順位は付けていません。件数や売上だけでなく、案件の難しさ・担当した期間・お客様の評価も合わせて見る必要があります。</li><li>担当者の数字を評価に使うときは、使う数字と基準を、本人に前もって伝えることが大切です。会社として決めてから使ってください（この画面は、それを決めるための分析用です）。</li><li>数字はすべて合成のサンプルです。「全体の平均との差」は、平均より多い・少ないの目安です。</li></ul></section>`;
  return `${tabs}${tab === "reform" ? reformHtml() : advisorHtml()}${note}`;
}

/* ---------- リフォーム ---------- */
function reformHtml() {
  const all = getCases(), rows = C.siteMoneyRows(all, state.data.siteFinance || {}), ppl = C.reformPeople(rows, all), tot = C.moneyTotals(rows), { key, dir } = state.pp.sortR;
  const sorted = [...ppl].sort((a, b) => ((a[key] ?? -1e18) - (b[key] ?? -1e18)) * dir), avgMargin = tot.margin, avgSize = tot.count ? tot.earned / tot.count : null;
  const sel = ppl.find(p => p.name === state.pp.selR) || sorted[0];
  const kpis = [
    kpi({ tone: "sky", icon: "person", label: "担当者の数", value: String(ppl.length), unit: "人", sub: `現場 ${tot.count}件を担当（案件の状況から集計）` }),
    kpi({ tone: "sky", icon: "coin", label: "出来高の売上（万円）", value: man(tot.earned), unit: "万円", sub: `予定売上 ${man(tot.planned)}万円・進み具合に応じた売上` }),
    kpi({ tone: "amber", icon: "cost", label: "コスト（万円）", value: man(tot.cost), unit: "万円", sub: "資材・人件費・外注など" }),
    kpi({ tone: "teal", icon: "layers", label: "利益（万円）", value: fmtMan(tot.profit / 10000, { sign: true }), unit: "万円", sub: `利益率 ${fmtPct(tot.margin)}・プラス ${tot.plus}件／マイナス ${tot.minus}件` }),
  ].join("");
  const trs = sorted.map(p => `<tr class="${sel && sel.name === p.name ? "sel" : ""}"><td class="txt"><button type="button" class="linkbtn" data-pp-pick="reform:${esc(p.name)}"><b>${esc(p.name)}</b></button></td><td>${p.sites}件</td><td>${man(p.earned)}</td><td>${man(p.cost)}</td><td class="${cls(p.profit)}"><b>${fmtMan(p.profit / 10000, { sign: true })}</b></td>
    <td class="dvcell">${dv(p.margin)}<span class="${cls(p.margin)}">${fmtPct(p.margin, { sign: true })}</span> ${chip(p.margin, avgMargin)}</td><td>${man(p.avgSize)} ${chip(p.avgSize, avgSize)}</td><td>${p.plus}／<span class="${p.minus ? "down" : ""}">${p.minus}</span></td><td>${fmtPct(p.winRate)}<br><small>受注 ${p.ordered}・失注 ${p.lost}</small></td><td>${p.quoting}件<br><small>${man(p.pipeline)}万円</small></td></tr>`).join("");
  const head = `<tr>${th("担当者")}${sortBtn("R", state.pp.sortR, "sites", "現場数")}${sortBtn("R", state.pp.sortR, "earned", "出来高売上（万円）")}${sortBtn("R", state.pp.sortR, "cost", "コスト（万円）")}${sortBtn("R", state.pp.sortR, "profit", "利益（万円）")}${sortBtn("R", state.pp.sortR, "margin", "利益率（平均との差）")}${sortBtn("R", state.pp.sortR, "avgSize", "1現場の売上（万円）")}${th("プラス／マイナスの現場")}${sortBtn("R", state.pp.sortR, "winRate", "受注率")}${th("見積り中")}</tr>`;
  const detail = sel ? (() => { const mine = rows.filter(r => r.person === sel.name).sort((a, b) => b.profit - a.profit);
    return `<section class="card panel"><h2 class="ttl">${esc(sel.name)} さんの現場（収支）</h2><div class="tablewrap"><table class="tbl"><thead><tr>${["現場", "発注元", "出来高売上（万円）", "コスト（万円）", "利益（万円）", "利益率"].map(th).join("")}</tr></thead><tbody>${mine.map(r => `<tr><td class="txt"><b>${esc(r.name)}</b><br><small>${esc(r.status)}・${r.days}日</small></td><td class="txt">${esc(r.origin)}</td><td>${man(r.earned)}</td><td>${man(r.cost)}</td><td class="${cls(r.profit)}"><b>${fmtMan(r.profit / 10000, { sign: true })}</b></td><td class="dvcell">${dv(r.margin)}<span class="${cls(r.margin)}">${fmtPct(r.margin, { sign: true })}</span></td></tr>`).join("")}</tbody></table></div>
      <p class="note">利益がマイナスの現場は、赤で出ます。原因（追加工事の費用が取れていない・コストが先行しているなど）は、現場の詳細と日報で確かめられます。</p></section>`; })() : "";
  return `<section class="kpis k5" aria-label="リフォーム事業の担当者の数字">${kpis}</section>
    <section class="card panel"><h2 class="ttl">担当者ごとの売上・コスト・利益（リフォーム事業）</h2><div class="tablewrap"><table class="tbl money"><thead>${head}</thead><tbody>${trs}</tbody></table></div>
    <p class="note">売上は「契約額 × 進み具合」の出来高、コストはこれまでにかかった実績です。利益率の右のチップは、全体の平均との差（例：+30%＝平均より3割高い）。担当者の名前を押すと、その人の現場を下に出します。</p></section>${detail}`;
}

/* ---------- 人材紹介のアドバイザー ---------- */
function advisorHtml() {
  const up = L(), ts = C.teamStats(state.data.advisors, up), T = ts.total, { key, dir } = state.pp.sortA, list = ts.list;
  const sorted = [...list].sort((a, b) => ((a[key] ?? -1e18) - (b[key] ?? -1e18)) * dir), sel = list.find(a => a.name === state.pp.selA) || sorted[0];
  const kpis = [
    kpi({ tone: "sky", icon: "person", label: "アドバイザーの数", value: String(list.length), unit: "人", sub: `期初〜${state.data.months[up]}の合計` }),
    kpi({ tone: "sky", icon: "act", label: "面談の数／時間", value: String(T.interviews), unit: "件", sub: `面談の時間 ${f1(T.hours)}時間（1件あたり ${f1(T.hours * 60 / T.interviews)}分）` }),
    kpi({ tone: "teal", icon: "check", label: "成約数", value: String(T.hires), unit: "件", sub: `成約率 ${fmtPct(T.hireRate)}（面談 → 成約）` }),
    kpi({ tone: "amber", icon: "coin", label: "売上（万円）", value: f1(T.sales), unit: "万円", sub: `平均の単価 ${f1(T.unitPrice)}万円／面談1時間あたり ${f1(T.salesPerHour)}万円` }),
  ].join("");
  const trs = sorted.map(a => `<tr class="${sel && sel.name === a.name ? "sel" : ""}"><td class="txt"><button type="button" class="linkbtn" data-pp-pick="adv:${esc(a.name)}"><b>${esc(a.name)}</b></button></td><td>${a.interviews}件</td><td>${f1(a.hours)}時間<br><small>1件 ${f1(a.minutesPerInterview)}分</small></td><td>${a.recommended}</td><td>${a.offers}</td><td><b>${a.hires}件</b></td>
    <td class="up"><b>${f1(a.sales)}</b></td><td>${f1(a.unitPrice)} ${chip(a.unitPrice, T.unitPrice)}</td><td>${fmtPct(a.hireRate)} ${chip(a.hireRate, T.hireRate)}</td><td>${f1(a.salesPerHour)} ${chip(a.salesPerHour, T.salesPerHour)}</td></tr>`).join("");
  const sb = (k, l) => sortBtn("A", state.pp.sortA, k, l);
  const head = `<tr>${th("アドバイザー")}${sb("interviews", "面談数")}${sb("hours", "面談の時間")}${sb("recommended", "推薦")}${sb("offers", "内定")}${sb("hires", "成約")}${sb("sales", "売上（万円）")}${sb("unitPrice", "単価（万円）")}${sb("hireRate", "成約率")}${sb("salesPerHour", "面談1時間あたり売上（万円）")}</tr>`;
  const maxI = Math.max(1, ...list.map(a => a.interviews));
  const funnel = `<div class="funnel-grid">${list.map(a => `<div class="kind-card"><div class="r2"><b>${esc(a.name)}</b><span>成約率 ${fmtPct(a.hireRate)}</span></div>
    ${[["面談", a.interviews, a.interviews], ["推薦", a.recommended, a.recRate], ["内定", a.offers, a.offerRate], ["成約", a.hires, a.acceptRate]].map(([n, v, r], i) => `<div class="fn" style="grid-template-columns:50px 1fr 90px"><span>${n}</span><div class="bar-h"><i style="width:${v / maxI * 100}%"></i></div><div class="c">${v}件<small>${i === 0 ? "" : "前の段階の " + fmtPct(r)}</small></div></div>`).join("")}</div>`).join("")}</div>`;
  const adv = state.data.advisors.find(a => a.name === (sel && sel.name));
  const months = state.data.months.slice(0, up + 1), mtr = months.map((m, i) => `<tr><td>${m}</td><td>${adv.interviews[i]}件</td><td>${f1(adv.hours[i])}時間</td><td>${adv.hires[i]}件</td><td>${f1(adv.sales[i])}</td><td>${adv.hires[i] ? f1(adv.sales[i] / adv.hires[i]) : "—"}</td></tr>`).join("");
  const detail = adv ? `<section class="card panel"><h2 class="ttl">${esc(adv.name)} さんの月ごとの推移</h2><div class="tablewrap"><table class="tbl"><thead><tr>${["月", "面談数", "面談の時間", "成約", "売上（万円）", "単価（万円）"].map(th).join("")}</tr></thead><tbody>${mtr}</tbody></table></div></section>` : "";
  return `<section class="kpis k5" aria-label="アドバイザーの数字">${kpis}</section>
    <section class="card panel"><h2 class="ttl">アドバイザーごとの面談・時間・単価・成約・売上</h2><div class="tablewrap"><table class="tbl money"><thead>${head}</thead><tbody>${trs}<tr class="total"><td>全体</td><td>${T.interviews}件</td><td>${f1(T.hours)}時間</td><td>${T.recommended}</td><td>${T.offers}</td><td>${T.hires}件</td><td>${f1(T.sales)}</td><td>${f1(T.unitPrice)}</td><td>${fmtPct(T.hireRate)}</td><td>${f1(T.salesPerHour)}</td></tr></tbody></table></div>
    <p class="note">単価＝売上 ÷ 成約数（1成約あたりの売上）。成約率＝成約数 ÷ 面談数。面談1時間あたり売上＝売上 ÷ 面談の時間。チップは全体の平均との差です。名前を押すと、月ごとの推移を下に出します。</p></section>
    <section class="card panel"><h2 class="ttl">面談から成約までの流れ（アドバイザー別）</h2>${funnel}</section>${detail}`;
}

/* ---------- 操作・CSV ---------- */
export function ppSort(spec) { const [g, k] = spec.split(":"), s = g === "R" ? "sortR" : "sortA"; state.pp[s] = state.pp[s].key === k ? { key: k, dir: -state.pp[s].dir } : { key: k, dir: -1 }; }
export function ppPick(spec) { const i = spec.indexOf(":"), g = spec.slice(0, i), name = spec.slice(i + 1); if (g === "reform") state.pp.selR = name; else state.pp.selA = name; }
export function peopleCsv() {
  const rows = [], all = getCases();
  if (state.pp.tab === "reform") { rows.push(["担当者", "現場数", "出来高売上(円)", "コスト(円)", "利益(円)", "利益率(%)", "受注率(%)", "見積り中の件数", "見積り中の金額(円)"]); const r = C.siteMoneyRows(all, state.data.siteFinance || {}); C.reformPeople(r, all).forEach(p => rows.push([p.name, p.sites, Math.round(p.earned), Math.round(p.cost), Math.round(p.profit), p.margin?.toFixed(1) ?? "", p.winRate?.toFixed(1) ?? "", p.quoting, p.pipeline])); }
  else { rows.push(["アドバイザー", "面談数", "面談の時間", "推薦", "内定", "成約", "売上(万円)", "単価(万円)", "成約率(%)", "面談1時間あたり売上(万円)"]); C.teamStats(state.data.advisors, L()).list.forEach(a => rows.push([a.name, a.interviews, a.hours, a.recommended, a.offers, a.hires, a.sales, a.unitPrice?.toFixed(1) ?? "", a.hireRate?.toFixed(1) ?? "", a.salesPerHour?.toFixed(1) ?? ""])); }
  return { name: state.pp.tab === "reform" ? "担当者別_リフォーム.csv" : "担当者別_アドバイザー.csv", text: "﻿" + rows.map(r => r.map(v => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(",")).join("\r\n") };
}
