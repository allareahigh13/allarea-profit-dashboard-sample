/* ホームの上の「秘書」：今日やることを、そのまま押して対応できる形で並べ、原因・対応・AIにできることを添える。 */
import * as C from "./calc.js";
import { state, getAlerts } from "./state.js";
import { esc } from "./ui.js";
import { myReminders } from "./tasks.js";

const LV = { "高": "hi", "中": "mid", "低": "lo" };
const lvTag = l => `<span class="lvl ${LV[l]}">${l}</span>`;

/** その項目に直接つながる操作ボタン。 */
function actionsFor(a) {
  const b = [], id = esc(a.id);
  if (a.taskId) {
    if (a.kind === "預けたまま") b.push(`<button type="button" class="btn small ok" data-task-nudge="${esc(a.taskId)}">催促する</button>`);
    else if (a.kind === "報告が届いた") b.push(`<button type="button" class="btn small ok" data-task-confirm="${esc(a.taskId)}">確認して完了にする</button>`);
    else if (a.kind === "新着") b.push(`<button type="button" class="btn small ok" data-task-ack="${esc(a.taskId)}">受け取りました</button>`);
    b.push(`<a class="btn small" href="#/tasks">タスクを開く</a>`);
  } else {
    if (a.kind === "資材発注") b.push(`<button type="button" class="btn small ok" data-order-done="${esc(String(a.id).replace(/^ord:/, ""))}">発注済みにする</button>`);
    if (a.kind === "メモ") b.push(`<a class="btn small" href="#/memos">メモを開く</a>`);
    else if (a.caseId) b.push(`<a class="btn small" href="#/sites" data-site-open="${esc(a.caseId)}">現場を見る</a>`);
    b.push(`<button type="button" class="btn small" data-ack="${id}">確認済みにする</button>`);
  }
  return b.join("");
}

export function secretaryHtml({ limit = 5 } = {}) {
  const asOf = state.data.asOf, seen = new Set();
  const items = [...myReminders(), ...getAlerts()].filter(a => (seen.has(a.id) ? false : seen.add(a.id))).sort((x, y) => ({ "高": 0, "中": 1, "低": 2 }[x.level] - { "高": 0, "中": 1, "低": 2 }[y.level]));
  const hi = items.filter(a => a.level === "高").length;
  const head = `<div class="sec-head"><div><h2 class="ttl" style="margin:0">今日やること（秘書の提案）</h2><p class="sub2" style="margin:2px 0 0">${items.length ? `全${items.length}件（急ぎ ${hi}件）。ボタンを押すと、その場で対応できます。` : "いま対応が必要なことはありません。"}　基準日 ${esc(asOf)}</p></div></div>`;
  if (!items.length) return `<section class="card panel secretary">${head}</section>`;
  const cards = items.slice(0, limit).map(a => {
    const ad = C.secretaryAdvice(a.kind);
    return `<article class="sec-item ${LV[a.level]}"><div class="al-h">${lvTag(a.level)}<b>${esc(a.title)}</b><span class="kind">${esc(a.kind)}</span></div>
      <p class="sub2" style="margin:4px 0">${esc(a.detail)}</p><div class="al-a">→ ${esc(a.action)}</div>
      <div class="tools">${actionsFor(a)}</div>
      <details class="sec-more"><summary>秘書の分析：原因・対応・AIにできること</summary>
        <div class="sec-cols"><div><h5>考えられる原因</h5><p>${esc(ad.cause)}</p><h5>対応の進め方</h5><ol>${ad.steps.map(s => `<li>${esc(s)}</li>`).join("")}</ol></div>
        <div><h5>AIが代わりにできること</h5><ul class="can">${ad.aiCan.map(s => `<li>${esc(s)}</li>`).join("")}</ul><h5>人がすること</h5><ul class="cannot">${ad.aiCannot.map(s => `<li>${esc(s)}</li>`).join("")}</ul></div></div></details></article>`;
  }).join("");
  const more = items.length > limit ? `<p class="note">ほか ${items.length - limit}件。<a href="#/sites">現場進捗状況</a>・<a href="#/tasks">タスク</a>で全部見られます。</p>` : "";
  return `<section class="card panel secretary">${head}<div class="feed">${cards}</div>${more}<p class="note">この提案は、決まった規則で作っています（AIの文章生成は、まだつないでいません）。つなぐ場合も、同じ形で原因・対応・AIにできることを出し、送信などは必ず承認を取ります。</p></section>`;
}
