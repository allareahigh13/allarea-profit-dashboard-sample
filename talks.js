/* 商談記録：いつ・どこで・誰と・何を話して、案件になったか。案件にならなかった商談も残す。商談から案件化・失注までの数字、音声（クラウド録音）の受信箱、見積の叩き台。 */
import * as C from "./calc.js";
import { state, getCases, getMeetings, getInbox, saveEdits, saveMore, store } from "./state.js";
import { esc, kpi, bar } from "./ui.js";
import { pill, opt, yen, pct, th, caseAdd, defaultEstimate, estSave } from "./pages2.js";

const MONTHS = ["12月", "1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月"];
const md = d => { const [, m, dd] = d.split("-").map(Number); return `${m}/${dd}`; };
const OUT_CLS = { "案件化": "up", "案件化せず": "down", "検討中": "flat" };
const REASONS = ["予算が合わない", "他社に決定", "時期が合わない", "要望が合わない", "連絡が取れない", "その他"];
const staff = () => state.data.staff.filter(n => n !== "代表");

/* ---------- 案件管理の一番上：案件を追加する・商談を記録する ---------- */
export function topBarHtml() {
  const t = state.cf.tab || "cases";
  return `<section class="card case-top"><div class="case-actions"><button type="button" class="btn big-btn" data-case-add>＋ 案件を追加する（手入力）</button><button type="button" class="btn big-btn" data-go-talk>🎙 商談を記録する（音声・手入力）</button><span class="sub2">商談を記録すると、案件になったものは自動で案件に反映されます。案件にならなかった商談も残ります。</span></div>
    <nav class="page-tabs" aria-label="案件管理の表示"><a href="#/cases" data-cases-tab="cases" ${t === "cases" ? 'aria-current="page"' : ""}>案件の一覧</a><a href="#/cases" data-cases-tab="talks" ${t === "talks" ? 'aria-current="page"' : ""}>商談記録（${getMeetings().length}）</a></nav></section>`;
}

