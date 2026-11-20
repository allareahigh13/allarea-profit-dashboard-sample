/* 案件の詳細：受付・現地調査、商談記録（文字起こしから叩き台）、契約。工程の流れの 1〜2 にあたる部分。 */
import * as C from "./calc.js";
import { state, store, getCases, getMeetings, saveEdits, saveMore } from "./state.js";
import { esc } from "./ui.js";
import { pill, opt, yen, defaultEstimate, estSave } from "./pages2.js";

const RESULT_CLS = { "合意": "up", "不成立": "down", "検討中": "flat" };
const wf = () => state.data.workflow.stages;

export function caseDetailHtml() {
  const c = getCases().find(x => x.id === state.detail.openId);
  if (!c) return "";
  const meetings = getMeetings().filter(m => m.caseId === c.id).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)), asOf = state.data.asOf;
  const f = (label, key, html) => `<div class="field"><label for="cf_${key}">${label}</label>${html}</div>`;
  const inp = (key, type, extra = "") => `<input id="cf_${key}" class="cell-in wide" style="min-width:0" type="${type}" data-case-field="${esc(c.id)}:${key}" value="${esc(c[key] ?? "")}" ${extra}>`;
  const sel = (key, vals) => `<select id="cf_${key}" class="sel" data-case-field="${esc(c.id)}:${key}">${vals.map(v => opt(v, c[key])).join("")}</select>`;
  const doc = c.contractType === "元請け経由" ? "発注書" : "契約書", docVals = ["未", c.contractType === "元請け経由" ? "受領済" : "締結済"];
  const info = `<div class="form-grid">${f("問い合わせ元", "source", sel("source", ["", "紹介", "問い合わせ", "元請けから"]))}${f("現地調査の日", "visitDate", inp("visitDate", "date"))}${f("見積の提出日", "quotedOn", inp("quotedOn", "date"))}${f("お客様の予算（円）", "budget", inp("budget", "number", 'min="0" step="10000"'))}
    <div class="field" style="grid-column:span 2"><label for="cf_request">要望（現地調査・ヒアリングで聞いたこと）</label>${inp("request", "text", 'maxlength="120"')}</div>
    ${f("契約の形", "contractType", sel("contractType", ["直接", "元請け経由"]))}${f(`${doc}の状況`, "contractDoc", sel("contractDoc", docVals))}</div>
    <p class="note">お客様から直接の案件（BtoC）は<b>契約書</b>の締結、元請け経由の案件は<b>発注書</b>の受領で、合意の記録になります。未のままだと、アラートが出ます。</p>`;
  const mlist = meetings.map(m => `<article class="rep"><div class="rep-h"><b>${esc(m.date)}</b><span>${esc(m.attendees || "")}</span><span class="tag flat">${esc(m.source || "")}</span><span class="tag ${RESULT_CLS[m.result] || "flat"}">${esc(m.result)}</span></div><p>${esc(m.text)}</p></article>`).join("") || '<div class="empty">この案件の商談記録は、まだありません。</div>';
  const form = `<form id="meetingForm" novalidate><input type="hidden" name="caseId" value="${esc(c.id)}"><div class="form-grid">
    <div class="field"><label for="mt_date">商談の日</label><input id="mt_date" name="date" type="date" value="${asOf}"></div>
    <div class="field"><label for="mt_att">参加した人</label><input id="mt_att" name="attendees" type="text" maxlength="60" class="cell-in wide" style="min-width:0"></div>
    <div class="field"><label for="mt_src">記録のもと</label><select id="mt_src" name="source" class="sel"><option>手入力</option><option>文字起こしを貼り付け</option><option>音声（Plaud 等・この見本では未接続）</option></select></div>
    <div class="field"><label for="mt_audio">音声ファイル（名前だけ記録）</label><input id="mt_audio" name="audio" type="file" accept="audio/*"></div>
    <div class="field" style="grid-column:1/-1"><label for="mt_text">商談の内容（メモや、文字起こしを貼り付けてください）</label><textarea id="mt_text" name="text" rows="5" maxlength="4000" class="cell-in wide" style="min-width:0"></textarea></div>
    <div class="field"><label for="mt_res">商談の結果</label><select id="mt_res" name="result" class="sel"><option>検討中</option><option>合意</option><option>不成立</option></select></div></div>
    <div class="tools" style="margin-top:10px"><button type="button" class="btn" data-meeting-draft="${esc(c.id)}">内容から叩き台を作る</button><button class="btn" type="submit">商談を記録する</button></div><p class="msg" id="mtMsg" role="status"></p></form>
    <div id="draftBox"></div><p class="note">「叩き台を作る」は、AI ではなく、決まった言葉の規則（予算・要望・日程・見送りなど）で拾います。音声そのものの解析と、そこから見積を自動で作る機能は、まだつないでいません（将来、担当者が微調整できる形にします）。</p>`;
  return `<section class="card panel" id="caseDetail"><div class="ctl-row"><h2 class="ttl">${esc(c.name)} ${pill(c.status)} の詳細（受付・商談・契約）</h2><div class="tools"><a class="btn small" href="#/sites" data-site-open="${esc(c.id)}">現場進捗へ</a><button type="button" class="btn small" data-case-open="${esc(c.id)}">閉じる</button></div></div>
    <p class="sub2">担当 ${esc(c.person)}・元請け ${esc(c.contractor)}・金額 ${yen(c.amount)}円・いまの工程：${esc(wf()[c.stage]?.name || "")}</p>
    <h3 class="h3">1. 受付・現地調査 ／ 契約</h3>${info}<h3 class="h3">2. 商談記録（${meetings.length}件）</h3>${form}<div class="feed" style="margin-top:12px">${mlist}</div></section>`;
}

