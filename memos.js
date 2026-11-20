/* メモ：現場でちょっと残したいことを、すぐ書き残す。処理されていないメモは、リマインドする。 */
import * as C from "./calc.js";
import { state, getCases, getMemos, saveMore } from "./state.js";
import { esc, kpi } from "./ui.js";
import { pill, opt } from "./pages2.js";

export const MEMO_KINDS = ["あとで整理", "要確認", "気づき", "メモ"];
const KIND_HINT = { "あとで整理": "いまは手が離せない。あとでまとめて整理する", "要確認": "誰かに確認が要る。早めにリマインドする", "気づき": "気づいたこと・ヒント", "メモ": "ただの記録" };
const md = d => { const [, m, dd] = d.split("-").map(Number); return `${m}/${dd}`; };

export function memoFormHtml({ caseId = "", compact = false } = {}) {
  const asOf = state.data.asOf, cases = getCases(), people = [...new Set([...cases.map(c => c.person), ...state.data.craftsmen])].filter(Boolean);
  return `<form id="memoForm" novalidate><div class="field"><label for="m_text">メモ（ひとことで十分です）</label><textarea id="m_text" name="text" rows="${compact ? 2 : 3}" maxlength="400" class="cell-in wide" style="min-width:0" placeholder="例：浴室の寸法が図面と2cm違う。あとで確認"></textarea></div>
    <div class="form-grid" style="margin-top:8px"><div class="field"><label for="m_kind">種類</label><select id="m_kind" name="kind" class="sel">${MEMO_KINDS.map(k => `<option>${k}</option>`).join("")}</select></div>
      <div class="field"><label for="m_case">現場</label><select id="m_case" name="caseId" class="sel"><option value="">（現場なし・全体）</option>${cases.map(c => opt(c.id, caseId, c.name)).join("")}</select></div>
      <div class="field"><label for="m_author">書いた人</label><select id="m_author" name="author" class="sel">${people.map(p => `<option>${esc(p)}</option>`).join("")}</select></div>
      <div class="field"><label for="m_due">期限（なくてOK）</label><input id="m_due" name="due" type="date"></div>
      <div class="field" style="grid-column:span 2"><label for="m_photos">写真（なくてOK）</label><input id="m_photos" name="photos" type="file" accept="image/*" multiple></div></div>
    <div class="tools" style="margin-top:10px"><button class="btn" type="submit">メモを残す</button><small class="sub2" style="align-self:center">日付は ${asOf}（基準日）で記録されます。</small></div><p class="msg" id="memoMsg" role="status"></p></form>`;
}

export function memoCard(m) {
  const asOf = state.data.asOf, c = m.caseId ? getCases().find(x => x.id === m.caseId) : null, age = C.dayDiff(m.date, asOf), lv = C.memoLevel(m, asOf), done = m.status === "処理済";
  return `<article class="memo-card ${done ? "done" : lv ? "lv-" + { "高": "hi", "中": "mid" }[lv.level] : ""}"><div class="rep-h"><b>${md(m.date)}</b><span class="tag flat">${esc(m.kind)}</span>${c ? `<a href="#/sites" data-site-open="${esc(c.id)}">${esc(c.name)}</a>` : "<span>全体</span>"}<span>${esc(m.author)}</span>
      ${done ? `<span class="chip-ok">処理済み（${md(m.processedOn || asOf)}）</span>` : `<span class="tag ${lv ? "down" : "flat"}">${age === 0 ? "今日" : age + "日経過"}</span>`}${m.due ? `<span class="tag ${!done && C.parseDate(m.due) < C.parseDate(asOf) ? "down" : "flat"}">期限 ${md(m.due)}</span>` : ""}</div>
    <p>${esc(m.text)}</p>${m.photos && m.photos.length ? `<div class="thumbs">${m.photos.map(id => `<img data-photo="${esc(id)}" alt="メモの写真" loading="lazy" width="120" height="90">`).join("")}</div>` : ""}
    ${lv && !done ? `<div class="al-a">→ ${esc(lv.title)}</div>` : ""}<div class="tools">${done ? `<button type="button" class="btn small" data-memo-undo="${esc(m.id)}">未処理に戻す</button>` : `<button type="button" class="btn small ok" data-memo-done="${esc(m.id)}">処理済みにする</button>`}</div></article>`;
}

