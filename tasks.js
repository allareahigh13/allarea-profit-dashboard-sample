/* タスク：自分のタスクと、人に預けたタスク。依頼（委任）→ 受け取り → 進み具合 → 報告 → 確認・完了。放っておくとリマインド。全ページから使えるドック付き。 */
import * as C from "./calc.js";
import { state, store, getTasks, taskPatch, getCases } from "./state.js";
import { esc, kpi } from "./ui.js";
import { opt } from "./pages2.js";

const md = d => { const [, m, dd] = d.split("-").map(Number); return `${m}/${dd}`; };
const lvTag = l => `<span class="lvl ${{ "高": "hi", "中": "mid", "低": "lo" }[l]}">${l}</span>`;
const people = () => state.data.staff;
const caseName = id => (id ? getCases().find(c => c.id === id)?.name || "" : "");
const open = ts => ts.filter(t => t.status !== "完了");

export const myReminders = () => C.taskReminders(getTasks(), state.data.asOf, state.me);
export const attentionCount = () => myReminders().length;

/* ---------- 1件のタスク ---------- */
export function taskCardHtml(t, { compact = false } = {}) {
  const asOf = state.data.asOf, me = state.me, delegated = t.createdBy !== t.assignee, age = C.dayDiff(t.createdOn, asOf), overdue = !!(t.due && C.parseDate(t.due) < C.parseDate(asOf) && t.status !== "完了");
  const mineRole = t.assignee === me, byMe = t.createdBy === me, cn = caseName(t.caseId);
  const st = { "未着手": "flat", "対応中": "flat", "報告済": "up", "完了": "up", "差し戻し": "down" }[t.status] || "flat";
  let acts = "";
  if (t.status !== "完了") {
    if (mineRole && delegated) {
      if (!t.ackedOn) acts += `<button type="button" class="btn small" data-task-ack="${esc(t.id)}">受け取りました</button>`;
      if (t.status !== "報告済") acts += `<input class="cell-in" type="text" maxlength="100" placeholder="報告のひとこと" aria-label="報告のひとこと" data-task-note="${esc(t.id)}" style="min-width:150px"><button type="button" class="btn small ok" data-task-report="${esc(t.id)}">${esc(t.createdBy)}に報告する</button>`;
      else acts += `<span class="chip-ok">報告しました（確認待ち）</span>`;
    } else if (mineRole && !delegated) acts += `<button type="button" class="btn small ok" data-task-selfdone="${esc(t.id)}">完了にする</button>`;
    if (byMe && delegated) {
      if (t.status === "報告済") acts += `<button type="button" class="btn small ok" data-task-confirm="${esc(t.id)}">確認して完了にする</button><input class="cell-in" type="text" maxlength="100" placeholder="差し戻す理由" aria-label="差し戻す理由" data-task-rejnote="${esc(t.id)}" style="min-width:140px"><button type="button" class="btn small bad" data-task-reject="${esc(t.id)}">差し戻す</button>`;
      else acts += `<button type="button" class="btn small" data-task-nudge="${esc(t.id)}">催促する</button>`;
    }
  }
  const subs = t.subs || [], pr = C.taskProgress(t), canEdit = (mineRole || byMe) && t.status !== "完了", id = esc(t.id);
  const prog = subs.length ? `<div class="tprog"><div class="bar-h"><i style="width:${pr}%"></i></div><b>${pr}%</b><span class="sub2" style="margin:0">小項目 ${subs.filter(x => x.done).length}／${subs.length} 完了</span></div>`
    : mineRole && t.status !== "完了" && t.status !== "報告済"
      ? `<div class="tprog"><label>進み具合（自分で管理）<input type="range" min="0" max="100" step="10" value="${pr}" data-task-prog="${id}" aria-label="${esc(t.title)}の進み具合"></label><b>${pr}%</b></div>`
      : `<div class="tprog"><div class="bar-h"><i style="width:${pr}%"></i></div><b>${pr}%</b></div>`;
  const subHtml = compact && !subs.length ? "" : `<div class="subtasks"><h5>小項目${subs.length ? "（チェックすると、進み具合が自動で変わります）" : "（なくてOK。分けて進めたいときに足します）"}</h5>
    ${subs.map((x, i) => `<div class="sub-row ${x.done ? "done" : ""}"><label><input type="checkbox" data-sub-check="${id}:${i}" ${x.done ? "checked" : ""} ${canEdit ? "" : "disabled"}> <span>${esc(x.text)}</span></label>${canEdit ? `<button type="button" class="btn small" data-sub-del="${id}:${i}" aria-label="「${esc(x.text)}」を消す">消す</button>` : ""}</div>`).join("")}
    ${canEdit ? `<div class="sub-add"><input class="cell-in" type="text" maxlength="80" placeholder="小項目を足す（例：数字を集める）" aria-label="小項目を足す" data-sub-text="${id}" style="min-width:150px"><button type="button" class="btn small" data-sub-add="${id}">足す</button></div>` : ""}</div>`;
  const memoHtml = compact ? (t.memo ? `<p class="sub2">メモ：${esc(t.memo)}</p>` : "")
    : `<div class="task-memo"><label for="memo_${id}">メモ（進み具合・やること・気づき。入れると、その場で保存されます）</label><textarea id="memo_${id}" rows="2" maxlength="600" data-task-memo="${id}" ${canEdit || t.status === "完了" ? "" : "readonly"} placeholder="例：資料の骨子は完成。数字は経理から月曜に届く。">${esc(t.memo || "")}</textarea></div>`;
  return `<article class="task ${overdue ? "late" : ""} ${t.status === "報告済" ? "reported" : ""} ${mineRole && delegated && !t.ackedOn && t.status !== "完了" ? "new" : ""}">
    <div class="rep-h"><b class="task-title">${esc(t.title)}</b></div>
    <div class="tags"><span class="tag flat">${esc(t.createdBy)} → ${esc(t.assignee)}</span><span class="tag ${st}">${esc(t.status)}</span>${t.due ? `<span class="tag ${overdue ? "down" : "flat"}">期限 ${md(t.due)}</span>` : ""}<span class="tag flat">${age === 0 ? "今日" : age + "日前に依頼"}</span>
      ${cn ? `<a class="tag flat" href="#/sites" data-site-open="${esc(t.caseId)}">${esc(cn)}</a>` : ""}${mineRole && delegated && !t.ackedOn && t.status !== "完了" ? '<span class="tag down">新着</span>' : ""}${t.nudgedOn && t.status !== "完了" ? `<span class="tag down">催促あり ${md(t.nudgedOn)}</span>` : ""}</div>
    ${!compact && t.detail ? `<p class="sub2">${esc(t.detail)}</p>` : ""}${t.reportNote && t.status !== "完了" ? `<p class="sub2">${t.status === "差し戻し" ? "差し戻しの理由" : "報告"}：${esc(t.reportNote)}</p>` : ""}${prog}${subHtml}${memoHtml}${acts ? `<div class="req-actions">${acts}</div>` : ""}</article>`;
}

