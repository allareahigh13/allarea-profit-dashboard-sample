/* 現場進捗状況：全現場の状況・現場の詳細（工程表・日報と写真・職人の依頼・着工前チェック）・職人の確認ページ・アラート。 */
import * as C from "./calc.js";
import { state, getCases, getDispatches, getReports, getAlerts, getMemos, saveMore, saveEdits } from "./state.js";
import { esc, svgI, ICON, kpi } from "./ui.js";
import { memoFormHtml, memoCard } from "./memos.js";
import { stageTracker, ganttHtml, stLabel, pill, yen, pct, opt, th } from "./pages2.js";

const CHECK_LABELS = { neighborhood: "近隣挨拶", materials: "資材の手配", craftsmen: "職人の手配", curing: "養生の準備" };
const md = d => { const [, m, dd] = d.split("-").map(Number); return `${m}/${dd}`; };
const wk = d => "日月火水木金土"[new Date(C.parseDate(d)).getUTCDay()];
const lvTag = l => `<span class="lvl ${{ "高": "hi", "中": "mid", "低": "lo" }[l]}">${l}</span>`;
const activeSites = all => all.filter(c => c.tasks.length && ["受注", "進行中", "請求済"].includes(c.status));

/* ---------- アラートの一覧 ---------- */
export function alertListHtml(list, { limit = 99, site = true } = {}) {
  if (!list.length) return `<div class="empty">いま対応が必要なアラートはありません。</div>`;
  return list.slice(0, limit).map(a => `<div class="alert-item ${{ "高": "hi", "中": "mid", "低": "lo" }[a.level]}"><div class="al-h">${lvTag(a.level)}<b>${esc(a.title)}</b><span class="kind">${esc(a.kind)}</span></div>
    <p>${esc(a.detail)}</p><div class="al-a">→ ${esc(a.action)}</div>
    <div class="tools"><a class="btn small" href="#/sites" data-site-open="${esc(a.caseId)}">${site ? "現場を見る" : "開く"}</a><button type="button" class="btn small" data-ack="${esc(a.id)}">確認済みにする</button></div></div>`).join("")
    + (list.length > limit ? `<p class="note">ほか ${list.length - limit}件。「全現場の状況」で全部見られます。</p>` : "");
}
const counts = list => ({ hi: list.filter(a => a.level === "高").length, mid: list.filter(a => a.level === "中").length, lo: list.filter(a => a.level === "低").length });

/* ---------- ページ本体 ---------- */
export function renderSites(route, post) {
  void post;
  const asOf = state.data.asOf, all = getCases(), sites = activeSites(all), alerts = getAlerts(), reports = getReports();
  if (state.site.tab === "gantt") state.site.tab = "detail";
  if (!sites.find(c => c.id === state.site.sel)) state.site.sel = sites[0]?.id ?? null;
  const progs = sites.map(c => ({ c, p: C.siteProgress(c.tasks, asOf) }));
  const late = progs.filter(x => x.p && x.p.delta < -5).length, cnt = counts(alerts);
  const working = all.filter(c => c.status === "進行中" && c.stage === 3), posted = working.filter(c => reports.some(r => r.caseId === c.id && r.date === asOf)).length;
  const kpis = [
    kpi({ tone: "sky", icon: "site", label: "工程表のある現場", value: String(sites.length), unit: "件", sub: `施工中 ${sites.filter(c => c.status === "進行中").length}・着工待ち ${sites.filter(c => c.status === "受注").length}・請求前後 ${sites.filter(c => c.status === "請求済").length}／基準日 ${asOf}` }),
    kpi({ tone: late ? "amber" : "teal", icon: "target", label: "計画より遅れている現場", value: String(late), unit: "件", sub: late ? "実績が計画より5ポイント以上遅れています" : "遅れている現場はありません" }),
    kpi({ tone: cnt.hi ? "amber" : "gold", icon: "check", label: "対応が必要なアラート", value: String(alerts.length), unit: "件", sub: `高 ${cnt.hi}・中 ${cnt.mid}・低 ${cnt.lo}（確認済みは除く）` }),
    kpi({ tone: "teal", icon: "report", label: "今日の日報（施工中の現場）", value: `${posted}/${working.length}`, unit: "件", sub: posted === working.length ? "施工中の現場は、すべて日報が上がっています" : "日報がまだの現場があります" }),
  ].join("");
  const tabs = `<nav class="page-tabs" aria-label="表示の切り替え"><a href="#/sites" data-site-tab="list" ${state.site.tab === "list" ? 'aria-current="page"' : ""}>全現場の状況</a><a href="#/sites" data-site-tab="detail" ${state.site.tab === "detail" ? 'aria-current="page"' : ""}>現場の詳細（工程表・日報・写真）</a><a href="#/craftsman">職人の確認ページ →</a></nav>`;
  return `<section class="kpis k5" aria-label="現場の主な数字">${kpis}</section>${tabs}${state.site.tab === "list" ? overviewHtml(all, sites, progs, alerts, reports) : detailHtml(all, sites, alerts, reports)}`;
}

