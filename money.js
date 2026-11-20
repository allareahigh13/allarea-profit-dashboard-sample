/* 現場ごとの収支（売上分析の、月次売上のグラフと「月ごとの売上」の表のあいだに出す）。金額は万円で表示。 */
import * as C from "./calc.js";
import { state, getCases } from "./state.js";
import { esc, bar, fmtMan, fmtPct } from "./ui.js";

const man = v => fmtMan((Number.isFinite(v) ? v : NaN) / 10000);
const th = t => `<th scope="col">${esc(t)}</th>`;
const MONTH_ORDER = ["12月", "1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月"];
const md = d => { const [, m, dd] = d.split("-").map(Number); return `${m}/${dd}`; };
const cls = v => (v == null ? "" : v >= 0 ? "up" : "down");

/** 収益率の、プラスとマイナスが左右に伸びる棒（中心が0）。±40%で端。 */
function dvBar(m) {
  if (m == null) return "";
  const w = Math.min(Math.abs(m) / 40 * 50, 50);
  return `<span class="dv" role="img" aria-label="収益率 ${fmtPct(m)}"><i class="${m >= 0 ? "pos" : "neg"}" style="${m >= 0 ? "left:50%" : `right:50%`};width:${w}%"></i><b></b></span>`;
}
function costBar(r) {
  const k = r.costs, t = r.cost || 1, seg = (v, c, n) => v > 0 ? `<i class="${c}" style="width:${v / t * 100}%" title="${n} ${man(v)}万円（${(v / t * 100).toFixed(0)}%）"></i>` : "";
  return `<span class="costbar" role="img" aria-label="コストの内訳 資材費 ${man(k.materials)} 人件費 ${man(k.labor)} 外注費 ${man(k.subcontract)} その他 ${man(k.other)}（万円）">${seg(k.materials, "mat", "資材費")}${seg(k.labor, "lab", "人件費")}${seg(k.subcontract, "sub", "外注費")}${seg(k.other, "oth", "その他")}</span>`;
}

