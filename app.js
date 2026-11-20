/* 経営ダッシュボード：ページの切り替え・操作・データの読み込み。 */
import { state, store } from "./state.js";
import * as C from "./calc.js";
import { ROUTES, headHtml, csvFor } from "./pages.js";
import { esc, svgI, ICON, animateCounts } from "./ui.js";
import * as P2 from "./pages2.js";
import * as S3 from "./sites.js";
import * as MN from "./money.js";
import * as MM from "./memos.js";
import * as PP from "./people.js";
import * as CD from "./casedetail.js";
import * as TK from "./tasks.js";
import * as TL from "./talks.js";
import { savePhoto, hydratePhotos } from "./photos.js";
import { getAlerts, getMemos, getMeetings } from "./state.js";

const $ = s => document.querySelector(s);

/* ---------- 読み込み ---------- */
async function load() {
  try {
    const res = await fetch("data.sample.json?" + Date.now(), { cache: "no-store" });
    if (!res.ok) throw new Error("http " + res.status);
    const d = await res.json();
    if (!Array.isArray(d.months) || d.months.length !== 12 || !Array.isArray(d.businesses) || !d.businesses.length
      || !Array.isArray(d.weights) || !Array.isArray(d.people)) throw new Error("形");
    state.data = d; state.updatedAt = new Date();
    $("#err").hidden = true;
    return true;
  } catch (e) {
    $("#err").hidden = false;
    $("#err").innerHTML = `<div class="guide"><p><b>何が起きたか：</b>数字のデータを読み込めませんでした。</p><p><b>次にすること：</b></p><ol><li>「データ更新」を押して、もう一度読み込んでください。</li><li>直らないときは、データの置き場（data.sample.json）が同じフォルダにあるかを確かめてください。</li></ol></div>`;
    return false;
  }
}