function overviewHtml(all, sites, progs, alerts, reports) {
  const asOf = state.data.asOf;
  const rows = progs.map(({ c, p }) => {
    const now = C.siteNow(c.tasks, asOf), last = reports.filter(r => r.caseId === c.id).sort((a, b) => b.date.localeCompare(a.date))[0];
    const chg = reports.filter(r => r.caseId === c.id && r.change && r.change.flag), pend = chg.filter(r => r.change.approval === "未承認").length;
    const mine = alerts.filter(a => a.caseId === c.id), hi = mine.filter(a => a.level === "高").length;
    const doing = now.doing.length ? now.doing.map(t => t.name).join("、") : now.next ? `着工待ち（次：${now.next.name} ${md(now.next.start)}〜）` : "すべての工程が完了";
    const dl = p.delta, flag = dl < -5 ? `<span class="tag down">${Math.abs(dl).toFixed(0)}pt 遅れ</span>` : dl > 5 ? `<span class="tag up">${dl.toFixed(0)}pt 先行</span>` : `<span class="tag flat">計画どおり</span>`;
    return `<tr><td><b>${esc(c.name)}</b> ${pill(c.status)}</td><td>${esc(c.person)}</td><td class="txt">${esc(doing)}</td><td>${now.doneCount}/${now.total}工程<br><small>${pct(p.actual)}</small></td><td>${flag}</td>
      <td class="txt">${last ? `<small>${md(last.date)} ${esc(last.author)}</small><br>${esc(last.text.slice(0, 34))}${last.text.length > 34 ? "…" : ""}` : '<span class="tag down">日報なし</span>'}</td>
      <td>${chg.length ? `<span class="tag ${pend ? "down" : "flat"}">追加・変更 ${chg.length}件${pend ? `（承認待ち${pend}）` : ""}</span>` : '<span class="tag up">工程どおり</span>'}</td>
      <td>${mine.length ? `<span class="tag ${hi ? "down" : "flat"}">${mine.length}件${hi ? `（高${hi}）` : ""}</span>` : '<span class="tag up">なし</span>'}</td><td><a class="btn small" href="#/sites" data-site-open="${esc(c.id)}">詳細</a></td></tr>`;
  }).join("");
  const table = `<section class="card panel"><h2 class="ttl">全現場の状況（いま何をしていて、どこまで進んだか）</h2><div class="tablewrap"><table class="tbl sites"><thead><tr>${["現場", "担当", "いま何をしているか", "どこまで", "計画との比較", "最新の日報", "追加・変更工事", "アラート", ""].map(th).join("")}</tr></thead><tbody>${rows || `<tr><td colspan="9" class="empty">工程表のある現場がありません。</td></tr>`}</tbody></table></div>
    <p class="note">計画との比較は「実績の進み具合 − 計画どおりの進み具合」です。行の「詳細」から、工程表・日報・写真を見られます。</p></section>`;
  const early = all.filter(c => !c.tasks.length && ["見積り中", "受注"].includes(c.status)), wf = state.data.workflow.stages;
  const etr = early.map(c => `<tr><td>${esc(c.id)}</td><td><b>${esc(c.name)}</b></td><td>${pill(c.status)}</td><td>${esc(wf[c.stage]?.name || "")}</td><td>${esc(c.person)}</td><td>${yen(c.amount)}</td><td class="txt">${esc(c.note)}</td></tr>`).join("");
  const people = [...new Set(all.map(c => c.person))].filter(Boolean), gf = state.site.gf, picked = all.find(c => c.id === state.site.pick);
  const filt = `<div class="filter-bar"><div class="ctl"><label for="gStatus">状況</label><select class="sel" id="gStatus"><option value="all">すべて</option>${[...state.data.statuses, "__none"].map(v => `<option value="${v}"${gf.status === v ? " selected" : ""}>${v === "__none" ? "（未設定）" : v}</option>`).join("")}</select></div>
    <div class="ctl"><label for="gPerson">担当者</label><select class="sel" id="gPerson"><option value="all">すべて</option>${people.map(p => opt(p, gf.person)).join("")}</select></div>
    <div class="ctl"><label for="gRange">表示する期間</label><select class="sel" id="gRange"><option value="all"${state.site.gr === "all" ? " selected" : ""}>全期間</option><option value="near"${state.site.gr === "near" ? " selected" : ""}>今日の前後（−30日〜＋45日）</option></select></div></div>`;
  const master = `<section class="card panel"><h2 class="ttl">全案件の進み具合（ガントチャート）</h2>${filt}${masterGanttHtml(all, alerts)}<p class="note">1本が1案件です。工程表のある現場は、工程ごとに色が分かれます（色の濃い部分が進み具合）。見積り中・請求済などは、状況の色の1本で出ます。案件の名前を押すと、下に詳細が出ます。</p></section>${picked ? quickPanelHtml(picked, alerts, reports) : ""}`;
  return `${master}<section class="card panel"><h2 class="ttl">アラート（抜け漏れ・遅れ）</h2>${alertListHtml(alerts, { limit: 6 })}</section>${table}
    <section class="card panel"><h2 class="ttl">着工前の案件（見積り・契約の段階）</h2><div class="tablewrap"><table class="tbl"><thead><tr>${["番号", "物件名", "状況", "いまの工程", "担当者", "金額（円）", "備考"].map(th).join("")}</tr></thead><tbody>${etr || `<tr><td colspan="7" class="empty">着工前の案件はありません。</td></tr>`}</tbody></table></div></section>`;
}