export function siteMoneyHtml() {
  const all = getCases(), rowsAll = C.siteMoneyRows(all, state.data.siteFinance || {});
  if (!rowsAll.length) return "";
  const months = MONTH_ORDER.filter(m => rowsAll.some(r => r.month === m)), fm = state.fm;
  if (fm.month !== "all" && !months.includes(fm.month)) fm.month = "all";
  const rows = rowsAll.filter(r => fm.month === "all" || r.month === fm.month), tot = C.moneyTotals(rows);
  const { key, dir } = fm.sort, sorted = [...rows].sort((a, b) => ((a[key] ?? -1e18) - (b[key] ?? -1e18)) * dir);
  const sb = (k, label) => `<th scope="col" aria-sort="${key === k ? (dir < 0 ? "descending" : "ascending") : "none"}"><button type="button" class="sort" data-fm-sort="${k}" aria-pressed="${key === k}" title="${label}で並べ替え">${label}${key === k ? (dir < 0 ? " ↓" : " ↑") : ""}</button></th>`;
  const trs = sorted.map(r => `<tr><td class="txt"><b>${esc(r.name)}</b><br><small>${esc(r.person)}・${esc(r.status)}</small></td>
    <td class="txt">${esc(r.origin)}<br><span class="tag ${r.kind === "個人発注" ? "flat" : "up"}">${esc(r.kind)}</span></td>
    <td>${md(r.start)}〜${md(r.end)}<br><small>${r.days}日</small></td><td>${man(r.planned)}</td>
    <td>${man(r.earned)}<br><small>進み ${r.progress}%</small></td><td>${man(r.cost)}<br>${costBar(r)}</td>
    <td class="${cls(r.profit)}"><b>${fmtMan(r.profit / 10000, { sign: true })}</b></td>
    <td class="dvcell">${dvBar(r.margin)}<span class="${cls(r.margin)}">${fmtPct(r.margin, { sign: true })}</span></td>
    <td class="${cls(r.marginDiff)}">${fmtMan(r.marginDiff, { sign: true })}pt<br><small>予定 ${fmtPct(r.plannedMargin)}</small></td>
    <td>${r.progress < 100 ? `<span class="${cls(r.forecastMargin)}">${fmtPct(r.forecastMargin, { sign: true })}</span><br><small>${man(r.forecastProfit)}万円</small>` : "—"}</td></tr>`).join("");
  const head = `<tr>${th("現場")}${th("発注元（大元）")}${th("期間")}${sb("planned", "予定売上")}${sb("earned", "出来高売上")}${sb("cost", "コスト")}${sb("profit", "収益")}${sb("margin", "収益率")}${sb("marginDiff", "予定との差")}${th("最終の見込み")}</tr>`;
  const mTrs = months.map(m => { const t = C.moneyTotals(rowsAll.filter(r => r.month === m)); return `<tr class="${fm.month === m ? "sel" : ""}"><td>${m}</td><td>${t.count}件</td><td>${man(t.earned)}</td><td>${man(t.cost)}</td><td class="${cls(t.profit)}">${fmtMan(t.profit / 10000, { sign: true })}</td><td>${fmtPct(t.margin)}</td><td>${t.plus}／${t.minus}</td></tr>`; }).join("");
  const gOrigin = C.groupMoney(rows, r => r.origin).map(g => { const sample = rows.find(r => r.origin === g.key); return { ...g, kind: sample.kind }; });
  const oTrs = gOrigin.map(g => `<tr><td class="txt"><b>${esc(g.key)}</b></td><td><span class="tag ${g.kind === "個人発注" ? "flat" : "up"}">${esc(g.kind)}</span></td><td>${g.count}件</td><td>${man(g.earned)}</td><td>${man(g.cost)}</td><td class="${cls(g.profit)}"><b>${fmtMan(g.profit / 10000, { sign: true })}</b></td><td class="dvcell">${dvBar(g.margin)}<span class="${cls(g.margin)}">${fmtPct(g.margin, { sign: true })}</span></td></tr>`).join("");
  const kinds = C.groupMoney(rows, r => r.kind), kmax = Math.max(1, ...kinds.map(k => Math.abs(k.margin ?? 0)));
  const kCards = kinds.map(k => `<div class="kind-card"><div class="r2"><b>${esc(k.key)}</b><span>${k.count}件</span></div><div class="big ${cls(k.margin)}">${fmtPct(k.margin, { sign: true })}</div>${bar(Math.abs(k.margin ?? 0) / kmax * 100, k.key === "個人発注" ? "violet" : "teal")}<div class="r2"><span>収益 ${fmtMan(k.profit / 10000, { sign: true })}万円</span><span>出来高売上 ${man(k.earned)}万円</span></div></div>`).join("");
  const stat = (lab, val, sub, c = "") => `<div class="now-box ${c}"><small>${lab}</small><b>${val}</b><span>${sub}</span></div>`;
  return `<section class="card panel" id="siteMoney" aria-labelledby="smTitle"><div class="ctl-row"><h2 class="ttl" id="smTitle">現場ごとの収支（リフォーム事業）</h2>
    <div class="ctl"><label for="fmMonth">売上月</label><select class="sel" id="fmMonth"><option value="all">全期間</option>${months.map(m => `<option value="${m}"${fm.month === m ? " selected" : ""}>${m}</option>`).join("")}</select></div></div>
    <div class="now-grid six">${stat("やっている現場", `${tot.count}件`, `平均の工期 ${tot.days}日`)}${stat("予定売上", `${man(tot.planned)}万円`, `予定のコスト ${man(tot.plannedCost)}万円`)}${stat("出来高の売上", `${man(tot.earned)}万円`, "進み具合に応じた売上")}${stat("コスト", `${man(tot.cost)}万円`, "資材・人件費・外注など")}
      ${stat("収益", `${fmtMan(tot.profit / 10000, { sign: true })}万円`, `収益率 ${fmtPct(tot.margin)}`, tot.profit < 0 ? "warn" : "")}${stat("プラス／マイナスの現場", `${tot.plus}件／${tot.minus}件`, tot.minus ? "マイナスの現場があります" : "すべてプラスです", tot.minus ? "warn" : "")}</div>
    <h3 class="h3">月ごとの現場数と収支（行を選ぶ代わりに、上の「売上月」で絞れます）</h3><div class="tablewrap"><table class="tbl"><thead><tr>${["売上月", "現場数", "出来高売上（万円）", "コスト（万円）", "収益（万円）", "収益率", "プラス／マイナス"].map(th).join("")}</tr></thead><tbody>${mTrs}</tbody></table></div>
    <h3 class="h3">現場ごとの収支（${fm.month === "all" ? "全期間" : fm.month}・${rows.length}件）</h3><div class="tablewrap"><table class="tbl money"><thead>${head}</thead><tbody>${trs || `<tr><td colspan="10" class="empty">この月の現場はありません。</td></tr>`}</tbody></table></div>
    <p class="note">金額の単位は万円。売上は「契約額 × 進み具合」の出来高、コストはこれまでにかかった実績です。収益＝出来高売上 − コスト。「予定との差」は、予定の収益率との差（ポイント）です。「最終の見込み」は、いまのペースで最後までかかった場合の収益率です。コストの帯は、黄＝資材費・赤＝人件費・紫＝外注費・灰＝その他です。</p>
    <div class="grid2" style="margin-top:12px"><div><h3 class="h3">どこの大元から来た現場か（発注元別）</h3><div class="tablewrap"><table class="tbl"><thead><tr>${["発注元", "区分", "現場数", "出来高売上（万円）", "コスト（万円）", "収益（万円）", "収益率"].map(th).join("")}</tr></thead><tbody>${oTrs}</tbody></table></div></div>
      <div><h3 class="h3">個人の発注と元請け経由の比べ方</h3><div class="kind-grid">${kCards || '<div class="empty">データがありません。</div>'}</div></div></div></section>`;
}
export function setFmMonth(v) { state.fm.month = v; }
export function setFmSort(k) { state.fm.sort = state.fm.sort.key === k ? { key: k, dir: -state.fm.sort.dir } : { key: k, dir: -1 }; }
