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

test("月ごとの内訳：資材費＋人件費＋利益＝売上（全範囲・実績のある月すべて）、実績の無い月は null", () => {
  for (const sc of C.SCOPES) {
    const s = C.buildScope(data, sc);
    for (let i = 0; i < 12; i++) {
      const b = C.breakdownAt(s, i);
      if (i <= s.L) { near(b.materials + b.labor + b.profit, b.sales); near(b.profit, s.profit[i]); }
      else assert.equal(b, null);
    }
  }
});

test("案件：状況別の件数の合計＝全件、金額の合計＝全金額", () => {
  const sm = C.statusSummary(data.cases);
  assert.equal(Object.values(sm).reduce((a, v) => a + v.count, 0), data.cases.length);
  near(Object.values(sm).reduce((a, v) => a + v.amount, 0), data.cases.reduce((a, c) => a + c.amount, 0));
});

test("案件：月の表には「受注・進行中・請求済・入金済」だけ入る（見積り中・失注・空欄は入らない）", () => {
  const rows = C.monthlyCases(data.cases, ["10月", "11月", "12月", "1月"]);
  const n = rows.reduce((a, r) => a + r.count, 0);
  assert.equal(n, data.cases.filter(c => C.MONTH_VISIBLE.includes(c.status) && ["10月", "11月", "12月", "1月"].includes(c.month)).length);
  for (const r of rows) assert.ok(r.invoicedOnly <= r.invoicedPaid && r.invoicedPaid <= r.amount);
});

test("案件：粗利が入っていない受注済み案件を数える／粗利率", () => {
  const miss = C.grossMissing(data.cases);
  assert.equal(miss, data.cases.filter(c => C.MONTH_VISIBLE.includes(c.status) && c.gross == null).length);
  assert.ok(miss > 0);
  near(C.caseGrossRate({ amount: 200, gross: 50 }), 25);
  assert.equal(C.caseGrossRate({ amount: 0, gross: 5 }), null);
  assert.equal(C.caseGrossRate({ amount: 100, gross: null }), null);
});

test("工程表：日付の計算・状態・現場の進み具合", () => {
  assert.equal(C.dayDiff("2026-12-01", "2026-12-18"), 17);
  assert.equal(C.addDays("2026-12-30", 3), "2027-01-02");
  const t = { start: "2026-12-10", end: "2026-12-19", done: 50 };
  near(C.expectedProgress(t, "2026-12-14"), 50);
  assert.equal(C.expectedProgress(t, "2026-12-01"), 0);
  assert.equal(C.expectedProgress(t, "2027-01-01"), 100);
  assert.equal(C.taskState({ ...t, done: 100 }, "2026-12-30"), "完了");
  assert.equal(C.taskState(t, "2026-12-20"), "遅れ");
  assert.equal(C.taskState(t, "2026-12-05"), "未着手");
  assert.equal(C.taskState({ ...t, done: 10 }, "2026-12-17"), "遅れ気味");
  assert.equal(C.taskState({ ...t, done: 80 }, "2026-12-17"), "進行中");
});

test("工程表：現場の進み具合は0〜100％、計画との差は 実績 − 計画", () => {
  for (const c of data.cases.filter(x => x.tasks.length)) {
    const p = C.siteProgress(c.tasks, data.asOf);
    assert.ok(p.actual >= 0 && p.actual <= 100 && p.planned >= 0 && p.planned <= 100);
    near(p.delta, p.actual - p.planned);
    for (const t of c.tasks) assert.ok(C.dayDiff(t.start, t.end) >= 0);
  }
  assert.equal(C.siteProgress([], "2026-12-18"), null);
});

test("見積：明細・諸経費・値引き・消費税・合計・粗利", () => {
  const est = { lines: [{ qty: 2, price: 1000, cost: 600 }, { qty: 3, price: 333, cost: 200 }, { qty: 0, price: 500 }], overheadPct: 10, discount: 100, taxRate: 10 };
  const r = C.estimateTotals(est);
  assert.equal(C.lineAmount({ qty: 3, price: 333 }), 999);
  assert.equal(r.subtotal, 2999);
  assert.equal(r.overhead, 299);          // 2999 × 10% の切り捨て
  assert.equal(r.taxable, 2999 + 299 - 100);
  assert.equal(r.tax, Math.floor(3198 * 0.1));
  assert.equal(r.total, r.taxable + r.tax);
  assert.equal(r.cost, 1200 + 600);
  assert.equal(r.gross, r.taxable - 1800);
  assert.equal(C.estimateTotals({ lines: [{ qty: 1, price: 100 }], discount: 9999, taxRate: 10 }).total, 0);   // 値引きで0円未満にならない
  assert.equal(C.estimateTotals({ lines: [{ qty: -1, price: 100 }, { qty: "x", price: 5 }] }).subtotal, 0);   // 不正な値は0円
  assert.equal(C.estimateTotals({ lines: [{ qty: 1, price: 100 }] }).gross, null);                              // 原価が無ければ粗利は出さない
});

test("見積日から売上月の名前を作る", () => {
  assert.equal(C.monthLabelOf("2026-12-18"), "12月");
  assert.equal(C.monthLabelOf("2027-01-05"), "1月");
  assert.equal(C.monthLabelOf("2027-10-31"), "10月");
  assert.equal(C.monthLabelOf("2027-13-01"), null);
  assert.equal(C.monthLabelOf(""), null);
  assert.equal(C.monthLabelOf(undefined), null);
});