/* ---------- 全案件のガントチャート（1本が1案件。クリックで詳細） ---------- */
const GROUP_ORDER = ["進行中", "受注", "見積り中", "請求済", "入金済", "失注", ""];
const STCLS = { "見積り中": "amber", "受注": "sky", "進行中": "violet", "請求済": "teal", "入金済": "green", "失注": "gray", "": "none" };
function masterRows(all, alerts) {
  const asOf = state.data.asOf, fin = state.data.siteFinance || {}, gf = state.site.gf;
  return all.filter(c => (gf.status === "all" || (gf.status === "__none" ? !c.status : c.status === gf.status)) && (gf.person === "all" || c.person === gf.person))
    .sort((a, b) => GROUP_ORDER.indexOf(a.status) - GROUP_ORDER.indexOf(b.status) || (C.caseSpan(a, fin[a.id], asOf)?.start || "9").localeCompare(C.caseSpan(b, fin[b.id], asOf)?.start || "9"))
    .map(c => ({ c, span: C.caseSpan(c, fin[c.id], asOf), alerts: alerts.filter(a => a.caseId === c.id), prog: c.tasks.length ? C.siteProgress(c.tasks, asOf) : null }));
}
export function masterGanttHtml(all, alerts) {
  const asOf = state.data.asOf, rows = masterRows(all, alerts), dated = rows.filter(r => r.span);
  if (!rows.length) return `<div class="empty">条件に合う案件がありません。</div>`;
  let a = asOf, b = asOf;
  for (const r of dated) { if (r.span.start < a) a = r.span.start; if (r.span.end > b) b = r.span.end; }
  if (state.site.gr === "near") { a = C.addDays(asOf, -30); b = C.addDays(asOf, 45); }
  a = C.addDays(a, -3); b = C.addDays(b, 4);
  const span = Math.max(1, C.dayDiff(a, b)), left = d => Math.max(0, Math.min(100, C.dayDiff(a, d) / span * 100)), md = d => { const [, m, dd] = d.split("-").map(Number); return `${m}/${dd}`; };
  const ticks = []; for (let d = a; C.dayDiff(d, b) >= 0; d = C.addDays(d, 7)) ticks.push(d);
  const head = `<div class="g-row g-head"><div class="g-label">案件（クリックで詳細）</div><div class="g-line">${ticks.map(t => `<span class="g-tick" style="left:${left(t)}%">${md(t)}</span>`).join("")}</div></div>`;
  const today = `<i class="g-today" style="left:${left(asOf)}%" title="今日（${asOf}）"></i>`;
  let lastGroup = null;
  const body = rows.map(r => {
    const c = r.c, g = c.status || "", sel = state.site.pick === c.id, hi = r.alerts.filter(x => x.level === "高").length;
    const gh = g !== lastGroup ? `<div class="g-group">${pill(c.status)} <small>${rows.filter(x => (x.c.status || "") === g).length}件</small></div>` : ""; lastGroup = g;
    let segs = "";
    if (r.span) {
      if (c.tasks.length) segs = c.tasks.map(t => { const st = C.taskState(t, asOf), cl = { "完了": "ok", "進行中": "go", "遅れ気味": "warn", "遅れ": "late", "未着手": "wait" }[st]; const x = left(t.start), w = Math.max(0.8, left(C.addDays(t.end, 1)) - x);
        return `<div class="g-bar ${cl} seg" style="left:${x}%;width:${w}%" title="${esc(t.name)}：${md(t.start)}〜${md(t.end)}（${Math.round(t.done)}%・${st}）"><i style="width:${Math.max(0, Math.min(100, t.done))}%"></i></div>`; }).join("");
      else { const x = left(r.span.start), w = Math.max(1, left(C.addDays(r.span.end, 1)) - x); segs = `<div class="g-bar st-${STCLS[g]} ${g === "失注" ? "lost" : ""}" style="left:${x}%;width:${w}%" title="${esc(r.span.kind)}：${md(r.span.start)}〜${md(r.span.end)}"><span>${esc(r.span.kind)}</span></div>`; }
    } else segs = `<div class="g-none" style="left:${left(asOf)}%">日程が未登録</div>`;
    const ps = r.prog ? ` ${Math.round(r.prog.actual)}%` : "";
    return `${gh}<div class="g-row mg ${sel ? "picked" : ""}"><button type="button" class="g-label g-btn" data-pick-case="${esc(c.id)}" aria-pressed="${sel}" aria-label="${esc(c.name)}の詳細を開く"><b>${esc(c.name)}${hi ? ` <span class="dot-hi" title="高のアラート ${hi}件">●</span>` : r.alerts.length ? ` <span class="dot-mid" title="アラート ${r.alerts.length}件">●</span>` : ""}</b><small>${esc(c.person)}・${yen(c.amount)}円${ps}</small></button>
      <div class="g-line">${ticks.map(t => `<i class="g-grid" style="left:${left(t)}%"></i>`).join("")}${today}${segs}</div></div>`;
  }).join("");
  const legend = `<div class="g-legend"><span><i class="lg ok"></i>完了</span><span><i class="lg go"></i>進行中</span><span><i class="lg warn"></i>遅れ気味</span><span><i class="lg late"></i>遅れ</span><span><i class="lg wait"></i>未着手</span><span><i class="lg st-amber"></i>見積り中（受付〜見積）</span><span><i class="lg st-teal"></i>請求済</span><span><i class="lg st-green"></i>入金済</span><span><i class="lg st-gray"></i>失注</span><span><i class="g-today-sw"></i>今日</span></div>`;
  return `<div class="gantt mgantt" role="group" aria-label="全案件のガントチャート"><div class="g-inner mg-inner">${head}${body}</div></div>${legend}`;
}
/** 案件をクリックしたときに出す、詳細のパネル。 */
export function quickPanelHtml(c, alerts, reports) {
  const asOf = state.data.asOf, wf = state.data.workflow, now = c.tasks.length ? C.siteNow(c.tasks, asOf) : null, p = c.tasks.length ? C.siteProgress(c.tasks, asOf) : null;
  const mine = alerts.filter(a => a.caseId === c.id), reps = reports.filter(r => r.caseId === c.id).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3), memos = getMemos().filter(m => m.caseId === c.id && m.status !== "処理済");
  const boxes = now ? `<div class="now-grid"><div class="now-box"><small>いま</small><b>${now.doing.length ? esc(now.doing.map(t => t.name).join("、")) : now.next ? "着工待ち" : "すべて完了"}</b><span>${now.doing.length ? now.doing.map(t => Math.round(t.done) + "%").join("・") : now.next ? md(now.next.start) + " 着工" : ""}</span></div>
    <div class="now-box"><small>どこまで</small><b>${now.doneCount}/${now.total}工程が完了</b><span>全体 ${pct(p.actual)}（計画 ${pct(p.planned)}）</span></div>
    <div class="now-box"><small>次</small><b>${now.next ? esc(now.next.name) : "—"}</b><span>${now.next ? md(now.next.start) + "〜" + md(now.next.end) : ""}</span></div>
    <div class="now-box ${mine.length ? "warn" : ""}"><small>アラート</small><b>${mine.length}件</b><span>${mine.filter(a => a.level === "高").length}件が高</span></div></div>` : `<div class="now-grid"><div class="now-box"><small>いまの段階</small><b>${esc(wf.stages[c.stage]?.name || "")}</b><span>${esc(c.request || "")}</span></div><div class="now-box"><small>予算・金額</small><b>${yen(c.amount)}円</b><span>${c.budget ? "お客様の予算 " + yen(c.budget) + "円" : ""}</span></div><div class="now-box"><small>契約</small><b>${esc(c.contractType === "元請け経由" ? "元請け経由（発注書）" : "直接（契約書）")}</b><span>${esc(c.contractDoc || "未")}</span></div><div class="now-box ${mine.length ? "warn" : ""}"><small>アラート</small><b>${mine.length}件</b><span></span></div></div>`;
  const rows = c.tasks.map((t, i) => { const st = C.taskState(t, asOf); return `<tr><td>${i + 1}</td><td class="txt">${esc(t.name)}</td><td>${md(t.start)}〜${md(t.end)}</td><td>${stLabel(st)}</td><td>${Math.round(t.done)}%</td><td class="txt">${esc(t.craftsman || "未定")}${t.confirmed ? ' <span class="chip-ok">確認済み</span>' : t.pending ? ` <span class="chip-${t.pending.status === "相談" ? "bad" : "wait"}">${t.pending.status === "相談" ? "相談あり" : "確認待ち"}</span>` : ""}</td></tr>`; }).join("");
  return `<section class="card panel quick" id="quickPanel"><div class="ctl-row"><h2 class="ttl">${esc(c.name)} ${pill(c.status)}</h2><div class="tools"><a class="btn small" href="#/sites" data-site-open="${esc(c.id)}">詳細ページ（工程表・日報・写真・依頼）</a><button type="button" class="btn small" data-pick-case="${esc(c.id)}">閉じる</button></div></div>
    <p class="sub2">担当 ${esc(c.person)}・元請け ${esc(c.contractor)}・受注額 ${yen(c.amount)}円${p ? `・工期 ${p.start} 〜 ${p.end}` : ""}</p>${boxes}
    ${mine.length ? `<h3 class="h3">アラート</h3>${alertListHtml(mine, { site: false, limit: 3 })}` : ""}
    ${rows ? `<h3 class="h3">工程</h3><div class="tablewrap"><table class="tbl"><thead><tr>${["", "工程", "日程", "状態", "進み", "職人"].map(th).join("")}</tr></thead><tbody>${rows}</tbody></table></div>` : ""}
    ${reps.length ? `<h3 class="h3">最近の日報・写真</h3><div class="feed">${reps.map(reportCard).join("")}</div>` : ""}
    ${memos.length ? `<h3 class="h3">未処理のメモ（${memos.length}件）</h3><div class="feed">${memos.map(memoCard).join("")}</div>` : ""}</section>`;
}

