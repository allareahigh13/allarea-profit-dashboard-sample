// 実行：node --test tests/   （画面を使わず、計算の約束ごとを確かめる）
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as C from "../calc.js";

const here = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(here, "..", "data.sample.json"), "utf-8"));
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

test("利益 ＝ 売上 − 原価、原価 ＝ 資材 ＋ 人件費（実績のある月すべて）", () => {
  for (const sc of C.SCOPES) {
    const s = C.buildScope(data, sc);
    for (let i = 0; i <= s.L; i++) {
      near(s.cost[i], s.materials[i] + s.labor[i]);
      near(s.profit[i], s.sales[i] - s.cost[i]);
    }
  }
});

test("全体 ＝ 事業の合計（売上・原価・利益、実績と前年）", () => {
  const all = C.buildScope(data, "all"), a = C.buildScope(data, "reform"), b = C.buildScope(data, "staffing");
  for (const k of ["sales", "cost", "profit"]) {
    for (let i = 0; i < 12; i++) {
      if (all[k][i] !== null) near(all[k][i], a[k][i] + b[k][i]);
      near(all.prev[k][i], a.prev[k][i] + b.prev[k][i]);
    }
  }
});

test("実績がまだ無い月（1〜3月）は null で、最後の実績月は12月", () => {
  const s = C.buildScope(data, "all");
  assert.equal(s.L, 8);
  assert.equal(s.months[s.L], "12月");
  for (let i = 9; i < 12; i++) assert.equal(s.sales[i], null);
});

test("計画：季節の重みの合計は1、計画の累計は年間目標に届く", () => {
  const s = C.buildScope(data, "all");
  near(s.weights.reduce((a, b) => a + b, 0), 1);
  near(C.cumulative(s.plan.sales)[11], s.target.sales);
  near(C.cumulative(s.plan.profit)[11], s.target.profit);
  assert.equal(s.target.sales, 12000 + 3600);
});

test("目標の上書きが反映される（0以上の数だけ）", () => {
  const s = C.buildScope(data, "reform", { reform: { sales: 15000, profit: 4000 } });
  assert.equal(s.target.sales, 15000);
  const bad = C.buildScope(data, "reform", { reform: { sales: -5, profit: "x" } });
  assert.equal(bad.target.sales, 12000);
});

test("進捗・計画との差・着地見込みの計算", () => {
  const s = C.buildScope(data, "all"), m = C.summarize(s).metrics.sales;
  const cum = C.cumulative(s.sales)[s.L];
  near(m.cum, cum);
  near(m.progress, cum / s.target.sales * 100);
  const planCum = C.cumulative(s.plan.sales)[s.L];
  near(m.planCum, planCum);
  near(m.diff, cum - planCum);
  const sumW = s.weights.slice(0, s.L + 1).reduce((a, b) => a + b, 0);
  near(m.forecast, cum / sumW, 0.5);   // 表示のため整数に丸めている
});

test("前月比・前年比", () => {
  const s = C.buildScope(data, "all"), m = C.summarize(s).metrics.sales;
  near(m.momPct, (s.sales[8] - s.sales[7]) / s.sales[7] * 100);
  near(m.yoyPct, (s.sales[8] - s.prev.sales[8]) / s.prev.sales[8] * 100);
  assert.equal(C.pctChange(5, 0), null);
  assert.equal(C.pctChange(null, 3), null);
});

test("原価の内訳：資材＋人件費＝原価、％の合計は100", () => {
  for (const sc of C.SCOPES) {
    const sm = C.summarize(C.buildScope(data, sc));
    const [mat, lab] = sm.costBreakdown;
    near(mat.amount + lab.amount, sm.metrics.cost.cum);
    near(mat.ofCost + lab.ofCost, 100);
    near(mat.ofSales + lab.ofSales, sm.costRate);
  }
});

test("事業別の構成：金額の合計は全体と一致、％の合計は100", () => {
  const c = C.composition(data), all = C.summarize(C.buildScope(data, "all")).metrics;
  near(c.total.sales, all.sales.cum); near(c.total.cost, all.cost.cum); near(c.total.profit, all.profit.cum);
  for (const k of ["salesPct", "costPct", "profitPct"]) near(c.parts.reduce((a, p) => a + p[k], 0), 100);
});

test("担当者別：担当者の売上・人件費の合計は事業と一致", () => {
  for (const b of data.businesses) {
    const s = C.buildScope(data, b.id), rows = C.peopleTable(data, b.id, s.L);
    near(rows.reduce((a, r) => a + r.sales, 0), C.cumulative(s.sales)[s.L]);
    near(rows.reduce((a, r) => a + r.labor, 0), C.cumulative(s.labor)[s.L]);
  }
});

test("活動の流れ：段が進むほど件数は増えない", () => {
  for (const b of data.businesses) {
    const f = C.funnel(b, 8);
    for (let i = 1; i < f.length; i++) assert.ok(f[i].count <= f[i - 1].count, `${b.id}:${f[i].name}`);
  }
});

test("累計は最初の実績なし月から後ろが null", () => {
  const c = C.cumulative([1, 2, null, 4]);
  assert.deepEqual(c, [1, 3, null, null]);
});

test("表示の整形（符号・小数・欠けた値）", () => {
  assert.equal(C.fmtMan(1234.56), "1,234.6");
  assert.equal(C.fmtMan(-5, { sign: true }), "−5");
  assert.equal(C.fmtMan(5, { sign: true }), "+5");
  assert.equal(C.fmtMan(null), "—");
  assert.equal(C.fmtPct(12.34, { sign: true }), "+12.3%");
});