/* ---------- 左のメニュー ---------- */
function buildRail() {
  const items = ROUTES.map(r => `${r.ai ? '<div class="sep"></div>' : ""}<a class="nav${r.sub ? " sub" : ""}${r.ai ? " ai" : ""}" href="#/${r.path}" data-path="${r.path}" aria-label="${esc(r.nav)}">${svgI(ICON[r.icon])}<span class="nm">${esc(r.nav)}</span><span class="tipn" aria-hidden="true">${esc(r.nav)}</span></a>`).join("");
  $("#rail").innerHTML = `<div class="brand"><span class="logo"><svg viewBox="0 0 24 24"><path d="M4 16 12 4l8 12M8 14h8"/></svg></span><span class="t">経営ダッシュボード</span></div>${items}<canvas id="dots" aria-hidden="true"></canvas>`;
}
function markNav(r) {
  document.querySelectorAll("#rail a.nav").forEach(a => { if (a.dataset.path === r.path) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
}
function drawDots() {
  const c = $("#dots"); if (!c || getComputedStyle(c).display === "none") return;
  const r = c.getBoundingClientRect(), dpr = devicePixelRatio || 1; c.width = r.width * dpr; c.height = r.height * dpr;
  const x = c.getContext("2d"); x.scale(dpr, dpr);
  for (let i = 0; i < 520; i++) {
    const t = i / 520, px = t * r.width, wave = Math.sin(t * 5.2 + 0.4) * 28 + Math.sin(t * 11) * 6, spread = ((i * 7919) % 100 / 100 - .5) * (40 + t * 70);
    const py = r.height * 0.62 + wave * (1 - t * .3) + spread - t * 26, a = ((i * 104729) % 100) / 100 * .55 + .1, hue = t < .5 ? 205 : 265;
    x.fillStyle = `hsla(${hue + ((i * 31) % 25)},90%,68%,${a})`; x.beginPath(); x.arc(px, py, ((i * 17) % 13) / 10 + .3, 0, 6.3); x.fill();
  }
}

/* ---------- 色味 ---------- */
function applyTheme() { document.documentElement.dataset.theme = ["navy", "violet", "forest", "light"].includes(state.theme) ? state.theme : "navy"; setTimeout(drawDots, 0); }

/* ---------- 描き直し ---------- */
function currentRoute() {
  const h = location.hash.replace(/^#\/?/, "").split("?")[0];   // 「?name=…」の部分は、ページの選び方に使わない
  return ROUTES.find(r => r.path === h) || ROUTES.find(r => r.path === "pl");
}
function render(keepScroll = true) {
  if (!state.data) return;
  const y = window.scrollY, r = currentRoute();
  document.title = `${r.title}｜経営ダッシュボード`;
  markNav(r);
  $("#head").innerHTML = headHtml(r);
  const post = [];
  $("#page").innerHTML = r.render(r, post);
  post.forEach(f => f());
  if (!keepScroll) animateCounts($("#page"));   // 数字が増える動きは、ページを開いたときだけ（編集のたびにちらつかせない）
  requestAnimationFrame(() => document.querySelectorAll("#page .cmp .track i").forEach(i => { i.style.width = i.dataset.w + "%"; }));
  $("#taskBanner").innerHTML = TK.bannerHtml(); $("#dock").innerHTML = TK.dockHtml();
  hydratePhotos($("#page"));
  updateBadge();
  window.scrollTo(0, keepScroll ? y : 0);
}
function updateBadge() {
  const set = (path, n, label) => {
    const a = document.querySelector(`#rail a[data-path="${path}"]`); if (!a) return;
    let b = a.querySelector(".badge"); if (!b) { b = document.createElement("span"); b.className = "badge"; b.setAttribute("aria-label", label); a.appendChild(b); }
    b.textContent = n; b.hidden = !n;
  };
  if (!state.data) return;
  set("sites", getAlerts().filter(a => a.kind !== "メモ").length, "対応が必要なアラートの数");
  set("tasks", TK.attentionCount(), "対応が必要なタスクのお知らせの数");
  set("memos", getMemos().filter(m => m.status !== "処理済").length, "処理されていないメモの数");
}

/* ---------- 操作 ---------- */
document.addEventListener("click", e => {
  const t = e.target.closest("button, a");
  if (!t) return;
  if (t.dataset.theme) { state.theme = t.dataset.theme; store.set("theme", state.theme); applyTheme(); render(); return; }
  if (t.dataset.toggle) { const k = t.dataset.toggle === "mom" ? "showMoM" : "showYoY"; state[k] = !state[k]; store.set(k, state[k]); render(); return; }
  if (t.dataset.mode) { state.mode = t.dataset.mode; render(); return; }
  if (t.dataset.metric) { state.metric = t.dataset.metric; render(); return; }
  if (t.dataset.comp) { state.compMeasure = t.dataset.comp; render(); return; }
  if (t.dataset.ser) { const k = t.dataset.ser; state.ser[k] = !state.ser[k]; render(); return; }
  if (t.dataset.sort) { const k = t.dataset.sort; state.sort = state.sort.key === k ? { key: k, dir: -state.sort.dir } : { key: k, dir: -1 }; render(); return; }
  if (t.id === "btnRefresh") { refresh(); return; }
  if (t.id === "btnCsv") { download(); return; }
  if (t.id === "btnPrint") { window.print(); return; }
  if (t.id === "goalReset") { state.overrides = {}; store.set("targets", {}); render(); flash("元の目標に戻しました。", "ok"); return; }
});
document.addEventListener("change", e => {
  const t = e.target;
  if (t.id === "selRange") { state.range = t.value; render(); }
  else if (t.id === "staffBiz") { state.staffBiz = t.value; render(); }
  else if (t.id === "reportIdx") { state.reportIdx = +t.value; render(); }
  else if (t.id === "aiScope") { state.aiScope = t.value; render(); }
});
document.addEventListener("submit", e => {
  if (e.target.id !== "goalForm") return;
  e.preventDefault();
  const form = e.target, next = {}, errs = [];
  form.querySelectorAll("input").forEach(i => i.removeAttribute("aria-invalid"));
  for (const b of state.data.businesses) {
    const g = k => { const el = form.elements[`${b.id}.${k}`], v = Number(el.value); const ok = el.value.trim() !== "" && Number.isFinite(v) && v >= 0; if (!ok) { el.setAttribute("aria-invalid", "true"); errs.push(`${b.short}の${k === "sales" ? "売上" : "利益"}目標は、0以上の数で入れてください。`); } return v; };
    const s = g("sales"), p = g("profit");
    if (Number.isFinite(s) && Number.isFinite(p) && p > s) { form.elements[`${b.id}.profit`].setAttribute("aria-invalid", "true"); errs.push(`${b.short}の利益目標は、売上目標より大きくできません。`); }
    next[b.id] = { sales: s, profit: p };
  }
  const msg = $("#goalMsg");
  if (errs.length) { msg.className = "msg err"; msg.textContent = errs.join(" "); return; }
  state.overrides = next; store.set("targets", next); render(); flash("目標を反映して、計算し直しました。", "ok");
});
function flash(text, cls) { const m = $("#goalMsg"); if (m) { m.className = "msg " + cls; m.textContent = text; } }

async function refresh() {
  const ok = await load();
  if (ok) { render(); const s = $(".tools"); if (s) { const sp = document.createElement("span"); sp.className = "status"; sp.setAttribute("role", "status"); sp.textContent = `更新しました ${state.updatedAt.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}`; s.appendChild(sp); } }
}
function download() {
  if (!state.data) return;
  const { name, text } = csvFor(currentRoute());
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" })); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
}

/* ---------- 案件管理・現場進捗・見積の操作 ---------- */
function toast(text, cls = "ok") {
  let t = $("#toast"); if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
  t.textContent = text; t.dataset.cls = cls; t.classList.add("on"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("on"), 3500);
}
function updateEstimateView() {
  const e = state.est; if (!e || !$("#estSummary")) return;
  $("#estSummary").innerHTML = P2.estSummaryHtml(e); $("#estPreview").innerHTML = P2.estPreviewHtml(e);
  document.querySelectorAll(".line-amt").forEach(td => { td.textContent = Math.floor(0 + (Number(e.lines[+td.dataset.line]?.qty) > 0 && Number(e.lines[+td.dataset.line]?.price) >= 0 ? Number(e.lines[+td.dataset.line].qty) * Number(e.lines[+td.dataset.line].price) : 0)).toLocaleString("ja-JP"); });
}
document.addEventListener("input", e => {
  const t = e.target; if (!t.dataset || t.dataset.est === undefined) return;
  P2.estSet(t.dataset.est, t.value); updateEstimateView();
});
document.addEventListener("click", e => {
  const t = e.target.closest("button, a"); if (!t) return;
  if (t.dataset.siteTab) { e.preventDefault(); state.site.tab = t.dataset.siteTab; render(); return; }
  if (t.dataset.siteOpen) { state.site.sel = t.dataset.siteOpen; state.site.tab = "detail"; if (location.hash === "#/sites") { e.preventDefault(); render(); } return; }
  if (t.dataset.stage) { const [id, d] = t.dataset.stage.split(":"); P2.siteStage(id, +d); render(); return; }
  if (t.dataset.taskDone) { P2.taskSetPct(t.dataset.taskDone, 100); render(); toast("工程を完了にしました。"); return; }
  if (t.id === "fClear") { state.cf = { tab: state.cf.tab, status: "all", person: "all", contractor: "all", month: "all", q: "" }; render(); return; }
  if (t.id === "estAdd") { P2.estAddLine(null); render(); return; }
  if (t.dataset.estDel !== undefined) { P2.estDelLine(+t.dataset.estDel); render(); return; }
  if (t.id === "estReset") { P2.estReset(); render(); toast("最初の内容に戻しました。"); return; }
  if (t.id === "estPrint") { window.print(); return; }
  if (t.id === "estCsv") { const { name, text } = P2.estCsv(); const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); return; }
  if (t.id === "estRegister") { const r = P2.estRegister(); if (r.error) { const m = $("#estMsg"); m.className = "msg err"; m.textContent = r.error; } else { const m = $("#estMsg"); m.className = "msg ok"; m.textContent = `案件管理に登録しました（番号 ${r.id}・見積り中）。`; toast("案件に登録しました。"); } return; }
});
document.addEventListener("change", e => {
  const t = e.target;
  if (t.dataset.filter) { state.cf[t.dataset.filter] = t.value; render(); return; }
  if (t.dataset.caseStatus) { P2.caseSetStatus(t.dataset.caseStatus, t.value); render(); toast("状況を変えました。"); return; }
  if (t.dataset.caseGross !== undefined) { const err = P2.caseSetGross(t.dataset.caseGross, t.value); if (err) { toast(err, "err"); t.setAttribute("aria-invalid", "true"); return; } render(); return; }
  if (t.id === "siteSel") { state.site.sel = t.value; render(); return; }
  if (t.dataset.taskPct) { const err = P2.taskSetPct(t.dataset.taskPct, t.value); if (err) { toast(err, "err"); return; } render(); return; }
  if (t.id === "estTpl") { if (t.value !== "") { P2.estAddLine(state.data.estimateTemplates[+t.value]); render(); } return; }
});
document.addEventListener("submit", e => {
  if (e.target.id !== "caseForm") return;
  e.preventDefault();
  const f = e.target, fd = Object.fromEntries(new FormData(f).entries()), r = P2.caseAdd(fd), msg = $("#caseMsg");
  f.querySelectorAll("[aria-invalid]").forEach(i => i.removeAttribute("aria-invalid"));
  if (r.error) { msg.className = "msg err"; msg.textContent = r.error; f.elements[r.field]?.setAttribute("aria-invalid", "true"); return; }
  render(); toast(`案件を追加しました（番号 ${r.id}）。`);
});

/* ---------- 現場進捗：アラート・職人の依頼・日報と写真・着工前チェック ---------- */
document.addEventListener("click", e => {
  const t = e.target.closest("button, a"); if (!t) return;
  if (t.dataset.casesTab) { e.preventDefault(); state.cf.tab = t.dataset.casesTab; render(); return; }
  if (t.dataset.caseAdd !== undefined) { state.cf.tab = "cases"; render(); const d = document.querySelector("#caseDetails"); if (d) { d.open = true; d.scrollIntoView({ block: "center" }); document.querySelector("#n_name")?.focus(); } return; }
  if (t.dataset.goTalk !== undefined) { state.cf.tab = "talks"; render(); document.querySelector("#talkFormBox")?.scrollIntoView({ block: "start" }); document.querySelector("#talk_text")?.focus(); return; }
  if (t.dataset.talkImport) { TL.talkImport(t.dataset.talkImport); render(); document.querySelector("#talkFormBox")?.scrollIntoView({ block: "start" }); toast("録音の文字起こしを取り込みました。内容を確認して「商談を記録する」を押してください。"); return; }
  if (t.dataset.talkAnalyze !== undefined) { const f = document.querySelector("#talkForm"); TL.talkAnalyze(Object.fromEntries(new FormData(f).entries())); render(); document.querySelector("#talkFormBox")?.scrollIntoView({ block: "start" }); toast("内容を整理しました（規則による。直してから使ってください）。"); return; }
  if (t.dataset.talkSample !== undefined) { const fd = Object.fromEntries(new FormData(document.querySelector("#talkForm")).entries()), r = TL.talkEstimate(fd.text, fd); if (r.error) { toast(r.error, "err"); return; } location.hash = "#/estimate"; toast(`見積の叩き台を作りました（${r.n}項目）。内容を直してください。`); return; }
  if (t.dataset.talkEstimate) { const m = getMeetings().find(x => x.id === t.dataset.talkEstimate), r = TL.talkEstimate(m.text, { withWho: m.withWho, attendees: m.attendees }); if (r.error) { toast(r.error, "err"); return; } location.hash = "#/estimate"; toast(`見積の叩き台を作りました（${r.n}項目）。内容を直してください。`); return; }
  if (t.dataset.talkTocase) { const r = TL.talkToCase(t.dataset.talkTocase); if (r.error) { toast(r.error, "err"); return; } render(); toast("案件にしました（案件管理に入りました）。"); return; }
  if (t.dataset.talkDecline) { const id = t.dataset.talkDecline, reason = document.querySelector(`[data-decline-reason="${id}"]`)?.value; TL.talkDecline(id, reason); render(); toast("「案件にならず」にしました。理由は失注・見送りの集計に入ります。"); return; }
  if (t.dataset.voice !== undefined) { startVoice(t); return; }
  if (t.dataset.dockToggle !== undefined) { state.dock.open = !state.dock.open; render(); return; }
  if (t.dataset.taskTab) { e.preventDefault(); state.tv.tab = t.dataset.taskTab; render(); return; }
  if (t.dataset.addMode !== undefined) { const [key, mode] = t.dataset.addMode.split(":"); TK.setAddMode(key, mode); render(); document.querySelector(`#dockPanel .add-panel input[name=title], main .add-panel input[name=title]`)?.focus(); return; }
  if (t.dataset.subRow) { const box = t.closest("form")?.querySelector("[data-subinputs]"); if (box && box.children.length < 12) { const i = document.createElement("input"); i.className = "cell-in wide"; i.type = "text"; i.name = "sub"; i.maxLength = 80; i.style.minWidth = "0"; i.setAttribute("aria-label", `小項目 ${box.children.length + 1}`); box.appendChild(i); i.focus(); } return; }
  if (t.dataset.orderDel) { S3.orderRemove(t.dataset.orderDel); render(); toast("発注するものから消しました。"); return; }
  if (t.dataset.subAdd) { const id = t.dataset.subAdd, inp = document.querySelector(`[data-sub-text="${id}"]`), err = TK.taskSubAdd(id, inp?.value); if (err) { toast(err, "err"); return; } render(); toast("小項目を足しました。"); document.querySelector(`[data-sub-text="${id}"]`)?.focus(); return; }
  if (t.dataset.subDel) { const [id, i] = t.dataset.subDel.split(":"); TK.taskSubDel(id, Number(i)); render(); toast("小項目を消しました。"); return; }
  if (t.dataset.taskAck) { TK.taskAck(t.dataset.taskAck); render(); toast("受け取りました。進み具合は、自分で更新してください。"); return; }
  if (t.dataset.taskReport) { const id = t.dataset.taskReport, note = document.querySelector(`[data-task-note="${id}"]`)?.value || ""; TK.taskReport(id, note); render(); toast("報告しました。依頼した人に届きます。"); return; }
  if (t.dataset.taskConfirm) { TK.taskConfirm(t.dataset.taskConfirm); render(); toast("完了にしました（一覧から消えました）。"); return; }
  if (t.dataset.taskSelfdone) { TK.taskSelfDone(t.dataset.taskSelfdone); render(); toast("完了にしました。"); return; }
  if (t.dataset.taskReject) { const id = t.dataset.taskReject, note = document.querySelector(`[data-task-rejnote="${id}"]`)?.value || ""; TK.taskReject(id, note); render(); toast("差し戻しました。"); return; }
  if (t.dataset.taskNudge) { TK.taskNudge(t.dataset.taskNudge); render(); toast("催促を送りました（相手のタスクに「催促あり」が出ます）。"); return; }
  if (t.dataset.pickCase) { state.site.pick = state.site.pick === t.dataset.pickCase ? null : t.dataset.pickCase; render(); if (state.site.pick) setTimeout(() => document.querySelector("#quickPanel")?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest" }), 50); return; }
  if (t.dataset.caseOpen) { state.detail.openId = state.detail.openId === t.dataset.caseOpen ? null : t.dataset.caseOpen; state.detail.draft = null; render(); if (state.detail.openId) setTimeout(() => document.querySelector("#caseDetail")?.scrollIntoView({ block: "nearest" }), 50); return; }
  if (t.dataset.meetingDraft) { const f = document.querySelector("#meetingForm"), res = C.extractMeeting(f.elements.text.value, state.data.estimateTemplates); state.detail.draft = { caseId: t.dataset.meetingDraft, res }; document.querySelector("#draftBox").innerHTML = CD.draftHtml(res, t.dataset.meetingDraft); if (f.elements.result.value === "検討中" && res.resultGuess !== "検討中") f.elements.result.value = res.resultGuess; return; }
  if (t.dataset.draftEstimate) { CD.draftToEstimate(t.dataset.draftEstimate); location.hash = "#/estimate"; toast("叩き台から見積を作りました。内容を直してください。"); return; }
  if (t.dataset.ppTab) { e.preventDefault(); state.pp.tab = t.dataset.ppTab; render(); return; }
  if (t.dataset.ppSort) { PP.ppSort(t.dataset.ppSort); render(); return; }
  if (t.dataset.ppPick) { PP.ppPick(t.dataset.ppPick); render(); return; }
  if (t.dataset.memoTab) { e.preventDefault(); state.mv.tab = t.dataset.memoTab; render(); return; }
  if (t.dataset.memoDone) { MM.memoSetDone(t.dataset.memoDone, true); render(); toast("処理済みにしました。"); return; }
  if (t.dataset.memoUndo) { MM.memoSetDone(t.dataset.memoUndo, false); render(); toast("未処理に戻しました。"); return; }
  if (t.dataset.fmSort) { MN.setFmSort(t.dataset.fmSort); render(); return; }
  if (t.dataset.ack) { S3.ackAlert(t.dataset.ack); render(); toast("確認済みにしました（今日は、この通知を隠します）。"); return; }
  if (t.dataset.approve) { S3.reportApprove(t.dataset.approve); render(); toast("追加・変更工事を承認済みにしました。"); return; }
  if (t.dataset.respond) {
    const [id, kind] = t.dataset.respond.split(":"), memo = document.querySelector(`[data-consult-memo="${id}"]`)?.value || "";
    S3.dispatchRespond(id, kind, kind === "相談" ? memo.trim() : ""); render();
    toast(kind === "了承" ? "確認しました。工程表に反映されました。" : "「代表に相談」を送りました。担当者に連絡が届きます。"); return;
  }
});
document.addEventListener("change", e => {
  const t = e.target;
  if (t.dataset.check) { const [id, k] = t.dataset.check.split(":"); S3.checkSet(id, k, t.checked); render(); return; }
  if (t.dataset.caseField) { const [id, key] = t.dataset.caseField.split(":"), err = CD.caseFieldSet(id, key, t.value); if (err) { toast(err, "err"); t.setAttribute("aria-invalid", "true"); return; } render(); toast("案件の項目を直しました。"); return; }
  if (t.dataset.orderCheck) { S3.orderToggle(t.dataset.orderCheck, t.checked); render(); toast(t.checked ? "発注済みにしました（アラートが消えます）。" : "未発注に戻しました。"); return; }
  if (t.dataset.subCheck) { const [id, i] = t.dataset.subCheck.split(":"); TK.taskSubToggle(id, Number(i)); render(); return; }
  if (t.dataset.taskMemo) { TK.taskMemoSet(t.dataset.taskMemo, t.value); toast("メモを保存しました。"); return; }
  if (t.dataset.taskProg) { TK.taskSetProgress(t.dataset.taskProg, t.value); render(); return; }
  if (t.id === "meSel" || t.id === "meSel2") { TK.setMe(t.value); render(); toast(`${t.value} さんの画面に切り替えました。`); return; }
  if (t.id === "mtMonth") { state.mt.month = t.value; render(); return; }
  if (t.id === "gStatus") { state.site.gf.status = t.value; render(); return; }
  if (t.id === "gPerson") { state.site.gf.person = t.value; render(); return; }
  if (t.id === "gRange") { state.site.gr = t.value; render(); return; }
  if (t.id === "mvCase") { state.mv.caseId = t.value; render(); return; }
  if (t.id === "mvKind") { state.mv.kind = t.value; render(); return; }
  if (t.id === "fmMonth") { MN.setFmMonth(t.value); render(); return; }
  if (t.id === "craftSel") { state.detail.craftsman = t.value; if (location.hash.includes("?")) history.replaceState(null, "", "#/craftsman"); render(); return; }
});
document.addEventListener("submit", async e => {
  const f = e.target;
  if (f.id === "dispatchForm") {
    e.preventDefault(); const err = S3.dispatchCreate(Object.fromEntries(new FormData(f).entries())), m = document.querySelector("#dispMsg");
    if (err) { m.className = "msg err"; m.textContent = err; return; }
    render(); toast("職人に依頼しました。職人が確認すると、工程表に反映されます。"); return;
  }
  if (f.id === "orderForm") {
    e.preventDefault(); const err = S3.orderCreate(Object.fromEntries(new FormData(f).entries())), m = document.querySelector("#ordMsg");
    if (err) { m.className = "msg err"; m.textContent = err; return; }
    render(); toast("発注するものに足しました。発注の期限が、工程表に出ます。"); return;
  }
  if (f.dataset.taskform !== undefined) {
    e.preventDefault(); const m = f.querySelector("[data-taskmsg]"), raw = new FormData(f), r = TK.taskCreate({ ...Object.fromEntries(raw.entries()), subs: raw.getAll("sub"), mode: f.dataset.mode });
    if (r.error) { m.className = "msg err"; m.textContent = r.error; return; }
    render(); toast(r.self ? "自分のタスクに追加しました。" : `${r.to} に頼みました。相手のページに「${state.me}からタスクが来ています」と出ます。`); return;
  }
  if (f.id === "talkForm") {
    e.preventDefault(); const m = document.querySelector("#talkMsg"), fd = Object.fromEntries(new FormData(f).entries()), audio = f.elements.audio?.files?.[0]?.name || "";
    if (!state.mt.structured) TL.talkAnalyze(fd);
    const r = TL.talkSave({ ...state.mt.form, ...fd, contractType: fd.contractType, outcome: fd.outcome }, audio); if (r.error) { m.className = "msg err"; m.textContent = r.error; return; }
    render(); toast("商談を記録しました。" + (r.note || "")); return;
  }
  if (f.id === "meetingForm") {
    e.preventDefault(); const m = document.querySelector("#mtMsg"), fd = Object.fromEntries(new FormData(f).entries()), audio = f.elements.audio?.files?.[0]?.name || "";
    const r = CD.meetingAdd(fd, audio); if (r.error) { m.className = "msg err"; m.textContent = r.error; return; }
    state.detail.draft = null; render(); toast(r.note ? "商談を記録しました。" + r.note : "商談を記録しました。"); return;
  }
  if (f.id === "memoForm") {
    e.preventDefault(); const m = document.querySelector("#memoMsg"), fd = Object.fromEntries(new FormData(f).entries()), files = [...(f.elements.photos?.files || [])], ids = [], bad = [];
    for (const file of files) { try { ids.push(await savePhoto(file)); } catch (er) { bad.push(`${file.name}：${er.message}`); } }
    const r = MM.memoAdd(fd, ids);
    if (r.error) { m.className = "msg err"; m.textContent = r.error; return; }
    render(); toast(bad.length ? `メモを残しました。写真の一部は保存できませんでした（${bad.join("、")}）。` : "メモを残しました。", bad.length ? "err" : "ok"); return;
  }
  if (f.id === "reportForm") {
    e.preventDefault(); const m = document.querySelector("#repMsg"), fd = Object.fromEntries(new FormData(f).entries()), files = [...(f.elements.photos?.files || [])];
    const ids = [], bad = [];
    for (const file of files) { try { ids.push(await savePhoto(file)); } catch (er) { bad.push(`${file.name}：${er.message}`); } }
    const r = S3.reportAdd(fd, ids);
    if (r.error) { m.className = "msg err"; m.textContent = r.error; return; }
    state.site.sel = fd.caseId; render(); toast(bad.length ? `日報を上げました。写真の一部は保存できませんでした（${bad.join("、")}）。` : "日報を上げました。", bad.length ? "err" : "ok"); return;
  }
});

/* ---------- 音声入力（ブラウザの音声認識。同意が要る） ---------- */
let rec = null;
function startVoice(btn) {
  const ta = document.querySelector("#talk_text"), ok = document.querySelector("#voiceConsent")?.checked, label = "🎙 音声で入力する";
  if (rec) { rec.stop(); return; }
  if (!ok) { toast("音声入力を使うには、同意のチェックを入れてください。", "err"); return; }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { toast("このブラウザは音声入力に対応していません。録音の文字起こしを貼り付けるか、クラウド録音の取り込みを使ってください。", "err"); return; }
  rec = new SR(); rec.lang = "ja-JP"; rec.continuous = true; rec.interimResults = false;
  rec.onresult = ev => { for (let i = ev.resultIndex; i < ev.results.length; i++) if (ev.results[i].isFinal) ta.value += ev.results[i][0].transcript + "。\n"; };
  rec.onerror = ev => { toast(`音声入力でエラーが出ました（${ev.error}）。マイクの許可を確かめてください。`, "err"); };
  rec.onend = () => { rec = null; btn.textContent = label; };
  try { rec.start(); btn.textContent = "■ 止める（録音中）"; } catch (er) { rec = null; toast("音声入力を始められませんでした。", "err"); }
}

addEventListener("hashchange", () => { render(false); $("#main").focus({ preventScroll: true }); });
let rt; addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { drawDots(); render(); }, 150); });

applyTheme(); buildRail(); drawDots();
if (!location.hash) history.replaceState(null, "", "#/pl");
load().then(ok => ok && render(false));