/* ---------- 現場の詳細 ---------- */
function reportCard(r) {
  const ch = r.change && r.change.flag ? `<div class="chg ${r.change.approval === "未承認" ? "pend" : "ok"}"><b>追加・変更工事</b>：${esc(r.change.text || "")}（${esc(r.change.approval)}）${r.change.approval === "未承認" ? `<button type="button" class="btn small" data-approve="${esc(r.id)}">承認した</button>` : ""}</div>` : "";
  return `<article class="rep"><div class="rep-h"><b>${esc(r.date)}</b><span>${esc(r.author)}</span><span class="tag flat">${esc(r.kind || "日報")}</span></div><p>${esc(r.text)}</p>
    ${r.photos && r.photos.length ? `<div class="thumbs">${r.photos.map(id => `<img data-photo="${esc(id)}" alt="現場の写真" loading="lazy" width="120" height="90">`).join("")}</div>` : ""}${ch}</article>`;
}
export function reportFormHtml(sites, authors, defaultAuthor, selId) {
  const asOf = state.data.asOf;
  return `<form id="reportForm" novalidate><div class="form-grid">
    <div class="field"><label for="r_case">現場</label><select id="r_case" name="caseId" class="sel">${sites.map(c => opt(c.id, selId, c.name)).join("")}</select></div>
    <div class="field"><label for="r_date">日付</label><input id="r_date" name="date" type="date" value="${asOf}"></div>
    <div class="field"><label for="r_author">書いた人</label><select id="r_author" name="author" class="sel">${authors.map(a => opt(a, defaultAuthor)).join("")}</select></div>
    <div class="field"><label for="r_photos">写真（複数OK）</label><input id="r_photos" name="photos" type="file" accept="image/*" multiple></div>
    <div class="field" style="grid-column:1/-1"><label for="r_text">日報（今日やったこと・気づいたこと）</label><textarea id="r_text" name="text" rows="3" maxlength="600" class="cell-in wide" style="min-width:0"></textarea></div>
    <div class="field" style="grid-column:1/-1"><label><input type="checkbox" name="changeFlag"> 追加・変更工事が出た</label></div>
    <div class="field" style="grid-column:span 3"><label for="r_ctext">追加・変更の内容</label><input id="r_ctext" name="changeText" type="text" maxlength="160" class="cell-in wide" style="min-width:0"></div>
    <div class="field"><label for="r_capp">承認の状況</label><select id="r_capp" name="changeApproval" class="sel"><option>未承認</option><option>承認済</option></select></div></div>
    <div class="tools" style="margin-top:10px"><button class="btn" type="submit">日報を上げる</button></div><p class="msg" id="repMsg" role="status"></p>
    <p class="note">写真は、この端末のブラウザに、縮小して保存されます（他の端末には共有されません）。</p></form>`;
}
function detailHtml(all, sites, alerts, reports) {
  const asOf = state.data.asOf, wf = state.data.workflow;
  if (!sites.length) return `<div class="card empty">工程表のある現場がありません。</div>`;
  const c = sites.find(x => x.id === state.site.sel), p = C.siteProgress(c.tasks, asOf), now = C.siteNow(c.tasks, asOf), st = wf.stages[c.stage] || wf.stages[0];
  const mine = alerts.filter(a => a.caseId === c.id), myReports = reports.filter(r => r.caseId === c.id).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  const chg = myReports.filter(r => r.change && r.change.flag), pend = chg.filter(r => r.change.approval === "未承認").length;
  const ds = getDispatches().filter(d => d.caseId === c.id), sel = `<div class="ctl"><label for="siteSel">現場</label><select class="sel" id="siteSel">${sites.map(x => opt(x.id, c.id, `${x.name}（${x.status}）`)).join("")}</select></div>`;
  const nowBoxes = `<div class="now-grid">
    <div class="now-box"><small>いま</small><b>${now.doing.length ? esc(now.doing.map(t => t.name).join("、")) : now.next ? "着工待ち" : "すべて完了"}</b><span>${now.doing.length ? "進み具合 " + now.doing.map(t => Math.round(t.done) + "%").join("・") : now.next ? "次の着工 " + md(now.next.start) : ""}</span></div>
    <div class="now-box"><small>どこまで</small><b>${now.doneCount}/${now.total}工程が完了</b><span>${now.lastDone ? "最後に終わった：" + esc(now.lastDone.name) : "まだ完了した工程はありません"}・全体 ${pct(p.actual)}</span></div>
    <div class="now-box"><small>次</small><b>${now.doing.length ? (c.tasks.find(t => t.done < 100 && t !== now.doing[0] && C.parseDate(t.start) > C.parseDate(asOf))?.name || "（これが最後の工程）") : now.next ? esc(now.next.name) : "—"}</b><span>${now.next ? md(now.next.start) + "〜" + md(now.next.end) : "工期 " + p.start + " 〜 " + p.end}</span></div>
    <div class="now-box ${pend ? "warn" : ""}"><small>追加・変更工事</small><b>${chg.length ? chg.length + "件" : "なし（工程どおり）"}</b><span>${pend ? `承認待ち ${pend}件` : chg.length ? "すべて承認済み" : "日報に出ると、ここに表示されます"}</span></div></div>`;
  const checks = c.checklist ? `<div class="checks" role="group" aria-label="着工前の準備">${Object.keys(CHECK_LABELS).map(k => `<label class="chk"><input type="checkbox" data-check="${esc(c.id)}:${k}" ${c.checklist[k] ? "checked" : ""}> ${CHECK_LABELS[k]}</label>`).join("")}</div>` : `<p class="note">この現場には、着工前チェックの記録がありません。</p>`;
  const a0 = C.addDays(p.start < asOf ? p.start : asOf, -2), b0 = C.addDays(p.end > asOf ? p.end : asOf, 3);
  const dsByTask = i => ds.filter(d => d.taskIdx === i).slice(-1)[0];
  const rows = c.tasks.map((t, i) => { const s = C.taskState(t, asOf), d = dsByTask(i), who = t.craftsman || d?.craftsman; const badge = t.confirmed ? '<span class="chip-ok">確認済み</span>' : t.pending ? `<span class="chip-${t.pending.status === "相談" ? "bad" : "wait"}">${t.pending.status === "相談" ? "相談あり" : "確認待ち"}</span>` : "";
    return { labelHtml: `<b>${i + 1}. ${esc(t.name)}</b><small>${esc(who || "職人 未定")} ${badge}</small>`, start: t.start, end: t.end, done: t.done, state: s, title: `${t.name}：${t.start}〜${t.end}／${Math.round(t.done)}%` }; });
  const trs = c.tasks.map((t, i) => { const s = C.taskState(t, asOf), d = dsByTask(i); return `<tr><td>${i + 1}</td><td class="txt">${esc(t.name)}</td><td>${md(t.start)}〜${md(t.end)}</td><td>${stLabel(s)}</td><td><input class="cell-in" type="number" min="0" max="100" step="5" inputmode="numeric" aria-label="${esc(t.name)}の進み具合（％）" data-task-pct="${esc(c.id)}:${i}" value="${Math.round(t.done)}"> %</td><td class="txt">${esc(t.craftsman || "未定")}${t.confirmed ? ' <span class="chip-ok">確認済み</span>' : d && d.status === "依頼中" ? ' <span class="chip-wait">確認待ち</span>' : d && d.status === "相談" ? ' <span class="chip-bad">相談あり</span>' : ""}</td><td>${t.done >= 100 ? "" : `<button type="button" class="btn small" data-task-done="${esc(c.id)}:${i}">完了にする</button>`}</td></tr>`; }).join("");
  const openTasks = c.tasks.map((t, i) => [t, i]).filter(([t]) => t.done < 100);
  const dForm = `<form id="dispatchForm" novalidate><input type="hidden" name="caseId" value="${esc(c.id)}"><div class="form-grid">
    <div class="field"><label for="d_task">工程</label><select id="d_task" name="taskIdx" class="sel">${openTasks.map(([t, i]) => `<option value="${i}">${i + 1}. ${esc(t.name)}</option>`).join("")}</select></div>
    <div class="field"><label for="d_who">職人</label><select id="d_who" name="craftsman" class="sel">${state.data.craftsmen.map(n => `<option>${esc(n)}</option>`).join("")}</select></div>
    <div class="field"><label for="d_s">候補の開始日</label><input id="d_s" name="start" type="date" value="${C.addDays(asOf, 6)}"></div>
    <div class="field"><label for="d_e">候補の終了日</label><input id="d_e" name="end" type="date" value="${C.addDays(asOf, 8)}"></div>
    <div class="field" style="grid-column:1/-1"><label for="d_m">ひと言（任意）</label><input id="d_m" name="memo" type="text" maxlength="100" class="cell-in wide" style="min-width:0"></div></div>
    <div class="tools" style="margin-top:10px"><button class="btn" type="submit">この日程で職人に依頼する</button></div><p class="msg" id="dispMsg" role="status"></p></form>`;
  const dList = ds.length ? `<div class="tablewrap"><table class="tbl"><thead><tr>${["依頼", "工程", "職人", "候補の日程", "状況", "依頼日"].map(th).join("")}</tr></thead><tbody>${ds.map(d => `<tr><td>${esc(d.id)}</td><td class="txt">${esc(c.tasks[d.taskIdx]?.name || "")}</td><td>${esc(d.craftsman)}</td><td>${md(d.start)}（${wk(d.start)}）〜${md(d.end)}（${wk(d.end)}）</td><td>${d.status === "了承" ? '<span class="chip-ok">確認済み</span>' : d.status === "相談" ? '<span class="chip-bad">相談あり</span>' : '<span class="chip-wait">確認待ち</span>'}${d.memo ? `<br><small>${esc(d.memo)}</small>` : ""}</td><td>${esc(d.sentOn)}</td></tr>`).join("")}</tbody></table></div>` : `<p class="note">この現場の、職人への依頼はまだありません。</p>`;
  const links = state.data.craftsmen.map(n => `<span class="linkrow"><b>${esc(n)}</b> <code>${location.origin}${location.pathname}#/craftsman?name=${encodeURIComponent(n)}</code></span>`).join("");
  return `<section class="card panel"><div class="ctl-row"><h2 class="ttl">${esc(c.name)} ${pill(c.status)}</h2>${sel}</div>
      <p class="sub2">担当 ${esc(c.person)}・元請け ${esc(c.contractor)}・受注額 ${yen(c.amount)}円・工期 ${p.start} 〜 ${p.end}・アラート ${mine.length}件</p>${nowBoxes}
      ${stageTracker(c)}<div class="stage-note"><b>${esc(st.name)}</b> の担当：${esc(st.owner)}／残す記録：${esc(st.records)} <span class="tag flat">仮</span></div>
      <div class="tools"><button class="btn" type="button" data-stage="${esc(c.id)}:-1">前の工程へ</button><button class="btn" type="button" data-stage="${esc(c.id)}:1">次の工程へ</button></div>
      <h3 class="h3">着工前チェック（近隣挨拶・手配など）</h3>${checks}</section>
    ${mine.length ? `<section class="card panel"><h2 class="ttl">この現場のアラート（${mine.length}件）</h2>${alertListHtml(mine, { site: false })}</section>` : ""}
    <section class="card panel"><h2 class="ttl">工程表（進捗）</h2><p class="sub2">基準日 ${asOf}（縦線が今日）。枠の色は状態（水色＝進行中・緑＝完了・黄＝遅れ気味・赤＝遅れ・灰＝未着手）、棒の中の色は進み具合です。</p>
      ${ganttHtml(rows, a0, b0, asOf, { aria: `${c.name}の工程表` })}
      <div class="tablewrap" style="margin-top:12px"><table class="tbl"><thead><tr>${["", "工程", "日程", "状態", "進み具合", "職人", ""].map(th).join("")}</tr></thead><tbody>${trs}</tbody></table></div></section>
    <section class="grid2"><section class="card panel"><h2 class="ttl">職人に日程を依頼する</h2><p class="sub2">日程の候補を選んで依頼します。職人は、専用ページで「確認しました」を押すだけです。押すと、工程表に自動で反映されます。都合が合わないときは「代表に相談」で、こちらに連絡が来ます。</p>${dForm}<h3 class="h3">この現場の依頼</h3>${dList}
      <details style="margin-top:10px"><summary class="h3" style="cursor:pointer">職人の専用ページ（見本のリンク）</summary><div class="links">${links}</div><p class="note">本番では、職人ごとに別々の専用リンクを送ります（この見本では、画面の中で職人を切り替えて試せます）。<a href="#/craftsman">職人の確認ページを開く</a></p></details></section>
      <section class="card panel"><h2 class="ttl">日報・写真を上げる</h2>${reportFormHtml(sites, [c.person, ...state.data.craftsmen], c.person, c.id)}</section></section>
    <section class="card panel"><h2 class="ttl">この現場のメモ（${getMemos().filter(m => m.caseId === c.id).length}件）</h2>${memoFormHtml({ caseId: c.id, compact: true })}<div class="feed" style="margin-top:12px">${getMemos().filter(m => m.caseId === c.id).sort((a, b) => (a.status === "処理済") - (b.status === "処理済") || b.date.localeCompare(a.date)).map(memoCard).join("") || '<div class="empty">この現場のメモはまだありません。</div>'}</div></section>
    <section class="card panel"><h2 class="ttl">日報・写真の記録（${myReports.length}件）</h2><div class="feed">${myReports.map(reportCard).join("") || '<div class="empty">日報はまだありません。</div>'}</div></section>`;
}