/* ---------- 商談記録のタブ ---------- */
export function renderTalks() {
  const asOf = state.data.asOf, cases = getCases(), ms = getMeetings(), cur = C.monthLabelOf(asOf), mo = state.mt.month === "all" ? null : state.mt.month, f = C.salesFunnel(ms, cases, mo), fa = C.salesFunnel(ms, cases);
  const label = mo ? `${mo}の` : "全期間の";
  const kpis = [
    kpi({ tone: "sky", icon: "act", label: `${label}商談の件数`, value: String(f.total), unit: "件", sub: `案件化 ${f.converted}・案件化せず ${f.declined}・検討中 ${f.pending}` }),
    kpi({ tone: "teal", icon: "check", label: "案件になった率", value: pct(f.convertRate).replace("%", ""), unit: "%", sub: `商談 ${f.total}件のうち、案件になったのは ${f.converted}件` }),
    kpi({ tone: "gold", icon: "target", label: "受注した率（案件のうち）", value: pct(f.wonRate).replace("%", ""), unit: "%", sub: `案件 ${f.cases}件：受注 ${f.won}・見積り中 ${f.open}・失注 ${f.lost}` }),
    kpi({ tone: f.lost ? "amber" : "teal", icon: "cost", label: "失注（案件になってから）", value: String(f.lost), unit: "件", sub: `失注率 ${pct(f.lostRate)}・金額 ${yen(f.lostAmount)}円` }),
  ].join("");
  const mx = Math.max(1, f.total), step = (label, n, cls, sub) => `<div class="fn" style="grid-template-columns:140px 1fr 150px"><span>${label}</span><div class="bar-h ${cls}"><i style="width:${n / mx * 100}%"></i></div><div class="c">${n}件<small>${sub}</small></div></div>`;
  const funnel = `<div class="funnel">${step("商談", f.total, "sky", "すべての商談")}${step("案件になった", f.converted, "teal", `商談の ${pct(f.convertRate)}`)}${step("　受注（進行中・請求まで）", f.won, "teal", `案件の ${pct(f.wonRate)}`)}${step("　見積り中（返事待ち）", f.open, "amber", `案件の ${pct(C.ratio(f.open, f.cases))}`)}${step("　失注", f.lost, "pink", `案件の ${pct(f.lostRate)}・${yen(f.lostAmount)}円`)}${step("案件にならなかった", f.declined, "pink", `商談の ${pct(C.ratio(f.declined, f.total))}`)}${step("検討中（まだ決まらない）", f.pending, "gold", `商談の ${pct(C.ratio(f.pending, f.total))}`)}</div>`;
  const fm = C.funnelByMonth(ms, cases, MONTHS), mtr = fm.map(r => `<tr class="${mo === r.month ? "sel" : ""}"><td>${r.month}</td><td>${r.total}</td><td>${r.converted}（${pct(r.convertRate)}）</td><td>${r.declined}</td><td>${r.pending}</td><td>${r.won}</td><td class="${r.lost ? "down" : ""}">${r.lost}</td><td>${pct(r.lostRate)}</td></tr>`).join("");
  const lr = C.lossReasons(ms, cases), lrMax = Math.max(1, ...lr.map(x => x.count));
  const reasons = lr.length ? lr.map(x => `<div class="row-item" style="grid-template-columns:150px 1fr 40px"><span class="nm">${esc(x.reason)}</span>${bar(x.count / lrMax * 100, "pink")}<span class="vl">${x.count}件</span></div>`).join("") : '<div class="empty">失注・見送りの記録はありません。</div>';
  return `<section class="kpis k5" aria-label="商談の主な数字">${kpis}</section>
    <section class="card panel"><div class="ctl-row"><h2 class="ttl">商談から受注・失注まで</h2><div class="ctl"><label for="mtMonth">商談の月</label><select class="sel" id="mtMonth"><option value="all">全期間</option>${fm.map(r => `<option value="${r.month}"${state.mt.month === r.month ? " selected" : ""}>${r.month}</option>`).join("")}</select></div></div>${funnel}
      <p class="note">全期間では、商談 ${fa.total}件 → 案件になった ${fa.converted}件（${pct(fa.convertRate)}）→ 失注 ${fa.lost}件（案件の ${pct(fa.lostRate)}）。案件にならなかった商談は、「案件にならなかった」に数えます。</p></section>
    <section class="grid2"><section class="card panel"><h2 class="ttl">月ごとの商談と失注</h2><div class="tablewrap"><table class="tbl"><thead><tr>${["商談の月", "商談", "案件になった（率）", "案件化せず", "検討中", "受注", "失注", "失注率"].map(th).join("")}</tr></thead><tbody>${mtr}</tbody></table></div></section>
      <section class="card panel"><h2 class="ttl">失注・見送りの理由</h2>${reasons}<p class="note">案件になってから失注したものと、案件にならなかった商談の理由を合わせています。</p></section></section>
    ${cloudHtml()}${formHtml()}${listHtml(ms, cases)}`;
}

