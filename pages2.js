/* 案件管理・現場進捗状況（工程表つき）・見積もり作成。金額は円。数字はすべて合成サンプル。 */
import * as C from "./calc.js";
import { state, store, getCases, saveEdits, getMeetings } from "./state.js";
import { esc, ICON, svgI, kpi, bar, fmtMan } from "./ui.js";

export const yen = v => (Number.isFinite(v) ? Math.round(v).toLocaleString("ja-JP") : "—");
export const pct = v => (Number.isFinite(v) ? v.toFixed(1) + "%" : "—");
export const th = t => `<th scope="col">${esc(t)}</th>`;
const MONTH_ORDER = ["12月", "1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月"];   // 月の並び（12月始まり）
const STATUS_CLASS = { "見積り中": "amber", "受注": "sky", "進行中": "violet", "請求済": "teal", "入金済": "green", "失注": "gray", "": "none" };
export const pill = st => `<span class="pill ${STATUS_CLASS[st] || "none"}">${esc(st || "未設定")}</span>`;
const $ = s => document.querySelector(s);

/* =================== 案件管理 =================== */
function filtered(all) {
  const f = state.cf, q = f.q.trim().toLowerCase();
  return all.filter(c => (f.status === "all" || (f.status === "__none" ? !c.status : c.status === f.status))
    && (f.person === "all" || c.person === f.person) && (f.contractor === "all" || c.contractor === f.contractor)
    && (f.month === "all" || c.month === f.month)
    && (!q || (c.name + c.note + c.id + c.contractor + c.person).toLowerCase().includes(q)));
}
const uniq = (all, k) => [...new Set(all.map(c => c[k]).filter(Boolean))];
export const opt = (v, cur, label) => `<option value="${esc(v)}"${String(cur) === String(v) ? " selected" : ""}>${esc(label ?? v)}</option>`;