/* ---------- 職人の確認ページ ---------- */
export function renderCraftsman(route, post) {
  void post;
  const asOf = state.data.asOf, all = getCases(), names = state.data.craftsmen;
  const q = new URLSearchParams((location.hash.split("?")[1] || "")).get("name");
  if (q && names.includes(q)) state.detail.craftsman = q;
  const me = names.includes(state.detail.craftsman) ? state.detail.craftsman : names[0], ds = getDispatches().filter(d => d.craftsman === me);
  const nm = d => { const c = all.find(x => x.id === d.caseId); return { c, t: c?.tasks[d.taskIdx] }; };
  const waiting = ds.filter(d => d.status === "依頼中"), confirmed = ds.filter(d => d.status === "了承").sort((a, b) => a.start.localeCompare(b.start)), consult = ds.filter(d => d.status === "相談");
  const card = d => { const { c, t } = nm(d); return `<article class="req"><div class="rep-h"><b>${esc(c?.name || "")}</b><span>${esc(t?.name || "")}</span><span class="tag flat">依頼日 ${esc(d.sentOn)}</span></div>
      <p class="big">${md(d.start)}（${wk(d.start)}）〜 ${md(d.end)}（${wk(d.end)}）</p><p class="sub2">担当：${esc(c?.person || "")}${d.memo ? "／ひと言：" + esc(d.memo) : ""}</p>
      <div class="req-actions"><button type="button" class="btn ok" data-respond="${esc(d.id)}:了承">確認しました（了承）</button>
      <input class="cell-in" type="text" maxlength="80" placeholder="相談のひと言（任意）" aria-label="相談のひと言" data-consult-memo="${esc(d.id)}" style="min-width:160px"><button type="button" class="btn bad" data-respond="${esc(d.id)}:相談">代表に相談</button></div></article>`; };
  const list = arr => arr.map(d => { const { c, t } = nm(d); return `<li><b>${md(d.start)}（${wk(d.start)}）〜${md(d.end)}（${wk(d.end)}）</b> ${esc(c?.name || "")} ／ ${esc(t?.name || "")}${d.status === "相談" ? ` <span class="chip-bad">相談中</span>` : ""}</li>`; }).join("");
  const mySites = activeSites(all).filter(c => c.status === "進行中" || ds.some(d => d.caseId === c.id));
  return `<section class="card panel"><div class="ctl-row"><h2 class="ttl">${esc(me)} さんの確認ページ（専用ページの見本）</h2><div class="ctl"><label for="craftSel">職人を切り替える（見本用）</label><select class="sel" id="craftSel">${names.map(n => opt(n, me)).join("")}</select></div></div>
      <p class="sub2">担当者が決めた日程の候補を見て、ボタンを1回押すだけです。電話やメッセージで、個別に返事をする必要はありません。</p></section>
    <section class="card panel"><h2 class="ttl">確認してほしい依頼（${waiting.length}件）</h2>${waiting.map(card).join("") || '<div class="empty">いま、確認が必要な依頼はありません。</div>'}</section>
    <section class="grid2"><section class="card panel"><h2 class="ttl">確定した予定（${confirmed.length}件）</h2><ul class="plain">${list(confirmed) || "<li>まだありません。</li>"}</ul><p class="note">確認済みの予定は、工程表に自動で反映されています。</p></section>
      <section class="card panel"><h2 class="ttl">相談中（${consult.length}件）</h2><ul class="plain">${list(consult) || "<li>ありません。</li>"}</ul><p class="note">担当者に連絡が届いています。別の日程が決まると、もう一度依頼が来ます。</p></section></section>
    <section class="card panel"><h2 class="ttl">日報・写真を上げる</h2>${mySites.length ? reportFormHtml(mySites, [me], me, mySites[0].id) : "<div class='empty'>日報を上げる現場がありません。</div>"}</section>`;
}

