/* 画面の状態（どのページでも共通）。保存してよいのは表示の好みと目標の上書きだけ。 */
import * as C from "./calc.js";

export const store = {
  get(k, def) { try { const v = localStorage.getItem("pnl." + k); return v == null ? def : JSON.parse(v); } catch { return def; } },
  set(k, v) { try { localStorage.setItem("pnl." + k, JSON.stringify(v)); } catch { /* 保存できなくても動く */ } },
};

export const state = {
  data: null,
  range: "year",                 // year / 6 / 3
  metric: "sales",               // sales / cost / profit
  mode: "both",                  // both / monthly / cum
  showMoM: store.get("showMoM", true),
  showYoY: store.get("showYoY", true),
  ser: { bars: true, plan: true, cum: true },
  compMeasure: "sales",          // 損益構成の見方（sales / cost / profit）
  staffBiz: "all",
  sort: { key: "sales", dir: -1 },
  reportIdx: null,
  overrides: store.get("targets", {}),
  updatedAt: null,
  theme: store.get("theme", "navy"),
  // 案件管理・現場進捗・見積（編集内容はこのブラウザにだけ保存）
  cf: { tab: "cases", status: "all", person: "all", contractor: "all", month: "all", q: "" },
  site: { tab: "list", sel: null, pick: null, gr: "all", gf: { status: "all", person: "all" } },
  edits: store.get("caseEdits", { status: {}, gross: {}, stage: {}, added: [] }),
  taskEdits: store.get("taskEdits", {}),
  est: store.get("estimate", null),
  // 職人の依頼・日報・商談・着工前チェック・案件の項目・確認済みのアラート
  dEdits: store.get("dispatchEdits", { status: {}, memo: {}, added: [] }),
  reportsAdded: store.get("reportsAdded", []),
  reportApproval: store.get("reportApproval", {}),
  meetingsAdded: store.get("meetingsAdded", []),
  checklistEdits: store.get("checklistEdits", {}),
  fieldEdits: store.get("fieldEdits", {}),
  ack: store.get("alertAck", {}),
  mt: { form: null, structured: null, month: "all" },
  meetingEdits: store.get("meetingEdits", {}),
  inboxDone: store.get("inboxDone", {}),
  me: store.get("me", "代表"),
  taskState: store.get("taskState", { added: [], edits: {} }),
  orderState: store.get("orderState", { added: [], edits: {} }),
  tv: { tab: "mine" },
  dock: { open: false },
  pp: { tab: "reform", selR: null, selA: null, sortR: { key: "profit", dir: -1 }, sortA: { key: "sales", dir: -1 } },
  memosAdded: store.get("memosAdded", []),
  memoEdits: store.get("memoEdits", {}),
  mv: { tab: "open", caseId: "all", kind: "all" },
  fm: { month: "all", sort: { key: "margin", dir: -1 } },
  detail: { openId: null, siteSel: null, craftsman: null, draft: null },
};

/** 元の案件に、画面での編集（状況・粗利・工程・追加した案件・案件の項目・着工前チェック）と、職人の依頼の結果を重ねたもの。 */
export function getCases() {
  const e = state.edits, te = state.taskEdits, fe = state.fieldEdits, ce = state.checklistEdits;
  const over = c => ({
    ...c, ...(fe[c.id] || {}), status: e.status[c.id] ?? c.status,
    gross: Object.prototype.hasOwnProperty.call(e.gross, c.id) ? e.gross[c.id] : c.gross, stage: e.stage[c.id] ?? c.stage,
    checklist: c.checklist ? { ...c.checklist, ...(ce[c.id] || {}) } : (ce[c.id] ? { neighborhood: false, materials: false, craftsmen: false, curing: false, ...ce[c.id] } : c.checklist),
    tasks: (c.tasks || []).map((t, i) => ({ ...t, done: te[c.id + ":" + i] ?? t.done })),
  });
  const list = [...state.data.cases, ...(e.added || [])].map(over);
  return C.applyDispatches(list, getDispatches());
}
export function getDispatches() {
  const d = state.dEdits;
  return [...(state.data.dispatches || []), ...(d.added || [])].map(x => ({ ...x, status: d.status[x.id] ?? x.status, memo: d.memo[x.id] ?? x.memo }));
}
export function getReports() {
  return [...(state.data.reports || []), ...state.reportsAdded].map(r => (r.change && state.reportApproval[r.id] ? { ...r, change: { ...r.change, approval: state.reportApproval[r.id] } } : r));
}
export function getTasks() { const d = state.taskState; return [...(state.data.tasks || []), ...d.added].map(t => ({ ...t, ...(d.edits[t.id] || {}) })); }
export function taskPatch(id, patch) { state.taskState.edits[id] = { ...(state.taskState.edits[id] || {}), ...patch }; store.set("taskState", state.taskState); }
export function getMemos() { return [...(state.data.memos || []), ...state.memosAdded].map(m => ({ ...m, ...(state.memoEdits[m.id] || {}) })); }
export function getMeetings() { return [...(state.data.meetings || []), ...state.meetingsAdded].map(m => ({ outcome: m.caseId ? "案件化" : "検討中", place: "", withWho: "", ...m, ...(state.meetingEdits[m.id] || {}) })); }
/** 資材の発注（工程表の中の「発注するもの」）。見本のデータ＋足したもの、に、発注済みの日などの変更を重ねる。 */
export function getOrders() { const d = state.orderState; return [...(state.data.orders || []), ...d.added].filter(o => !d.edits[o.id]?.removed).map(o => ({ ...o, ...(d.edits[o.id] || {}) })); }
export function orderPatch(id, patch) { state.orderState.edits[id] = { ...(state.orderState.edits[id] || {}), ...patch }; store.set("orderState", state.orderState); }
export function orderAdd(o) { const ids = getOrders().map(x => x.id); let n = state.orderState.added.length + 1, id = "ON" + String(n).padStart(3, "0"); while (ids.includes(id)) id = "ON" + String(++n).padStart(3, "0"); state.orderState.added.push({ id, ...o }); store.set("orderState", state.orderState); return id; }
export function getInbox() { return (state.data.inbox || []).map(v => ({ ...v, imported: v.imported || !!state.inboxDone[v.id] })); }
/** 確認済みにしたアラートを除いた一覧（all=true で全部）。確認済みは、その日の間だけ隠す。 */
export function getAlerts(all = false) {
  const list = C.buildAlerts({ cases: getCases(), dispatches: getDispatches(), reports: getReports(), memos: getMemos(), orders: getOrders(), asOf: state.data.asOf });
  return all ? list : list.filter(a => state.ack[a.id] !== state.data.asOf);
}
export function saveMore() {
  store.set("dispatchEdits", state.dEdits); store.set("reportsAdded", state.reportsAdded); store.set("reportApproval", state.reportApproval);
  store.set("meetingsAdded", state.meetingsAdded); store.set("memosAdded", state.memosAdded); store.set("meetingEdits", state.meetingEdits); store.set("inboxDone", state.inboxDone); store.set("memoEdits", state.memoEdits); store.set("checklistEdits", state.checklistEdits); store.set("fieldEdits", state.fieldEdits); store.set("alertAck", state.ack);
}
export const saveEdits = () => { store.set("caseEdits", state.edits); store.set("taskEdits", state.taskEdits); };

export const getScope = sc => C.buildScope(state.data, sc, state.overrides);