/* ---------- クラウド連携（音声データ）・受信箱 ---------- */
function cloudHtml() {
  const inbox = getInbox();
  const items = inbox.map(v => `<div class="inbox-item ${v.imported ? "done" : ""}"><div><b>${esc(v.file)}</b><br><small>${esc(v.recordedAt)}・${v.minutes}分・${esc(v.source)}</small></div><div>${v.imported ? '<span class="chip-ok">取り込み済み</span>' : `<button type="button" class="btn small ok" data-talk-import="${esc(v.id)}">取り込む（記録・案件・見積の叩き台）</button>`}</div></div>`).join("");
  return `<section class="card panel" id="cloudBox"><div class="ctl-row"><h2 class="ttl">音声データ（クラウド録音）の取り込み</h2><span class="chip-wait">クラウド連携：未接続（見本）</span></div>
    <p class="sub2">商談が終わると、クラウドの録音サービスから文字起こしが届き、<b>商談記録・案件・見積の叩き台</b>まで自動で作られる形にします。いまは、届いた録音の「受信箱」を、サンプルで再現しています。</p>
    <div class="inbox">${items || '<div class="empty">届いている録音はありません。</div>'}</div>
    <details class="dock-add"><summary>つないだあとの流れと、決めること</summary><ol class="memo"><li>商談の録音が、クラウドの録音サービスに上がる（担当者のスマホやレコーダーから）。</li><li>文字起こしが届くと、この受信箱に入る。担当者名・相手・元請けか直接か・物件名・場所・予算・要望が、自動で整理される。</li><li>案件になる商談は、案件管理に「見積り中」で入り、見積の叩き台が付く。担当者が内容を直して使う。</li></ol>
      <p class="note"><b>つなぐ前に、決めること</b>：①使う録音サービスと契約（費用がかかります）、②お客様に録音の同意をいただく運用、③音声と文字起こしの保存場所と、見られる人の範囲、④録音を外部サービスに送ってよいかの会社の判断。つなぐ作業は、この4つが決まってからです。</p></details></section>`;
}

/* ---------- 商談の入力フォーム ---------- */
function formHtml() {
  const asOf = state.data.asOf, f = state.mt.form || {}, st = state.mt.structured, cases = getCases(), people = staff();
  const v = (k, d = "") => esc(f[k] ?? d);
  const info = st ? `<div class="stage-note"><b>自動で整理した内容</b>：担当 ${esc(st.participants.join("、") || "—")}さん／相手 ${esc(st.counterpart || "—")}／発注の形 <span class="tag ${st.contractType === "元請け経由" ? "up" : "flat"}">${esc(st.contractType)}${st.contractor ? "（" + esc(st.contractor) + "）" : ""}</span>／物件 ${esc(st.property || "—")}／場所 ${esc(st.place || "—")}／予算 ${st.budget != null ? yen(st.budget) + "円" : "—"}／結果の見込み ${esc(st.resultGuess)}　<span class="tag flat">規則で整理（AIではありません）</span></div>` : "";
  return `<section class="card panel" id="talkFormBox"><h2 class="ttl">商談を記録する</h2>${info}<form id="talkForm" novalidate>
    <div class="form-grid"><div class="field"><label for="tk_date">いつ（日付）</label><input id="tk_date" name="date" type="date" value="${v("date", asOf)}"></div>
      <div class="field"><label for="tk_time">時間</label><input id="tk_time" name="time" type="time" value="${v("time")}"></div>
      <div class="field"><label for="tk_place">どこで</label><input id="tk_place" name="place" list="dl_place" class="cell-in wide" style="min-width:0" value="${v("place")}"><datalist id="dl_place"><option value="お客様宅"><option value="現地"><option value="事務所"><option value="オンライン"></datalist></div>
      <div class="field"><label for="tk_with">誰と（相手）</label><input id="tk_with" name="withWho" class="cell-in wide" style="min-width:0" value="${v("withWho")}" placeholder="例：田中様／元請けBの担当者"></div>
      <div class="field"><label for="tk_att">自社の担当（○○さん）</label><select id="tk_att" name="attendees" class="sel">${people.map(p => opt(p, f.attendees || people[0])).join("")}</select></div>
      <div class="field"><label for="tk_type">発注の形</label><select id="tk_type" name="contractType" class="sel">${["直接", "元請け経由"].map(t => opt(t, f.contractType || "直接", t === "直接" ? "自社の発注（お客様から直接）" : "元請け経由")).join("")}</select></div>
      <div class="field"><label for="tk_con">元請け・発注元の名前</label><input id="tk_con" name="contractor" class="cell-in wide" style="min-width:0" value="${v("contractor")}" placeholder="直接なら、空欄でOK"></div>
      <div class="field"><label for="tk_prop">物件名（案件になるとき）</label><input id="tk_prop" name="property" class="cell-in wide" style="min-width:0" value="${v("property")}"></div>
      <div class="field" style="grid-column:1/-1"><label for="talk_text">何を話したか（音声入力・文字起こしの貼り付け・手入力）</label><textarea id="talk_text" name="text" rows="6" maxlength="4000" class="cell-in wide" style="min-width:0">${esc(f.text || "")}</textarea></div></div>
    <div class="voice-box"><label class="chk"><input type="checkbox" id="voiceConsent"> 音声入力を使うことに同意します（録音した音声は、お使いのブラウザの音声認識サービス（ブラウザを提供する会社のクラウド）に送られます。お客様の同意を得てから使ってください）</label>
      <div class="tools"><button type="button" class="btn" data-voice>🎙 音声で入力する</button><label class="btn" style="cursor:pointer">録音ファイルを選ぶ（名前だけ記録）<input type="file" name="audio" accept="audio/*" style="display:none"></label></div></div>
    <div class="form-grid" style="margin-top:10px"><div class="field"><label for="tk_out">商談の結果（案件になったか）</label><select id="tk_out" name="outcome" class="sel">${C.OUTCOMES.map(o => opt(o, f.outcome || "検討中")).join("")}</select></div>
      <div class="field"><label for="tk_amount">見込みの金額（円・案件化するとき）</label><input id="tk_amount" name="amount" type="number" min="0" step="10000" class="cell-in wide" style="min-width:0" value="${v("amount")}"></div>
      <div class="field"><label for="tk_reason">案件にならなかった理由</label><select id="tk_reason" name="lossReason" class="sel"><option value="">（なし）</option>${REASONS.map(r => opt(r, f.lossReason)).join("")}</select></div></div>
    <div class="tools" style="margin-top:10px"><button type="button" class="btn" data-talk-analyze>内容を整理する（担当・相手・元請け・予算・要望）</button><button type="button" class="btn" data-talk-sample>サンプルの見積もりを作る</button><button class="btn ok" type="submit">商談を記録する</button></div><p class="msg" id="talkMsg" role="status"></p></form>
    <p class="note">「案件になった」を選ぶと、案件管理に案件が自動で入ります（担当・元請け・発注の形・物件・予算・現地調査の日が反映されます）。「サンプルの見積もりを作る」は、話した内容から、よく使う項目で見積の叩き台を作ります（担当者が直してから使います）。</p></section>`;
}