/* ---------- 操作 ---------- */
export function dispatchCreate(fd) {
  const c = getCases().find(x => x.id === fd.caseId), idx = Number(fd.taskIdx);
  if (!c || !c.tasks[idx]) return "工程を選んでください。";
  if (!fd.craftsman) return "職人を選んでください。";
  if (!fd.start || !fd.end) return "候補の日程（開始日と終了日）を入れてください。";
  if (C.dayDiff(fd.start, fd.end) < 0) return "終了日は、開始日と同じか、後の日にしてください。";
  const ids = getDispatches().map(d => d.id); let n = state.dEdits.added.length + 1; let id = "DN" + String(n).padStart(3, "0");
  while (ids.includes(id)) id = "DN" + String(++n).padStart(3, "0");
  state.dEdits.added.push({ id, caseId: c.id, taskIdx: idx, craftsman: fd.craftsman, start: fd.start, end: fd.end, status: "依頼中", sentOn: state.data.asOf, memo: String(fd.memo || "").trim() });
  saveMore(); return null;
}
export function dispatchRespond(id, kind, memo) { state.dEdits.status[id] = kind; if (memo) state.dEdits.memo[id] = memo; saveMore(); }
export function ackAlert(id) { state.ack[id] = state.data.asOf; saveMore(); }
export function checkSet(caseId, key, val) { const c = getCases().find(x => x.id === caseId); state.checklistEdits[caseId] = { ...(c?.checklist || {}), ...(state.checklistEdits[caseId] || {}), [key]: !!val }; saveMore(); }
export function reportApprove(id) { state.reportApproval[id] = "承認済"; saveMore(); }
export function reportAdd(fd, photoIds) {
  const text = String(fd.text || "").trim();
  if (!fd.caseId) return { error: "現場を選んでください。" };
  if (!text && !photoIds.length) return { error: "日報の内容か、写真のどちらかを入れてください。" };
  if (!fd.date) return { error: "日付を入れてください。" };
  const ids = getReports().map(r => r.id); let n = state.reportsAdded.length + 1, id = "RN" + String(n).padStart(3, "0");
  while (ids.includes(id)) id = "RN" + String(++n).padStart(3, "0");
  const flag = fd.changeFlag === "on", ctext = String(fd.changeText || "").trim();
  if (flag && !ctext) return { error: "追加・変更工事の内容を入れてください。" };
  state.reportsAdded.push({ id, caseId: fd.caseId, date: fd.date, author: fd.author || "", kind: "日報", text: text || "（写真のみ）", photos: photoIds, change: flag ? { flag: true, text: ctext, approval: fd.changeApproval || "未承認" } : null });
  saveMore(); return { ok: true, id };
}