/* ---------- 依頼のフォーム ---------- */
export function taskFormHtml({ caseId = "", idp = "tf" } = {}) {
  const asOf = state.data.asOf, cases = getCases();
  return `<form class="taskForm" id="${idp}" novalidate data-taskform><div class="form-grid">
    <div class="field" style="grid-column:span 2"><label for="${idp}_t">頼みたいこと（タスク）</label><input id="${idp}_t" name="title" type="text" maxlength="120" class="cell-in wide" style="min-width:0"></div>
    <div class="field"><label for="${idp}_a">誰に頼むか</label><select id="${idp}_a" name="assignee" class="sel">${people().map(p => opt(p, state.me === "代表" ? "担当A" : "代表", p === state.me ? p + "（自分）" : p)).join("")}</select></div>
    <div class="field"><label for="${idp}_d">期限</label><input id="${idp}_d" name="due" type="date" value="${C.addDays(asOf, 3)}"></div>
    <div class="field" style="grid-column:span 2"><label for="${idp}_m">くわしく（なくてOK）</label><input id="${idp}_m" name="detail" type="text" maxlength="200" class="cell-in wide" style="min-width:0"></div>
    <div class="field" style="grid-column:span 2"><label for="${idp}_c">関係する案件（なくてOK）</label><select id="${idp}_c" name="caseId" class="sel"><option value="">（なし）</option>${cases.map(c => opt(c.id, caseId, c.name)).join("")}</select></div></div>
    <div class="tools" style="margin-top:10px"><button class="btn" type="submit">この内容で頼む（自分あてなら、自分のタスクになります）</button></div><p class="msg" role="status" data-taskmsg></p></form>`;
}