/* ---------- 商談の一覧 ---------- */
function listHtml(ms, cases) {
  const rows = [...ms].sort((a, b) => b.date.localeCompare(a.date) || (b.time || "").localeCompare(a.time || "") || b.id.localeCompare(a.id)).map(m => {
    const c = m.caseId ? cases.find(x => x.id === m.caseId) : null, st = C.structureMeeting(m.text, state.data.estimateTemplates, state.data.staff);
    const vsType = c ? (c.contractType === "元請け経由" ? `元請け経由（${esc(c.contractor)}）` : "自社の発注（直接）") : (st.contractType === "元請け経由" ? `元請け経由（${esc(st.contractor)}）` : "直接");
    return `<tr><td>${md(m.date)}${m.time ? `<br><small>${esc(m.time)}</small>` : ""}</td><td class="txt">${esc(m.place || st.place || "—")}</td><td class="txt">${esc(m.withWho || st.counterpart || "—")}</td><td>${esc(m.attendees || st.participants.join("、") || "—")}さん</td><td class="txt">${vsType}</td>
      <td class="txt note-cell">${esc(m.text.slice(0, 60))}${m.text.length > 60 ? "…" : ""}<br><small>${esc(m.source || "")}</small></td><td><span class="tag ${OUT_CLS[m.outcome]}">${esc(m.outcome)}</span>${m.lossReason ? `<br><small>${esc(m.lossReason)}</small>` : ""}</td>
      <td class="txt">${c ? `${esc(c.name)} ${pill(c.status)}` : "—"}</td><td class="txt"><button type="button" class="btn small" data-talk-estimate="${esc(m.id)}">サンプルの見積もり</button>${!m.caseId && m.outcome !== "案件化" ? ` <button type="button" class="btn small ok" data-talk-tocase="${esc(m.id)}">案件にする</button>` : ""}${!m.caseId && m.outcome === "検討中" ? ` <select class="cell-sel" data-decline-reason="${esc(m.id)}" aria-label="案件にならなかった理由">${REASONS.map(r => `<option>${r}</option>`).join("")}</select><button type="button" class="btn small bad" data-talk-decline="${esc(m.id)}">案件にならず</button>` : ""}</td></tr>`;
  }).join("");
  return `<section class="card panel"><h2 class="ttl">商談の記録（${ms.length}件）</h2><div class="tablewrap"><table class="tbl money"><thead><tr>${["いつ", "どこで", "誰と", "自社の担当", "発注の形", "何を話したか", "結果", "案件", ""].map(th).join("")}</tr></thead><tbody>${rows}</tbody></table></div>
    <p class="note">案件にならなかった商談も、ここに残ります。「検討中」の商談は、「案件にする」または「案件にならず」で、結果を決められます。</p></section>`;
}