export function renderCases(route, post) {
  void post;
  const all = getCases(), sm = C.statusSummary(all), pipe = C.pipeline(all), miss = C.grossMissing(all);
  const orderedCount = sm["受注"].count + sm["進行中"].count + sm["請求済"].count + sm["入金済"].count;
  const orderedAmt = pipe.ordered + pipe.invoiced + pipe.paid;
  const kpis = [
    kpi({ tone: "sky", icon: "cases", label: "案件の件数", value: String(all.length), unit: "件", sub: `見積り中 ${sm["見積り中"].count}・受注／進行中 ${sm["受注"].count + sm["進行中"].count}・請求済／入金済 ${sm["請求済"].count + sm["入金済"].count}・失注 ${sm["失注"].count}` }),
    kpi({ tone: "teal", icon: "coin", label: "受注額の合計（円）", value: yen(orderedAmt), unit: "円", sub: `${orderedCount}件（受注・進行中・請求済・入金済）／うち入金済 ${yen(pipe.paid)}円` }),
    kpi({ tone: "amber", icon: "estimate", label: "見積り中の見込み額（円）", value: yen(pipe.estimating), unit: "円", sub: `${sm["見積り中"].count}件。受注の前の金額です` }),
    kpi({ tone: "gold", icon: "target", label: "粗利が未入力の案件", value: String(miss), unit: "件", sub: miss ? "受注済みなのに粗利が空です。入れると粗利率が出ます" : "受注済みの案件は、すべて粗利が入っています" }),
  ].join("");
  // 状況ごとの金額の並び
  const order = ["見積り中", "受注", "進行中", "請求済", "入金済", "失注"], tot = order.reduce((a, k) => a + sm[k].amount, 0) || 1;
  const stackBar = `<div class="stackbar" role="img" aria-label="状況ごとの金額の割合">${order.map(k => `<i class="st-${STATUS_CLASS[k]}" style="width:${sm[k].amount / tot * 100}%" title="${k} ${yen(sm[k].amount)}円"></i>`).join("")}</div>
    <div class="stack-legend">${order.map(k => `<span>${pill(k)} ${sm[k].count}件・${yen(sm[k].amount)}円（${pct(sm[k].amount / tot * 100)}）</span>`).join("")}</div>`;
  // 一覧
  const list = filtered(all);
  const rows = list.map(c => {
    const rate = C.caseGrossRate(c), hasSite = c.tasks.length > 0;
    return `<tr><td>${esc(c.id)}</td><td><b>${esc(c.name)}</b> <button type="button" class="linkbtn" data-case-open="${esc(c.id)}">詳細</button></td><td>${esc(c.person)}</td><td>${esc(c.contractor)}</td><td>${yen(c.amount)}</td><td>${esc(c.month)}</td>
      <td><input class="cell-in" type="number" min="0" step="1000" inputmode="numeric" aria-label="${esc(c.name)}の粗利（円）" data-case-gross="${esc(c.id)}" value="${Number.isFinite(c.gross) ? c.gross : ""}" placeholder="未入力"></td>
      <td>${pct(rate)}</td><td><select class="cell-sel" aria-label="${esc(c.name)}の状況" data-case-status="${esc(c.id)}">${["", ...state.data.statuses].map(s => opt(s, c.status, s || "（未設定）")).join("")}</select></td>
      <td class="note-cell">${esc(c.note)}</td><td>${hasSite ? `<a class="mini-link" href="#/sites" data-site-open="${esc(c.id)}">工程表 →</a>` : ""}</td></tr>`;
  }).join("") || `<tr><td colspan="11" class="empty">条件に合う案件がありません。</td></tr>`;
  const sel = (id, label, key, values, cur) => `<div class="ctl"><label for="${id}">${label}</label><select class="sel" id="${id}" data-filter="${key}"><option value="all">すべて</option>${values.map(v => opt(v, cur)).join("")}</select></div>`;
  const filters = `<div class="filter-bar">${sel("fStatus", "状況", "status", [...state.data.statuses, "__none"].map(v => v), state.cf.status).replace('<option value="__none">__none</option>', '<option value="__none"' + (state.cf.status === "__none" ? " selected" : "") + '>（未設定）</option>')}
    ${sel("fPerson", "担当者", "person", uniq(all, "person"), state.cf.person)}${sel("fContractor", "元請け", "contractor", uniq(all, "contractor"), state.cf.contractor)}${sel("fMonth", "売上月", "month", MONTH_ORDER.filter(m => all.some(c => c.month === m)), state.cf.month)}
    <div class="ctl"><label for="fQ">さがす（物件名・備考）</label><input class="sel" id="fQ" data-filter="q" type="search" value="${esc(state.cf.q)}" placeholder="例：サンプル邸"></div>
    <button type="button" class="btn" id="fClear" style="align-self:flex-end">条件を戻す</button></div>`;
  const listCard = `<section class="card panel"><h2 class="ttl">案件の一覧（${list.length}／${all.length}件）</h2>${filters}
    <div class="tablewrap"><table class="tbl cases"><thead><tr>${["番号", "物件名", "担当者", "元請け", "受注額（円）", "売上月", "粗利（円）", "粗利率", "状況", "備考", "現場"].map(th).join("")}</tr></thead><tbody>${rows}</tbody></table></div>
    <p class="note">状況と粗利は、この表の中で直接変えられます（このブラウザにだけ保存されます）。粗利率は「粗利 ÷ 受注額」です。</p></section>`;
  // 追加フォーム
  const people = uniq(all, "person"), contractors = uniq(all, "contractor");
  const form = `<section class="card panel"><details id="caseDetails"><summary class="ttl" style="cursor:pointer">案件を追加する</summary>
    <form id="caseForm" novalidate style="margin-top:12px"><div class="form-grid">
      <div class="field"><label for="n_name">物件名（必須）</label><input id="n_name" name="name" type="text" maxlength="60"></div>
      <div class="field"><label for="n_person">担当者</label><input id="n_person" name="person" list="dl_person" type="text" maxlength="30"><datalist id="dl_person">${people.map(p => `<option value="${esc(p)}">`).join("")}</datalist></div>
      <div class="field"><label for="n_contractor">元請け</label><input id="n_contractor" name="contractor" list="dl_con" type="text" maxlength="30"><datalist id="dl_con">${contractors.map(p => `<option value="${esc(p)}">`).join("")}</datalist></div>
      <div class="field"><label for="n_amount">受注額（円）</label><input id="n_amount" name="amount" type="number" min="0" step="1" inputmode="numeric"></div>
      <div class="field"><label for="n_month">売上月</label><select id="n_month" name="month" class="sel">${MONTH_ORDER.map(m => opt(m, "12月")).join("")}</select></div>
      <div class="field"><label for="n_status">状況</label><select id="n_status" name="status" class="sel">${state.data.statuses.map(s => opt(s, "見積り中")).join("")}</select></div>
      <div class="field" style="grid-column:span 2"><label for="n_note">備考</label><input id="n_note" name="note" type="text" maxlength="120"></div></div>
      <div class="tools" style="margin-top:12px"><button class="btn" type="submit">この案件を追加</button></div><p class="msg" id="caseMsg" role="status"></p></form></details></section>`;
  // 月ごとの集計
  const mrows = C.monthlyCases(all, MONTH_ORDER).filter(r => r.count || all.some(c => c.month === r.month));
  const mtr = mrows.map(r => `<tr><td>${r.month}</td><td>${r.count}</td><td>${yen(r.amount)}</td><td>${yen(r.gross)}</td><td>${pct(r.grossRate)}</td><td>${yen(r.invoicedOnly)}</td><td>${yen(r.invoicedPaid)}</td></tr>`).join("");
  const mt = mrows.reduce((a, r) => ({ n: a.n + r.count, amt: a.amt + r.amount, g: a.g + r.gross, i: a.i + r.invoicedOnly, p: a.p + r.invoicedPaid }), { n: 0, amt: 0, g: 0, i: 0, p: 0 });
  const monthly = `<section class="card panel"><h2 class="ttl">月ごとの集計（受注・進行中・請求済・入金済）</h2><div class="tablewrap"><table class="tbl"><thead><tr>${["売上月", "件数", "受注額の合計（円）", "粗利の合計（円）", "粗利率", "請求済だけ（円）", "請求済＋入金済（円）"].map(th).join("")}</tr></thead><tbody>${mtr}
    <tr class="total"><td>合計</td><td>${mt.n}</td><td>${yen(mt.amt)}</td><td>${yen(mt.g)}</td><td>${pct(C.ratio(mt.g, mt.amt))}</td><td>${yen(mt.i)}</td><td>${yen(mt.p)}</td></tr></tbody></table></div>
    <p class="note">月の表に入るのは「受注・進行中・請求済・入金済」だけです（見積り中・失注・未設定は入りません）。月の並びは12月始まりです。</p></section>`;
  return `<section class="kpis k5" aria-label="案件の主な数字">${kpis}</section>
    <section class="card panel"><h2 class="ttl">状況ごとの金額（円）</h2>${stackBar}</section>${listCard}${form}${monthly}`;
}