/* ---------- ページ ---------- */
export function renderTasks(route, post) {
  void post;
  const me = state.me, all = getTasks(), rem = myReminders(), cnt = C.taskCounts(all, me), v = state.tv;
  const mine = open(all.filter(t => t.assignee === me)).sort((a, b) => (b.createdBy !== b.assignee && !b.ackedOn) - (a.createdBy !== a.assignee && !a.ackedOn) || (a.due || "9").localeCompare(b.due || "9"));
  const delegated = open(all.filter(t => t.createdBy === me && t.assignee !== me)).sort((a, b) => (b.status === "報告済") - (a.status === "報告済") || a.createdOn.localeCompare(b.createdOn));
  const done = all.filter(t => t.status === "完了" && (t.assignee === me || t.createdBy === me));
  const kpis = [
    kpi({ tone: "sky", icon: "task", label: "自分のタスク", value: String(cnt.mine), unit: "件", sub: `新しく来たもの ${cnt.newForMe}件` }),
    kpi({ tone: cnt.newForMe ? "amber" : "teal", icon: "check", label: "新しく来たタスク", value: String(cnt.newForMe), unit: "件", sub: cnt.newForMe ? "「受け取りました」を押してください" : "新しいタスクはありません" }),
    kpi({ tone: "gold", icon: "person", label: "人に預けているタスク", value: String(cnt.delegated), unit: "件", sub: "報告が来るまで、ここに残ります" }),
    kpi({ tone: cnt.reportedToMe ? "amber" : "teal", icon: "report", label: "報告が届いているもの", value: String(cnt.reportedToMe), unit: "件", sub: cnt.reportedToMe ? "確認して、完了にするか差し戻します" : "確認待ちの報告はありません" }),
  ].join("");
  const tabs = `<nav class="page-tabs" aria-label="タスクの見方">${[["mine", `自分のタスク（${mine.length}）`], ["delegated", `預けているタスク（${delegated.length}）`], ["done", `完了（${done.length}）`]].map(([k, t]) => `<a href="#/tasks" data-task-tab="${k}" ${v.tab === k ? 'aria-current="page"' : ""}>${t}</a>`).join("")}</nav>`;
  const list = v.tab === "mine" ? mine : v.tab === "delegated" ? delegated : done;
  const remHtml = rem.length ? rem.map(a => `<div class="alert-item ${{ "高": "hi", "中": "mid", "低": "lo" }[a.level]}"><div class="al-h">${lvTag(a.level)}<b>${esc(a.title)}</b><span class="kind">${esc(a.kind)}</span></div><p>${esc(a.detail)}</p><div class="al-a">→ ${esc(a.action)}</div></div>`).join("") : `<div class="empty">いま、対応が必要なタスクのリマインドはありません。</div>`;
  const hint = v.tab === "delegated" ? "預けたタスクは、報告が来て「完了」にするまで、ここに残ります。2日たっても報告が来ないと、リマインドが出ます。" : v.tab === "mine" ? "進み具合は、自分で更新します。終わったら、依頼した人に「報告する」を押します（2日たっても報告がないと、リマインドが出ます）。" : "完了したタスクです。";
  return `<section class="card panel"><div class="ctl-row"><h2 class="ttl">いま見ている人</h2><div class="ctl"><label for="meSel">見る人（見本用に切り替えられます）</label><select class="sel" id="meSel">${people().map(p => opt(p, me)).join("")}</select></div></div>
      <p class="sub2">本番では、ログインした本人の専用ページになります。この見本では、「見る人」を切り替えて、依頼する側・受ける側の両方を試せます。</p></section>
    <section class="kpis k5" aria-label="タスクの数">${kpis}</section>
    <section class="card panel"><h2 class="ttl">リマインド（${rem.length}件）</h2>${remHtml}</section>
    <section class="card panel"><h2 class="ttl">タスクを頼む／自分のタスクを足す</h2>${taskFormHtml({ idp: "tf_page" })}</section>
    ${tabs}<section class="card panel"><h2 class="ttl">${v.tab === "mine" ? "自分のタスク" : v.tab === "delegated" ? "人に預けているタスク" : "完了したタスク"}（${list.length}件）</h2><p class="note" style="margin-top:0">${hint}</p><div class="feed">${list.map(t => taskCardHtml(t)).join("") || '<div class="empty">この一覧のタスクはありません。</div>'}</div></section>`;
}