/* ---------- 操作 ---------- */
const formVals = f => Object.fromEntries(new FormData(f).entries());
export function talkAnalyze(fd) {
  const st = C.structureMeeting(fd.text || "", state.data.estimateTemplates, state.data.staff);
  state.mt.structured = st;
  state.mt.form = { ...fd, place: fd.place || st.place, withWho: fd.withWho || st.counterpart, attendees: st.participants[0] && staff().includes(st.participants[0]) ? st.participants[0] : fd.attendees, contractType: st.contractType, contractor: fd.contractor || st.contractor, property: fd.property || st.property, amount: fd.amount || (st.budget ?? ""), outcome: fd.outcome === "検討中" || !fd.outcome ? (st.resultGuess === "合意" ? "案件化" : st.resultGuess === "不成立" ? "案件化せず" : "検討中") : fd.outcome };
  delete state.mt.form.audio; return st;
}
export function talkImport(id) {
  const v = getInbox().find(x => x.id === id); if (!v) return;
  const st = C.structureMeeting(v.transcript, state.data.estimateTemplates, state.data.staff), [d, t] = v.recordedAt.split(" ");
  state.mt.structured = st; state.mt.importId = id;
  state.mt.form = { date: d, time: t, place: st.place, withWho: st.counterpart, attendees: st.participants.find(p => staff().includes(p)) || staff()[0], contractType: st.contractType, contractor: st.contractor, property: st.property, text: v.transcript, amount: st.budget ?? "",
    outcome: st.resultGuess === "合意" ? "案件化" : st.resultGuess === "不成立" ? "案件化せず" : "案件化", lossReason: st.resultGuess === "不成立" ? "他社に決定" : "" };   // 見積を出す段階の商談は、案件にする
}
function makeCase(fd, st, meetingId) {
  const month = C.monthLabelOf(fd.date) || "12月", name = String(fd.property || "").trim() || (String(fd.withWho || "").trim() ? `${String(fd.withWho).replace(/(様|さん)$/, "")}様邸` : "");
  if (!name) return { error: "案件にするには、物件名を入れてください。" };
  const r = caseAdd({ name, person: fd.attendees, contractor: fd.contractType === "元請け経由" ? (fd.contractor || "元請け") : "自社", amount: Number(fd.amount) >= 0 && fd.amount !== "" ? Number(fd.amount) : 0, month, status: st === "合意" ? "受注" : "見積り中", note: `商談 ${fd.date}（${meetingId}）より` });
  if (r.error) return r;
  state.fieldEdits[r.id] = { ...(state.fieldEdits[r.id] || {}), source: "商談", request: (state.mt.structured?.requests || [])[0] || "", budget: state.mt.structured?.budget ?? null, visitDate: fd.date, contractType: fd.contractType, contractDoc: "未", stage: undefined };
  delete state.fieldEdits[r.id].stage; state.edits.stage[r.id] = st === "合意" ? 2 : 1; saveEdits(); saveMore(); return r;
}
export function talkSave(fd, audioName) {
  if (!fd.date) return { error: "商談の日（いつ）を入れてください。" };
  if (!String(fd.text || "").trim()) return { error: "何を話したか（内容）を入れてください。" };
  const ids = getMeetings().map(m => m.id); let n = state.meetingsAdded.length + 1, id = "MN" + String(n).padStart(3, "0");
  while (ids.includes(id)) id = "MN" + String(++n).padStart(3, "0");
  const resultMap = { "案件化": "合意", "案件化せず": "不成立", "検討中": "検討中" }, guess = state.mt.structured?.resultGuess;
  let caseId = null, note = "";
  if (fd.outcome === "案件化") { const r = makeCase(fd, guess === "合意" ? "合意" : "", id); if (r.error) return r; caseId = r.id; note = `案件管理に「${getCases().find(c => c.id === caseId)?.name || ""}」を入れました（${guess === "合意" ? "受注" : "見積り中"}）。`; }
  state.meetingsAdded.push({ id, caseId, date: fd.date, time: fd.time || "", place: fd.place || "", withWho: fd.withWho || "", attendees: fd.attendees || "", text: String(fd.text).trim(), source: audioName ? `音声ファイル（${audioName}・未解析）` : (state.mt.importId ? "クラウド録音（取り込み）" : "手入力・貼り付け"), result: resultMap[fd.outcome], outcome: fd.outcome, lossReason: fd.outcome === "案件化せず" ? (fd.lossReason || "") : "" });
  if (state.mt.importId) state.inboxDone[state.mt.importId] = true;
  state.mt.form = null; state.mt.structured = null; state.mt.importId = null; saveMore(); return { ok: true, id, caseId, note };
}
export function talkToCase(id) {
  const m = getMeetings().find(x => x.id === id); if (!m) return { error: "商談が見つかりません。" };
  const st = C.structureMeeting(m.text, state.data.estimateTemplates, state.data.staff); state.mt.structured = st;
  const r = makeCase({ date: m.date, property: st.property, withWho: m.withWho || st.counterpart, attendees: m.attendees || staff()[0], contractType: st.contractType, contractor: st.contractor, amount: st.budget ?? 0 }, st.resultGuess === "合意" ? "合意" : "", m.id);
  if (r.error) return r; state.meetingEdits[m.id] = { ...(state.meetingEdits[m.id] || {}), caseId: r.id, outcome: "案件化" }; saveMore(); return { ok: true, id: r.id };
}
export function talkDecline(id, reason) { state.meetingEdits[id] = { ...(state.meetingEdits[id] || {}), outcome: "案件化せず", lossReason: reason || "その他" }; saveMore(); }
/** 見積の叩き台（サンプルの見積もり）。商談の内容から、よく使う項目で作る。 */
export function talkEstimate(text, meta = {}) {
  const st = C.structureMeeting(text, state.data.estimateTemplates, state.data.staff);
  const e = defaultEstimate(); e.customer = meta.withWho || st.counterpart || ""; e.property = meta.property || st.property || ""; e.person = meta.attendees || st.participants[0] || ""; e.lines = st.lines.map(l => ({ ...l }));
  const bits = []; if (st.budget != null) bits.push(`お客様の予算：約${Math.round(st.budget / 10000).toLocaleString("ja-JP")}万円（商談より）`); if ((meta.contractType || st.contractType) === "元請け経由") bits.push(`元請け経由${(meta.contractor || st.contractor) ? "（" + (meta.contractor || st.contractor) + "）" : ""}・発注書で受ける`);
  e.note = bits.join("／"); if (!e.lines.length) return { error: "話した内容から、見積の候補が見つかりませんでした。内容を足すか、見積のページで手入力してください。" };
  state.est = e; estSave(); return { ok: true, n: e.lines.length };
}