/* ---- 案件の操作 ---- */
export function caseSetStatus(id, v) { state.edits.status[id] = v; saveEdits(); }
export function caseSetGross(id, raw) {
  const t = String(raw).trim();
  if (t === "") state.edits.gross[id] = null;
  else { const n = Number(t); if (!Number.isFinite(n) || n < 0) return "粗利は、0以上の数で入れてください。"; state.edits.gross[id] = n; }
  saveEdits(); return null;
}
export function caseAdd(fd) {
  const name = String(fd.name || "").trim(), amount = Number(fd.amount);
  if (!name) return { error: "物件名を入れてください。", field: "name" };
  if (fd.amount === "" || !Number.isFinite(amount) || amount < 0) return { error: "受注額は、0以上の数で入れてください。", field: "amount" };
  const ids = [...state.data.cases, ...state.edits.added].map(c => c.id), n = state.edits.added.length + 1;
  let id = "N" + String(n).padStart(3, "0"); while (ids.includes(id)) id = "N" + String(Number(id.slice(1)) + 1).padStart(3, "0");
  state.edits.added.push({ id, name, person: String(fd.person || "").trim() || "（未設定）", contractor: String(fd.contractor || "").trim() || "自社", amount, month: fd.month, gross: null, status: fd.status || "見積り中", note: String(fd.note || "").trim(), stage: 0, tasks: [] });
  saveEdits(); return { ok: true, id };
}