/* ---------- 全ページの上のバナーと、右下のドック ---------- */
export function bannerHtml() {
  const rem = myReminders(), me = state.me, hi = rem.filter(r => r.level === "高"), nw = rem.filter(r => r.kind === "新着"), got = rem.filter(r => r.kind === "報告が届いた");
  const msgs = [];
  if (nw.length) msgs.push(`<b>${esc([...new Set(getTasks().filter(t => t.assignee === me && t.createdBy !== me && !t.ackedOn && t.status !== "完了" && t.status !== "報告済").map(t => t.createdBy))].join("・"))}からタスクが来ています</b>（${nw.length}件）`);
  hi.filter(r => r.kind === "報告" || r.kind === "差し戻し").forEach(r => msgs.push(esc(r.title)));
  if (hi.some(r => r.kind === "預けたまま")) msgs.push(`預けたタスクの報告が、まだ来ていないものがあります（${hi.filter(r => r.kind === "預けたまま").length}件）`);
  if (got.length) msgs.push(`報告が届いています（${got.length}件）`);
  if (!msgs.length) return "";
  return `<div class="task-banner ${hi.length ? "hot" : ""}" role="status"><span class="ic">${"📋"}</span><div>${msgs.slice(0, 3).map(m => `<div>${m}</div>`).join("")}</div><a class="btn small" href="#/tasks">タスクを見る</a></div>`;
}
export function dockHtml() {
  const me = state.me, all = getTasks(), cnt = C.taskCounts(all, me), n = attentionCount(), o = state.dock.open;
  const mine = open(all.filter(t => t.assignee === me)).slice(0, 4), deleg = open(all.filter(t => t.createdBy === me && t.assignee !== me)).slice(0, 4);
  const cid = state.site.sel && location.hash.startsWith("#/sites") ? state.site.sel : state.detail.openId && location.hash.startsWith("#/cases") ? state.detail.openId : "";
  return `<button type="button" class="dock-btn" data-dock-toggle aria-expanded="${o}" aria-controls="dockPanel">${"📋"} タスク <span class="badge" ${n ? "" : "hidden"}>${n}</span></button>
    <aside class="dock-panel" id="dockPanel" aria-label="タスクの一覧" ${o ? "" : "hidden"}><div class="dock-h"><b>タスク（${esc(me)}）</b><button type="button" class="btn small" data-dock-toggle>閉じる</button></div>
      <div class="ctl"><label for="meSel2">見る人（見本用）</label><select class="sel" id="meSel2" data-me>${people().map(p => opt(p, me)).join("")}</select></div>
      <div class="dock-sum"><span>自分 <b>${cnt.mine}</b></span><span>新着 <b>${cnt.newForMe}</b></span><span>預け中 <b>${cnt.delegated}</b></span><span>報告 <b>${cnt.reportedToMe}</b></span></div>
      <h4>自分のタスク</h4>${mine.map(t => taskCardHtml(t, { compact: true })).join("") || '<p class="sub2">ありません。</p>'}<h4>預けているタスク</h4>${deleg.map(t => taskCardHtml(t, { compact: true })).join("") || '<p class="sub2">ありません。</p>'}
      <details class="dock-add"><summary>タスクを頼む／足す</summary>${taskFormHtml({ caseId: cid, idp: "tf_dock" })}</details><a class="btn small" href="#/tasks" style="margin-top:8px">タスクのページを開く</a></aside>`;
}

