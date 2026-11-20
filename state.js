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
  cf: { status: "all", person: "all", contractor: "all", month: "all", q: "" },
  site: { tab: "list", sel: null },
  edits: store.get("caseEdits", { status: {}, gross: {}, stage: {}, added: [] }),
  taskEdits: store.get("taskEdits", {}),
  est: store.get("estimate", null),
};

/** 元の案件に、画面での編集（状況・粗利・工程・追加した案件）を重ねたもの。 */
export function getCases() {
  const e = state.edits, te = state.taskEdits;
  const base = state.data.cases.map(c => ({
    ...c, status: e.status[c.id] ?? c.status, gross: Object.prototype.hasOwnProperty.call(e.gross, c.id) ? e.gross[c.id] : c.gross,
    stage: e.stage[c.id] ?? c.stage, tasks: c.tasks.map((t, i) => ({ ...t, done: te[c.id + ":" + i] ?? t.done })),
  }));
  const added = (e.added || []).map(c => ({ ...c, status: e.status[c.id] ?? c.status, gross: Object.prototype.hasOwnProperty.call(e.gross, c.id) ? e.gross[c.id] : c.gross, stage: e.stage[c.id] ?? c.stage, tasks: c.tasks || [] }));
  return [...base, ...added];
}
export const saveEdits = () => { store.set("caseEdits", state.edits); store.set("taskEdits", state.taskEdits); };

export const getScope = sc => C.buildScope(state.data, sc, state.overrides);