/* =================== 現場進捗状況（工程表つき） =================== */
const STAGE_NAMES = () => state.data.workflow.stages.map(s => s.name);
export function stageTracker(c) {
  const names = STAGE_NAMES();
  return `<ol class="stages" aria-label="大きな工程">${names.map((n, i) => `<li class="${i < c.stage ? "done" : i === c.stage ? "now" : ""}" ${i === c.stage ? 'aria-current="step"' : ""}><span class="no">${i + 1}</span><span class="nm">${esc(n)}</span></li>`).join("")}</ol>`;
}
export function ganttHtml(rows, a, b, asOf, opts = {}) {
  const span = Math.max(1, C.dayDiff(a, b)), left = d => Math.max(0, Math.min(100, C.dayDiff(a, d) / span * 100));
  const ticks = []; for (let d = a; C.dayDiff(d, b) >= 0; d = C.addDays(d, 7)) ticks.push(d);
  const md = d => { const [, m, dd] = d.split("-").map(Number); return `${m}/${dd}`; };
  const head = `<div class="g-row g-head"><div class="g-label">${opts.labelHead || "工程"}</div><div class="g-line">${ticks.map(t => `<span class="g-tick" style="left:${left(t)}%">${md(t)}</span>`).join("")}</div></div>`;
  const today = C.dayDiff(a, asOf) >= 0 && C.dayDiff(asOf, b) >= 0 ? `<i class="g-today" style="left:${left(asOf)}%" title="今日（${asOf}）"></i>` : "";
  const body = rows.map(r => {
    const x = left(r.start), w = Math.max(1.2, left(C.addDays(r.end, 1)) - x), cls = { "完了": "ok", "進行中": "go", "遅れ気味": "warn", "遅れ": "late", "未着手": "wait" }[r.state] || "wait";
    return `<div class="g-row"><div class="g-label">${r.labelHtml}</div><div class="g-line">${ticks.map(t => `<i class="g-grid" style="left:${left(t)}%"></i>`).join("")}${today}
      <div class="g-bar ${cls}" style="left:${x}%;width:${w}%" title="${esc(r.title || "")}"><i style="width:${Math.max(0, Math.min(100, r.done))}%"></i><span>${Math.round(r.done)}%</span></div>${(r.marks || []).map(m => `<span class="g-mark ${m.cls}" style="left:${left(m.date)}%" title="${esc(m.title || "")}">${m.text}</span>`).join("")}</div></div>`;
  }).join("");
  return `<div class="gantt" role="img" aria-label="${esc(opts.aria || "工程表")}"><div class="g-inner">${head}${body}</div></div>`;
}
export const stLabel = s => `<span class="tag ${{ "完了": "up", "進行中": "flat", "遅れ気味": "down", "遅れ": "down", "未着手": "flat" }[s] || "flat"}">${s}</span>`;

export function siteStage(id, delta) {
  const c = getCases().find(x => x.id === id); if (!c) return;
  const max = state.data.workflow.stages.length - 1;
  state.edits.stage[id] = Math.max(0, Math.min(max, c.stage + delta)); saveEdits();
}
export function taskSetPct(key, raw) {
  const n = Number(raw); if (!Number.isFinite(n) || n < 0 || n > 100) return "進み具合は、0〜100の数で入れてください。";
  state.taskEdits[key] = n; saveEdits(); return null;
}