/* ---------- 操作 ---------- */
export function taskCreate(fd) {
  const title = String(fd.title || "").trim();
  if (!title) return { error: "頼みたいこと（タスク）を入れてください。" };
  if (!fd.assignee) return { error: "誰に頼むかを選んでください。" };
  if (fd.due && !/^\d{4}-\d{2}-\d{2}$/.test(fd.due)) return { error: "期限の日付の形が違います。" };
  const ids = getTasks().map(t => t.id); let n = state.taskState.added.length + 1, id = "TN" + String(n).padStart(3, "0");
  while (ids.includes(id)) id = "TN" + String(++n).padStart(3, "0");
  const self = fd.assignee === state.me;
  state.taskState.added.push({ id, title, detail: String(fd.detail || "").trim(), caseId: fd.caseId || "", createdBy: state.me, assignee: fd.assignee, createdOn: state.data.asOf, due: fd.due || null, status: "未着手", progress: 0, subs: [], memo: "", ackedOn: self ? state.data.asOf : null, reportedOn: null, reportNote: "", nudges: 0, nudgedOn: null });
  store.set("taskState", state.taskState); return { ok: true, id, self, to: fd.assignee };
}
const A = () => state.data.asOf;
export const taskAck = id => { const t = getTasks().find(x => x.id === id); taskPatch(id, { ackedOn: A(), status: t.status === "未着手" ? "対応中" : t.status }); };
export function taskSetProgress(id, v) { const n = Math.max(0, Math.min(100, Number(v) || 0)), t = getTasks().find(x => x.id === id); taskPatch(id, { progress: n, status: n > 0 && t.status === "未着手" ? "対応中" : t.status, ackedOn: t.ackedOn || A() }); }
export const taskReport = (id, note) => taskPatch(id, { status: "報告済", reportedOn: A(), reportNote: String(note || "").trim(), progress: 100 });
export const taskConfirm = id => taskPatch(id, { status: "完了", completedOn: A() });
export const taskSelfDone = id => taskPatch(id, { status: "完了", completedOn: A(), progress: 100 });
export const taskReject = (id, note) => taskPatch(id, { status: "差し戻し", reportedOn: null, reportNote: String(note || "").trim() || "もう一度、確認してください" });
export const taskNudge = id => { const t = getTasks().find(x => x.id === id); taskPatch(id, { nudges: (t.nudges || 0) + 1, nudgedOn: A() }); };
export const setMe = p => { state.me = p; store.set("me", p); };

/* ---- 小項目とメモ ---- */
const setSubs = (id, subs) => { const t = getTasks().find(x => x.id === id), p = { subs }; if (subs.some(x => x.done) && t.status === "未着手") p.status = "対応中"; p.progress = subs.length ? Math.round(subs.filter(x => x.done).length / subs.length * 100) : t.progress; taskPatch(id, p); };
export function taskSubAdd(id, text) {
  const x = String(text || "").trim(); if (!x) return "小項目の中身を入れてください。";
  const t = getTasks().find(y => y.id === id); setSubs(id, [...(t.subs || []), { text: x, done: false }]); return null;
}
export const taskSubToggle = (id, i) => { const t = getTasks().find(y => y.id === id), s = (t.subs || []).map((x, j) => (j === i ? { ...x, done: !x.done } : x)); setSubs(id, s); };
export const taskSubDel = (id, i) => { const t = getTasks().find(y => y.id === id); setSubs(id, (t.subs || []).filter((_, j) => j !== i)); };
export const taskMemoSet = (id, text) => taskPatch(id, { memo: String(text || "").slice(0, 600) });
