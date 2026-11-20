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
};

export const getScope = sc => C.buildScope(state.data, sc, state.overrides);