/* =================== 見積もり作成 =================== */
export function defaultEstimate() {
  const asOf = state.data.asOf;
  return { customer: "サンプル 様", property: "サンプル邸N", title: "リフォーム工事", date: asOf, valid: C.addDays(asOf, 30), person: "", overheadPct: 5, discount: 0, taxRate: 10, note: "",
    lines: [{ name: "解体・撤去工事", qty: 1, unit: "式", price: 150000, cost: 100000 }, { name: "クロス張替", qty: 45, unit: "㎡", price: 1200, cost: 800 }, { name: "養生・清掃", qty: 1, unit: "式", price: 40000, cost: 25000 }] };
}
export const est = () => (state.est ||= defaultEstimate());
export const estSave = () => store.set("estimate", state.est);

function estLines(e) {
  return e.lines.map((l, i) => `<tr><td>${i + 1}</td>
    <td><input class="cell-in wide" list="dl_est" data-est="lines.${i}.name" value="${esc(l.name)}" aria-label="品名 ${i + 1}" maxlength="60"></td>
    <td><input class="cell-in" type="number" min="0" step="any" inputmode="decimal" data-est="lines.${i}.qty" value="${esc(l.qty)}" aria-label="数量 ${i + 1}"></td>
    <td><input class="cell-in short" data-est="lines.${i}.unit" value="${esc(l.unit)}" aria-label="単位 ${i + 1}" maxlength="6"></td>
    <td><input class="cell-in" type="number" min="0" step="any" inputmode="decimal" data-est="lines.${i}.price" value="${esc(l.price)}" aria-label="単価 ${i + 1}"></td>
    <td class="num line-amt" data-line="${i}">${yen(C.lineAmount(l))}</td>
    <td class="internal"><input class="cell-in" type="number" min="0" step="any" inputmode="decimal" data-est="lines.${i}.cost" value="${esc(l.cost ?? "")}" aria-label="原価の単価 ${i + 1}（社内用）" placeholder="任意"></td>
    <td><button type="button" class="btn small" data-est-del="${i}" aria-label="${i + 1}行目を消す">消す</button></td></tr>`).join("");
}
export function estSummaryHtml(e) {
  const t = C.estimateTotals(e);
  return `<dl class="sum"><div><dt>小計</dt><dd>${yen(t.subtotal)}円</dd></div><div><dt>諸経費（${Number(e.overheadPct) || 0}%）</dt><dd>${yen(t.overhead)}円</dd></div><div><dt>値引き</dt><dd>−${yen(t.discount)}円</dd></div>
    <div><dt>税抜の合計</dt><dd>${yen(t.taxable)}円</dd></div><div><dt>消費税（${Number(e.taxRate) || 0}%）</dt><dd>${yen(t.tax)}円</dd></div><div class="grand"><dt>合計（税込）</dt><dd>${yen(t.total)}円</dd></div>
    <div class="internal"><dt>原価の合計（社内用）</dt><dd>${t.gross == null ? "—" : yen(t.cost) + "円"}</dd></div><div class="internal"><dt>粗利（税抜・社内用）</dt><dd>${t.gross == null ? "原価を入れると出ます" : `${yen(t.gross)}円（${pct(t.grossRate)}）`}</dd></div></dl>`;
}
export function estPreviewHtml(e) {
  const t = C.estimateTotals(e), rows = e.lines.filter(l => C.lineAmount(l) > 0 || l.name).map((l, i) => `<tr><td>${i + 1}</td><td>${esc(l.name)}</td><td class="num">${esc(l.qty)} ${esc(l.unit)}</td><td class="num">${yen(Number(l.price))}</td><td class="num">${yen(C.lineAmount(l))}</td></tr>`).join("");
  return `<div class="paper"><h2>御 見 積 書</h2><p class="to">${esc(e.customer || "（宛名）")}</p><p class="meta">件名：${esc(e.title)}（${esc(e.property)}）<br>見積日：${esc(e.date)}　有効期限：${esc(e.valid)}</p>
    <div class="total-box"><span>御見積金額（税込）</span><b>${yen(t.total)} 円</b></div>
    <table class="tbl paper-t"><thead><tr><th>#</th><th>品名</th><th>数量</th><th>単価（円）</th><th>金額（円）</th></tr></thead><tbody>${rows}
      <tr class="sub"><td colspan="4">小計</td><td class="num">${yen(t.subtotal)}</td></tr><tr class="sub"><td colspan="4">諸経費（${Number(e.overheadPct) || 0}%）</td><td class="num">${yen(t.overhead)}</td></tr>
      ${t.discount ? `<tr class="sub"><td colspan="4">値引き</td><td class="num">−${yen(t.discount)}</td></tr>` : ""}<tr class="sub"><td colspan="4">消費税（${Number(e.taxRate) || 0}%）</td><td class="num">${yen(t.tax)}</td></tr>
      <tr class="sub grand"><td colspan="4">合計（税込）</td><td class="num">${yen(t.total)}</td></tr></tbody></table>
    ${e.note ? `<p class="remark">備考：${esc(e.note)}</p>` : ""}<p class="issuer">発行：（御社名）　担当：${esc(e.person || "")}</p></div>`;
}
export function renderEstimate(route, post) {
  void post;
  const e = est(), tpl = state.data.estimateTemplates, all = getCases();
  const f = (label, key, type = "text", extra = "") => `<div class="field"><label for="e_${key}">${label}</label><input id="e_${key}" data-est="${key}" type="${type}" value="${esc(e[key])}" ${extra}></div>`;
  const form = `<section class="card panel"><h2 class="ttl">見積の内容</h2><div class="form-grid">${f("宛名（お客様）", "customer", "text", 'maxlength="40"')}${f("物件名", "property", "text", 'maxlength="40"')}${f("件名", "title", "text", 'maxlength="40"')}${f("担当者", "person", "text", 'maxlength="20"')}
      ${f("見積日", "date", "date")}${f("有効期限", "valid", "date")}${f("諸経費（％）", "overheadPct", "number", 'min="0" max="100" step="0.5"')}${f("消費税（％）", "taxRate", "number", 'min="0" max="30" step="1"')}${f("値引き（円）", "discount", "number", 'min="0" step="1000"')}
      <div class="field" style="grid-column:span 2"><label for="e_note">備考</label><input id="e_note" data-est="note" type="text" value="${esc(e.note)}" maxlength="100"></div></div>
    <datalist id="dl_est">${tpl.map(x => `<option value="${esc(x.name)}">`).join("")}</datalist>
    <h3 style="margin:16px 0 8px">明細</h3><div class="tablewrap"><table class="tbl est-t"><thead><tr><th>#</th><th>品名</th><th>数量</th><th>単位</th><th>単価（円）</th><th>金額（円）</th><th class="internal">原価の単価（社内用）</th><th></th></tr></thead><tbody id="estLines">${estLines(e)}</tbody></table></div>
    <div class="tools" style="margin-top:10px"><button class="btn" type="button" id="estAdd">行を足す</button>
      <div class="ctl" style="flex-direction:row;gap:8px;align-items:center"><label for="estTpl" style="margin:0">よく使う項目から足す</label><select class="sel" id="estTpl" style="min-width:200px"><option value="">選んでください</option>${tpl.map((x, i) => `<option value="${i}">${esc(x.name)}（${yen(x.price)}円／${esc(x.unit)}）</option>`).join("")}</select></div></div>
    <p class="note">金額は「数量 × 単価」の円未満切り捨て、諸経費・消費税も円未満切り捨てです（端数の決まりは仮。確認したい点です）。原価の単価を入れると、粗利が出ます（社内用で、印刷には出ません）。</p>
    <div id="estSummary">${estSummaryHtml(e)}</div>
    <div class="tools" style="margin-top:12px"><button class="btn" type="button" id="estRegister">この見積を案件に登録（見積り中）</button><button class="btn" type="button" id="estPrint">印刷</button><button class="btn" type="button" id="estCsv">CSV出力</button><button class="btn" type="button" id="estReset">最初の内容に戻す</button></div>
    <p class="msg" id="estMsg" role="status"></p><p class="note">案件に登録すると、案件管理の一覧に「見積り中」で入ります（受注額は税抜の合計）。入力内容は、このブラウザにだけ保存されます。${all.length ? "" : ""}</p></section>`;
  return `<section class="grid2 est-grid">${form}<section class="card panel preview-card"><h2 class="ttl no-print">見積書のプレビュー</h2><div id="estPreview">${estPreviewHtml(e)}</div></section></section>`;
}
export function estSet(path, value) {
  const e = est(), p = path.split(".");
  if (p[0] === "lines") { const l = e.lines[+p[1]]; if (!l) return; l[p[2]] = value; }
  else e[path] = value;
  estSave();
}
export function estAddLine(item) {
  const e = est();
  e.lines.push(item ? { name: item.name, qty: 1, unit: item.unit, price: item.price, cost: "" } : { name: "", qty: 1, unit: "式", price: 0, cost: "" });
  estSave();
}
export function estDelLine(i) { const e = est(); e.lines.splice(i, 1); if (!e.lines.length) e.lines.push({ name: "", qty: 1, unit: "式", price: 0, cost: "" }); estSave(); }
export function estReset() { state.est = defaultEstimate(); estSave(); }
export function estRegister() {
  const e = est(), t = C.estimateTotals(e);
  if (!String(e.property).trim()) return { error: "物件名を入れてください。" };
  if (t.taxable <= 0) return { error: "金額が 0 円です。明細を入れてください。" };
  const r = caseAdd({ name: e.property, person: e.person, contractor: "自社", amount: t.taxable, month: C.monthLabelOf(e.date) || "12月", status: "見積り中", note: `見積 ${e.date}（${e.title}）` });
  if (r.ok && t.gross != null) { state.edits.gross[r.id] = t.gross; saveEdits(); }
  return r;
}
export function estCsv() {
  const e = est(), t = C.estimateTotals(e), rows = [["御見積書"], ["宛名", e.customer], ["物件名", e.property], ["件名", e.title], ["見積日", e.date], ["有効期限", e.valid], [], ["#", "品名", "数量", "単位", "単価(円)", "金額(円)"]];
  e.lines.forEach((l, i) => rows.push([i + 1, l.name, l.qty, l.unit, l.price, C.lineAmount(l)]));
  rows.push([], ["小計", "", "", "", "", t.subtotal], [`諸経費(${e.overheadPct}%)`, "", "", "", "", t.overhead], ["値引き", "", "", "", "", -t.discount], ["税抜の合計", "", "", "", "", t.taxable], [`消費税(${e.taxRate}%)`, "", "", "", "", t.tax], ["合計(税込)", "", "", "", "", t.total]);
  return { name: "見積書.csv", text: toCsv(rows) };
}
export function casesCsv() {
  const rows = [["番号", "物件名", "担当者", "元請け", "受注額(円)", "売上月", "粗利(円)", "粗利率(%)", "状況", "備考"]];
  filtered(getCases()).forEach(c => rows.push([c.id, c.name, c.person, c.contractor, c.amount, c.month, c.gross ?? "", C.caseGrossRate(c)?.toFixed(1) ?? "", c.status, c.note]));
  return { name: "案件一覧.csv", text: toCsv(rows) };
}
export function sitesCsv() {
  const rows = [["現場", "工程", "開始", "終了", "進み具合(%)", "状態"]], asOf = state.data.asOf;
  getCases().filter(c => c.tasks.length).forEach(c => c.tasks.forEach(t => rows.push([c.name, t.name, t.start, t.end, Math.round(t.done), C.taskState(t, asOf)])));
  return { name: "工程表.csv", text: toCsv(rows) };
}
const toCsv = rows => "﻿" + rows.map(r => r.map(v => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(",")).join("\r\n");