export function draftHtml(res, caseId) {
  if (!res || (!res.requests.length && !res.lines.length && res.budget == null && !res.schedule.length && !res.decisions.length && !res.declines.length)) return `<div class="empty">叩き台にできる言葉が見つかりませんでした。内容を足してみてください。</div>`;
  const li = a => a.length ? `<ul class="plain">${a.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : "<p class='sub2'>見つかりませんでした。</p>";
  return `<div class="card panel draft"><h3 class="h3" style="margin-top:0">叩き台（担当者が直してから使います）</h3><div class="grid2"><div><b>要望</b>${li(res.requests)}<b>日程の話</b>${li(res.schedule)}</div><div><b>予算</b><p>${res.budget != null ? yen(res.budget) + "円" : "見つかりませんでした"}</p><b>決まったこと・見送りの言葉</b>${li([...res.decisions, ...res.declines])}<b>結果の見込み</b><p><span class="tag ${RESULT_CLS[res.resultGuess]}">${esc(res.resultGuess)}</span></p></div></div>
    <b>見積の候補（よく使う項目から）</b>${res.lines.length ? `<div class="tablewrap"><table class="tbl"><thead><tr><th>品名</th><th>数量</th><th>単位</th><th>単価（円）</th></tr></thead><tbody>${res.lines.map(l => `<tr><td class="txt">${esc(l.name)}</td><td>${l.qty}</td><td>${esc(l.unit)}</td><td>${yen(l.price)}</td></tr>`).join("")}</tbody></table></div><div class="tools" style="margin-top:8px"><button type="button" class="btn" data-draft-estimate="${esc(caseId)}">この叩き台で見積を作る</button></div>` : "<p class='sub2'>見積の候補は見つかりませんでした。</p>"}</div>`;
}

/* ---------- 操作 ---------- */
export function caseFieldSet(id, key, raw) {
  let v = String(raw).trim();
  if (key === "budget") { if (v === "") v = null; else { const n = Number(v); if (!Number.isFinite(n) || n < 0) return "予算は、0以上の数で入れてください。"; v = n; } }
  else if (["visitDate", "quotedOn"].includes(key)) { if (v === "") v = null; else if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return "日付の形が違います。"; }
  state.fieldEdits[id] = { ...(state.fieldEdits[id] || {}), [key]: v }; saveMore(); return null;
}
export function meetingAdd(fd, audioName) {
  const text = String(fd.text || "").trim();
  if (!fd.date) return { error: "商談の日を入れてください。" };
  if (!text) return { error: "商談の内容を入れてください。" };
  const ids = getMeetings().map(m => m.id); let n = state.meetingsAdded.length + 1, id = "MN" + String(n).padStart(3, "0");
  while (ids.includes(id)) id = "MN" + String(++n).padStart(3, "0");
  const src = fd.source + (audioName ? `（音声：${audioName}・未解析）` : "");
  state.meetingsAdded.push({ id, caseId: fd.caseId, date: fd.date, attendees: String(fd.attendees || "").trim(), text, source: src, result: fd.result });
  const c = getCases().find(x => x.id === fd.caseId); let note = "";
  if (fd.result === "不成立") { state.edits.status[fd.caseId] = "失注"; note = "状況を「失注」にしました（結果は商談記録に残ります）。"; }
  else if (fd.result === "合意" && c && ["見積り中", ""].includes(c.status)) { state.edits.status[fd.caseId] = "受注"; note = `状況を「受注」にしました。次は、${c.contractType === "元請け経由" ? "発注書の受領" : "契約書の締結"}を記録してください。`; }
  saveEdits(); saveMore(); return { ok: true, id, note };
}
export function draftToEstimate(caseId) {
  const d = state.detail.draft, c = getCases().find(x => x.id === caseId); if (!d || !c) return;
  const e = defaultEstimate(); e.customer = ""; e.property = c.name; e.person = c.person; e.lines = d.res.lines.map(l => ({ ...l }));
  e.note = d.res.budget != null ? `お客様の予算：約${Math.round(d.res.budget / 10000).toLocaleString("ja-JP")}万円（商談より）` : "";
  state.est = e; estSave();
}