export function renderMemos(route, post) {
  void post;
  const asOf = state.data.asOf, all = getMemos(), open = all.filter(m => m.status !== "処理済"), v = state.mv;
  const lvls = open.map(m => C.memoLevel(m, asOf)).filter(Boolean), overdue = open.filter(m => m.due && C.parseDate(m.due) < C.parseDate(asOf)).length;
  const kpis = [
    kpi({ tone: "amber", icon: "memo", label: "処理されていないメモ", value: String(open.length), unit: "件", sub: `全部で ${all.length}件（処理済み ${all.length - open.length}件）` }),
    kpi({ tone: lvls.some(l => l.level === "高") ? "amber" : "teal", icon: "check", label: "リマインド中のメモ", value: String(lvls.length), unit: "件", sub: `重い（高）${lvls.filter(l => l.level === "高").length}・中 ${lvls.filter(l => l.level === "中").length}` }),
    kpi({ tone: overdue ? "amber" : "gold", icon: "target", label: "期限が過ぎたメモ", value: String(overdue), unit: "件", sub: overdue ? "期限のあるメモが、処理されていません" : "期限切れはありません" }),
    kpi({ tone: "sky", icon: "report", label: "今日残したメモ", value: String(all.filter(m => m.date === asOf).length), unit: "件", sub: `基準日 ${asOf}` }),
  ].join("");
  const filt = all.filter(m => (v.tab === "all" || (v.tab === "open" ? m.status !== "処理済" : m.status === "処理済")) && (v.caseId === "all" || (v.caseId === "__none" ? !m.caseId : m.caseId === v.caseId)) && (v.kind === "all" || m.kind === v.kind))
    .sort((a, b) => (a.status === "処理済") - (b.status === "処理済") || (C.memoLevel(a, asOf)?.level === "高" ? 0 : 1) - (C.memoLevel(b, asOf)?.level === "高" ? 0 : 1) || b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  const tabs = `<nav class="page-tabs" aria-label="メモの表示">${[["open", `未処理（${open.length}）`], ["done", `処理済み（${all.length - open.length}）`], ["all", "すべて"]].map(([k, t]) => `<a href="#/memos" data-memo-tab="${k}" ${v.tab === k ? 'aria-current="page"' : ""}>${t}</a>`).join("")}</nav>`;
  const cases = getCases().filter(c => all.some(m => m.caseId === c.id));
  const filters = `<div class="filter-bar"><div class="ctl"><label for="mvCase">現場</label><select class="sel" id="mvCase"><option value="all">すべて</option><option value="__none"${v.caseId === "__none" ? " selected" : ""}>（現場なし・全体）</option>${cases.map(c => opt(c.id, v.caseId, c.name)).join("")}</select></div>
    <div class="ctl"><label for="mvKind">種類</label><select class="sel" id="mvKind"><option value="all">すべて</option>${MEMO_KINDS.map(k => opt(k, v.kind)).join("")}</select></div></div>`;
  return `<section class="kpis k5" aria-label="メモの主な数字">${kpis}</section>
    <section class="card panel"><h2 class="ttl">メモを残す（すぐ書ける）</h2>${memoFormHtml()}<p class="note">種類：${MEMO_KINDS.map(k => `<b>${k}</b>＝${KIND_HINT[k]}`).join("／")}。処理されないまま日がたつと、リマインドが出ます（「要確認」は1日、「あとで整理」は3日で中、7日で高）。</p></section>
    ${tabs}<section class="card panel"><h2 class="ttl">メモの一覧（${filt.length}件）</h2>${filters}<div class="feed">${filt.map(memoCard).join("") || '<div class="empty">この条件のメモはありません。</div>'}</div></section>`;
}

/* ---------- 操作 ---------- */
export function memoAdd(fd, photoIds) {
  const text = String(fd.text || "").trim();
  if (!text && !photoIds.length) return { error: "メモの内容か、写真のどちらかを入れてください。" };
  const ids = getMemos().map(m => m.id); let n = state.memosAdded.length + 1, id = "NN" + String(n).padStart(3, "0");
  while (ids.includes(id)) id = "NN" + String(++n).padStart(3, "0");
  state.memosAdded.push({ id, date: state.data.asOf, caseId: fd.caseId || null, kind: MEMO_KINDS.includes(fd.kind) ? fd.kind : "メモ", text: text || "（写真のみ）", author: fd.author || "", due: fd.due || null, status: "未処理", photos: photoIds, processedOn: null });
  saveMore(); return { ok: true, id };
}
export function memoSetDone(id, done) { state.memoEdits[id] = done ? { status: "処理済", processedOn: state.data.asOf } : { status: "未処理", processedOn: null }; saveMore(); }
export function memosCsv() {
  const rows = [["番号", "日付", "種類", "現場", "書いた人", "内容", "期限", "状況", "処理した日"]];
  getMemos().forEach(m => rows.push([m.id, m.date, m.kind, getCases().find(c => c.id === m.caseId)?.name || "全体", m.author, m.text, m.due || "", m.status, m.processedOn || ""]));
  return { name: "メモ.csv", text: "\uFEFF" + rows.map(r => r.map(v => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(",")).join("\r\n") };
}
