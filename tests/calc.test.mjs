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

const TPL = [{ name: "クロス張替", unit: "㎡", price: 1200 }, { name: "ユニットバス交換", unit: "式", price: 680000 }, { name: "トイレ交換", unit: "式", price: 180000 }];

test("商談の叩き台：要望・予算・日程・結果の見込み・見積の候補を拾う（規則による。AIではない）", () => {
  const text = "お風呂を新しくしたいです。リビングのクロスを張り替えたい、40㎡くらいです。予算は250万円くらいで考えています。工期は年明けからお願いします。ではそれでお願いします。";
  const r = C.extractMeeting(text, TPL);
  assert.ok(r.requests.length >= 2);
  assert.equal(r.budget, 2500000);
  assert.ok(r.schedule.some(s => s.includes("年明け")));
  assert.equal(r.resultGuess, "合意");
  const names = r.lines.map(l => l.name);
  assert.ok(names.includes("ユニットバス交換") && names.includes("クロス張替"));
  const cloth = r.lines.find(l => l.name === "クロス張替");
  assert.equal(cloth.qty, 40); assert.equal(cloth.unit, "㎡"); assert.equal(cloth.price, 1200);
});

test("商談の叩き台：見送りは「不成立」、どちらでもなければ「検討中」、空は空", () => {
  assert.equal(C.extractMeeting("検討の結果、今回は見送りにします。", TPL).resultGuess, "不成立");
  assert.equal(C.extractMeeting("もう少し考えさせてください。", TPL).resultGuess, "検討中");
  const e = C.extractMeeting("", TPL);
  assert.deepEqual([e.requests, e.lines, e.budget, e.resultGuess], [[], [], null, "検討中"]);
  assert.equal(C.extractMeeting("予算は5000円です", TPL).budget, null);   // 5桁未満の「円」は予算として拾わない
});

test("職人の依頼：了承は工程表の日程を書き換え、依頼中は確認待ちの印を付ける（元のデータは変えない）", () => {
  const cases = [{ id: "X1", tasks: [{ name: "a", start: "2026-12-01", end: "2026-12-03", done: 0 }, { name: "b", start: "2026-12-04", end: "2026-12-05", done: 0 }] }];
  const ds = [{ id: "d1", caseId: "X1", taskIdx: 0, craftsman: "職人A", start: "2026-12-24", end: "2026-12-26", status: "了承" },
              { id: "d2", caseId: "X1", taskIdx: 1, craftsman: "職人B", start: "2026-12-27", end: "2026-12-28", status: "依頼中" }];
  const out = C.applyDispatches(cases, ds);
  assert.equal(out[0].tasks[0].start, "2026-12-24"); assert.equal(out[0].tasks[0].end, "2026-12-26"); assert.equal(out[0].tasks[0].confirmed, true);
  assert.equal(out[0].tasks[1].start, "2026-12-04");               // 依頼中は日程を変えない
  assert.equal(out[0].tasks[1].pending.craftsman, "職人B");
  assert.equal(cases[0].tasks[0].start, "2026-12-01");              // 元は変わらない
  assert.equal(C.applyDispatches(cases, [])[0], cases[0]);
});

test("現場のいま：何をしているか・どこまで進んだか・次は何か", () => {
  const tasks = [{ name: "a", start: "2026-12-01", end: "2026-12-03", done: 100 }, { name: "b", start: "2026-12-04", end: "2026-12-10", done: 40 }, { name: "c", start: "2026-12-11", end: "2026-12-12", done: 0 }];
  const n = C.siteNow(tasks, "2026-12-06");
  assert.deepEqual(n.doing.map(t => t.name), ["b"]); assert.equal(n.next.name, "c"); assert.equal(n.lastDone.name, "a"); assert.equal(n.doneCount, 1);
  assert.equal(C.siteNow([], "2026-12-06"), null);
});

test("アラート：遅れ・日報・職人の確認・相談・追加変更の承認・着工前・契約書を拾い、重い順に並べる", () => {
  const asOf = "2026-12-18";
  const mk = o => ({ id: "A", name: "試験邸", status: "進行中", stage: 3, contractType: "直接", contractDoc: "締結済", checklist: { neighborhood: true, materials: true, craftsmen: true, curing: true }, tasks: [], ...o });
  const lateTask = { name: "解体", start: "2026-12-01", end: "2026-12-10", done: 50 };
  const slowTask = { name: "下地", start: "2026-12-10", end: "2026-12-19", done: 10 };
  const a = C.buildAlerts({ cases: [mk({ tasks: [lateTask, slowTask] })], asOf, reports: [{ caseId: "A", date: "2026-12-18" }] });
  assert.deepEqual(a.map(x => [x.kind, x.level]), [["遅れ", "高"], ["遅れ", "中"]]);
  // 日報なし（施工中）
  assert.equal(C.buildAlerts({ cases: [mk()], asOf }).find(x => x.kind === "日報").level, "高");
  assert.equal(C.buildAlerts({ cases: [mk()], asOf, reports: [{ caseId: "A", date: "2026-12-17" }] }).find(x => x.kind === "日報").level, "中");
  assert.equal(C.buildAlerts({ cases: [mk()], asOf, reports: [{ caseId: "A", date: "2026-12-18" }] }).length, 0);
  // 追加・変更工事の承認待ち
  const rc = [{ caseId: "A", date: "2026-12-18", change: { flag: true, text: "壁の補修を追加", approval: "未承認" } }];
  assert.equal(C.buildAlerts({ cases: [mk()], asOf, reports: rc }).find(x => x.kind === "追加・変更").level, "高");
  rc[0].change.approval = "承認済"; assert.equal(C.buildAlerts({ cases: [mk()], asOf, reports: rc }).length, 0);
  // 着工前の準備
  const pre = mk({ status: "受注", stage: 2, checklist: { neighborhood: false, materials: true, craftsmen: false, curing: true }, tasks: [{ name: "a", start: "2026-12-20", end: "2026-12-22", done: 0 }] });
  const p = C.buildAlerts({ cases: [pre], asOf }).find(x => x.kind === "着工前");
  assert.equal(p.level, "高"); assert.ok(p.detail.includes("近隣挨拶") && p.detail.includes("職人の手配"));
  assert.equal(C.buildAlerts({ cases: [{ ...pre, tasks: [{ name: "a", start: "2027-02-01", end: "2027-02-03", done: 0 }] }], asOf }).filter(x => x.kind === "着工前").length, 0);
  // 契約書・発注書
  assert.ok(C.buildAlerts({ cases: [mk({ status: "受注", stage: 2, contractDoc: "未" })], asOf }).some(x => x.kind === "契約" && x.title.includes("契約書")));
  assert.ok(C.buildAlerts({ cases: [mk({ status: "受注", stage: 2, contractDoc: "未", contractType: "元請け経由" })], asOf }).some(x => x.title.includes("発注書")));
  // 見積の返事待ち
  assert.ok(C.buildAlerts({ cases: [mk({ status: "見積り中", stage: 1, quotedOn: "2026-12-01" })], asOf }).some(x => x.kind === "見積"));
  assert.ok(!C.buildAlerts({ cases: [mk({ status: "見積り中", stage: 1, quotedOn: "2026-12-10" })], asOf }).some(x => x.kind === "見積"));
  // 職人の確認待ち・相談
  const withTask = mk({ tasks: [{ name: "a", start: "2026-12-24", end: "2026-12-26", done: 0 }] });
  const ds = [{ id: "d1", caseId: "A", taskIdx: 0, craftsman: "職人A", start: "2026-12-24", end: "2026-12-26", status: "依頼中", sentOn: "2026-12-13" },
              { id: "d2", caseId: "A", taskIdx: 0, craftsman: "職人B", start: "2026-12-24", end: "2026-12-26", status: "相談", sentOn: "2026-12-17", memo: "別の現場と重なる" }];
  const al = C.buildAlerts({ cases: [withTask], dispatches: ds, reports: [{ caseId: "A", date: "2026-12-18" }], asOf });
  assert.equal(al.find(x => x.kind === "職人の確認").level, "高");     // 5日待ち
  assert.equal(al.find(x => x.kind === "職人の相談").level, "高");
  assert.deepEqual(al.map(x => x.level), [...al.map(x => x.level)].sort((p, q) => C.LEVEL_ORDER[p] - C.LEVEL_ORDER[q]));
  assert.equal(new Set(al.map(x => x.id)).size, al.length);              // id は重ならない
});

test("現場の収支：収益＝出来高売上−コスト、収益率＝収益÷出来高売上、予定との差", () => {
  const c = { id: "Z", name: "試験", amount: 1000000, contractType: "直接", contractor: "自社", month: "12月", person: "担当A", status: "進行中" };
  const fin = { start: "2026-12-01", end: "2026-12-10", progress: 50, plannedCost: 700000, costs: { materials: 200000, labor: 150000, subcontract: 0, other: 25000 } };
  const r = C.siteMoney(c, fin);
  near(r.earned, 500000); near(r.cost, 375000); near(r.profit, 125000); near(r.margin, 25);
  near(r.plannedProfit, 300000); near(r.plannedMargin, 30); near(r.marginDiff, -5);
  assert.equal(r.days, 10); assert.equal(r.origin, "個人（直接）"); assert.equal(r.kind, "個人発注");
  near(r.forecastProfit, 1000000 - 375000 / 0.5);                       // 最終収益の見込み＝契約額 − コスト÷進み具合
  assert.equal(C.siteMoney({ ...c, contractType: "元請け経由", contractor: "元請けA" }, fin).origin, "元請けA");
  assert.equal(C.siteMoney(c, { ...fin, progress: 0, costs: {} }).margin, null);   // 出来高が0なら、収益率は出さない
});

test("現場の収支（サンプル）：全体の合計＝現場の合計、グループの合計＝全体、プラスとマイナスの現場がある", () => {
  const rows = C.siteMoneyRows(data.cases, data.siteFinance), t = C.moneyTotals(rows);
  assert.ok(rows.length >= 8);
  near(t.profit, rows.reduce((a, r) => a + r.profit, 0)); near(t.earned - t.cost, t.profit);
  assert.ok(t.plus > 0 && t.minus > 0);                                // 利益の出た現場と、マイナスの現場の両方がある
  for (const keyFn of [r => r.origin, r => r.kind, r => r.month]) {
    const g = C.groupMoney(rows, keyFn);
    near(g.reduce((a, x) => a + x.profit, 0), t.profit); near(g.reduce((a, x) => a + x.earned, 0), t.earned); assert.equal(g.reduce((a, x) => a + x.count, 0), rows.length);
    for (let i = 1; i < g.length; i++) assert.ok(g[i - 1].profit >= g[i].profit);   // 収益の大きい順
  }
  for (const r of rows) assert.ok(r.days >= 1 && r.progress > 0 && r.progress <= 100);
});

test("現場の収支：粗利が入っている案件（受注管理の粗利）と、コストから出した収益が合う", () => {
  for (const r of C.siteMoneyRows(data.cases, data.siteFinance)) {
    const c = data.cases.find(x => x.id === r.id);
    if (c.gross != null && r.progress === 100) near(r.profit, c.gross);
  }
});

test("メモのリマインド：種類ごとの放置の日数と期限で重さが決まる。処理済みは出さない", () => {
  const asOf = "2026-12-18", mk = o => ({ id: "m", date: "2026-12-18", caseId: null, kind: "メモ", text: "t", author: "a", due: null, status: "未処理", ...o });
  assert.equal(C.memoLevel(mk({}), asOf), null);                                              // 今日のメモは出さない
  assert.equal(C.memoLevel(mk({ kind: "要確認", date: "2026-12-17" }), asOf).level, "中");   // 要確認は1日で中
  assert.equal(C.memoLevel(mk({ kind: "要確認", date: "2026-12-15" }), asOf).level, "高");   // 3日で高
  assert.equal(C.memoLevel(mk({ kind: "あとで整理", date: "2026-12-16" }), asOf), null);     // 2日はまだ
  assert.equal(C.memoLevel(mk({ kind: "あとで整理", date: "2026-12-15" }), asOf).level, "中");
  assert.equal(C.memoLevel(mk({ kind: "あとで整理", date: "2026-12-11" }), asOf).level, "高");
  assert.equal(C.memoLevel(mk({ kind: "気づき", date: "2026-12-10" }), asOf), null);
  assert.equal(C.memoLevel(mk({ kind: "気づき", date: "2026-12-01" }), asOf).level, "中");
  assert.equal(C.memoLevel(mk({ date: "2026-12-17", due: "2026-12-17" }), asOf).level, "高");   // 期限が過ぎたら、種類に関係なく高
  assert.equal(C.memoLevel(mk({ kind: "要確認", date: "2026-12-01", status: "処理済" }), asOf), null);
  const al = C.buildAlerts({ cases: [{ id: "A", name: "試験邸", status: "請求済", stage: 5, tasks: [] }], memos: [mk({ id: "m1", caseId: "A", kind: "要確認", date: "2026-12-10" }), mk({ id: "m2", kind: "あとで整理", date: "2026-12-14" })], asOf });
  assert.deepEqual(al.map(a => [a.id, a.level, a.kind]), [["memo:m1", "高", "メモ"], ["memo:m2", "中", "メモ"]]);
  assert.ok(al[0].detail.includes("試験邸") && al[1].detail.includes("全体"));
});

test("メモ（サンプル）：未処理のメモから、重さの違うリマインドが出る", () => {
  const cases = C.applyDispatches(data.cases, data.dispatches);
  const al = C.buildAlerts({ cases, dispatches: data.dispatches, reports: data.reports, memos: data.memos, asOf: data.asOf }).filter(a => a.kind === "メモ");
  assert.ok(al.length >= 3 && al.some(a => a.level === "高") && al.some(a => a.level === "中"));
  assert.ok(!al.some(a => a.id === "memo:N006"));      // 処理済みは出ない
});

test("アドバイザー：合計は人材紹介業の月次の数字と一致する（売上・成約・面談）", () => {
  const biz = data.businesses.find(b => b.id === "staffing"), L = 8;
  for (let i = 0; i <= L; i++) {
    near(data.advisors.reduce((a, v) => a + v.sales[i], 0), biz.sales[i]);
    assert.equal(data.advisors.reduce((a, v) => a + v.hires[i], 0), biz.activity["入社"][i]);
    assert.equal(data.advisors.reduce((a, v) => a + v.interviews[i], 0), biz.activity["求職者面談"][i]);
  }
  for (let i = 9; i < 12; i++) for (const a of data.advisors) assert.equal(a.sales[i], null);
});

test("アドバイザー：単価＝売上÷成約数、成約率＝成約÷面談、面談1時間あたり売上、全体の合計＝個人の合計", () => {
  const ts = C.teamStats(data.advisors, 8);
  for (const a of ts.list) {
    near(a.unitPrice, a.sales / a.hires); near(a.hireRate, a.hires / a.interviews * 100); near(a.salesPerHour, a.sales / a.hours);
    near(a.salesPerInterview, a.sales / a.interviews); near(a.minutesPerInterview, a.hours * 60 / a.interviews);
    assert.ok(a.hires <= a.offers && a.offers <= a.recommended && a.recommended <= a.interviews);
  }
  near(ts.total.sales, ts.list.reduce((x, a) => x + a.sales, 0)); assert.equal(ts.total.hires, ts.list.reduce((x, a) => x + a.hires, 0));
  near(ts.total.sales, C.cumulative(C.buildScope(data, "staffing").sales)[8]);                 // 人材紹介業の累計売上と一致
  assert.equal(C.advisorStats({ name: "x", interviews: [0], hours: [0], recommended: [0], offers: [0], hires: [0], sales: [0] }, 0).unitPrice, null);
  near(C.vsAvg(120, 100), 20); assert.equal(C.vsAvg(5, 0), null); assert.equal(C.vsAvg(null, 5), null);
});

test("リフォームの担当者：売上・コスト・利益・現場数の合計は、現場の収支の合計と一致する", () => {
  const rows = C.siteMoneyRows(data.cases, data.siteFinance), ppl = C.reformPeople(rows, data.cases), t = C.moneyTotals(rows);
  near(ppl.reduce((a, p) => a + p.earned, 0), t.earned); near(ppl.reduce((a, p) => a + p.cost, 0), t.cost); near(ppl.reduce((a, p) => a + p.profit, 0), t.profit);
  assert.equal(ppl.reduce((a, p) => a + p.sites, 0), rows.length);
  for (let i = 1; i < ppl.length; i++) assert.ok(ppl[i - 1].profit >= ppl[i].profit);
  for (const p of ppl) { near(p.earned - p.cost, p.profit); if (p.ordered + p.lost) near(p.winRate, p.ordered / (p.ordered + p.lost) * 100); }
  assert.ok(ppl.some(p => p.minus > 0));
});

test("案件の期間：工程表＞施工の期間＞受付〜見積の順に決める。日付が無ければ null", () => {
  const asOf = "2026-12-18";
  assert.deepEqual(C.caseSpan({ tasks: [{ start: "2026-12-05", end: "2026-12-09" }, { start: "2026-12-01", end: "2026-12-03" }] }, { start: "2026-01-01", end: "2026-01-02" }, asOf), { start: "2026-12-01", end: "2026-12-09", kind: "工程表" });
  assert.deepEqual(C.caseSpan({ tasks: [] }, { start: "2026-10-01", end: "2026-10-20" }, asOf), { start: "2026-10-01", end: "2026-10-20", kind: "施工の期間" });
  assert.deepEqual(C.caseSpan({ tasks: [], visitDate: "2026-12-02", quotedOn: "2026-12-10" }, null, asOf), { start: "2026-12-02", end: "2026-12-10", kind: "受付〜見積" });
  assert.deepEqual(C.caseSpan({ tasks: [], visitDate: "2026-12-02" }, null, asOf), { start: "2026-12-02", end: "2026-12-18", kind: "受付〜見積" });
  assert.equal(C.caseSpan({ tasks: [] }, null, asOf), null);
  for (const c of C.applyDispatches(data.cases, data.dispatches)) { const sp = C.caseSpan(c, data.siteFinance[c.id], data.asOf); if (sp) assert.ok(C.dayDiff(sp.start, sp.end) >= 0, c.id); }
});

test("タスク：受けた側は「新着」と「早く報告して」、預けた側は「預けたまま」と「報告が届いた」。報告・完了で消える", () => {
  const asOf = "2026-12-18", mk = o => ({ id: "T", title: "試験", createdBy: "代表", assignee: "担当A", createdOn: "2026-12-18", due: null, status: "未着手", progress: 0, ackedOn: null, reportedOn: null, reportNote: "", nudges: 0, nudgedOn: null, ...o });
  const kinds = (ts, me) => C.taskReminders(ts, asOf, me).map(a => a.kind + ":" + a.level);
  assert.deepEqual(kinds([mk()], "担当A"), ["新着:低"]);                                    // 今日来た：新着だけ
  assert.deepEqual(kinds([mk()], "代表"), []);                                               // 預けた側は、まだ何も出ない
  assert.deepEqual(kinds([mk({ createdOn: "2026-12-16", ackedOn: "2026-12-16", status: "対応中" })], "担当A"), ["報告:中"]);   // 2日たった
  assert.deepEqual(kinds([mk({ createdOn: "2026-12-16", ackedOn: "2026-12-16", status: "対応中" })], "代表"), ["預けたまま:中"]);
  assert.deepEqual(kinds([mk({ createdOn: "2026-12-12", ackedOn: "2026-12-12", status: "対応中" })], "担当A"), ["報告:高"]);   // 6日
  assert.deepEqual(kinds([mk({ createdOn: "2026-12-17", ackedOn: "2026-12-17", due: "2026-12-17" })], "担当A"), ["報告:高"]);   // 期限切れ
  const rep = mk({ createdOn: "2026-12-12", ackedOn: "2026-12-12", status: "報告済", reportedOn: "2026-12-17", reportNote: "終わりました" });
  assert.deepEqual(kinds([rep], "担当A"), []);                                               // 報告したら、受けた側の通知は消える
  assert.deepEqual(kinds([rep], "代表"), ["報告が届いた:中"]);                               // 預けた側には「届いた」が出る
  assert.deepEqual(kinds([{ ...rep, status: "完了" }], "代表"), []);                         // 完了で、どちらも消える
  assert.deepEqual(kinds([mk({ status: "差し戻し", reportNote: "宛名が違う" })], "担当A"), ["差し戻し:高"]);
  assert.deepEqual(kinds([mk({ createdOn: "2026-12-16", ackedOn: "2026-12-16", status: "対応中", nudgedOn: "2026-12-18", nudges: 1 })], "担当A"), ["報告:中", "催促:中"]);
  assert.deepEqual(kinds([mk({ createdBy: "担当A", assignee: "担当A", due: "2026-12-10", ackedOn: "2026-12-01", status: "対応中" })], "担当A"), ["期限切れ:中"]);   // 自分のタスクの期限切れ
  const c = C.taskCounts([mk(), rep, mk({ id: "U", assignee: "代表", createdBy: "代表", status: "対応中" })], "代表");
  assert.deepEqual(c, { mine: 1, newForMe: 0, delegated: 2, reportedToMe: 1 });
});

test("タスク（サンプル）：代表と担当にリマインドが出て、完了のものは出ない", () => {
  const me = C.taskReminders(data.tasks, data.asOf, "代表"), a = C.taskReminders(data.tasks, data.asOf, "担当A"), e = C.taskReminders(data.tasks, data.asOf, "担当E");
  assert.ok(me.some(x => x.kind === "預けたまま" && x.level === "高") && me.some(x => x.kind === "報告が届いた"));
  assert.ok(a.some(x => x.kind === "報告" && x.level === "高"));
  assert.ok(e.some(x => x.kind === "新着") && e.some(x => x.kind === "報告"));
  assert.ok(![...me, ...a, ...e].some(x => x.taskId === "T007"));
  assert.equal(new Set(me.map(x => x.id)).size, me.length);
});

test("営業の流れ：商談 → 案件化 → 受注・失注。案件化率・失注率・失注の金額", () => {
  const cases = [{ id: "A", status: "受注", amount: 100 }, { id: "B", status: "失注", amount: 50 }, { id: "C", status: "見積り中", amount: 30 }, { id: "D", status: "入金済", amount: 20 }];
  const mt = (id, date, outcome, caseId = null) => ({ id, date, outcome, caseId });
  const ms = [mt("1", "2026-12-01", "案件化", "A"), mt("2", "2026-12-02", "案件化", "B"), mt("3", "2026-12-03", "案件化", "C"), mt("4", "2026-12-04", "案件化せず"), mt("5", "2026-12-05", "検討中"), mt("6", "2026-11-05", "案件化", "D"), mt("7", "2026-11-06", "案件化せず")];
  const f = C.salesFunnel(ms, cases);
  assert.deepEqual([f.total, f.converted, f.declined, f.pending, f.cases], [7, 4, 2, 1, 4]);
  near(f.convertRate, 4 / 7 * 100);
  assert.deepEqual([f.won, f.lost, f.open], [2, 1, 1]); near(f.lostRate, 25); near(f.wonRate, 50);
  assert.equal(f.lostAmount, 50); assert.equal(f.wonAmount, 120); assert.equal(f.openAmount, 30);
  const dec = C.salesFunnel(ms, cases, "12月"); assert.deepEqual([dec.total, dec.converted, dec.declined, dec.pending, dec.lost], [5, 3, 1, 1, 1]);
  assert.equal(C.salesFunnel([], cases).convertRate, null);
  assert.deepEqual(C.funnelByMonth(ms, cases, ["11月", "12月", "1月"]).map(r => [r.month, r.total]), [["11月", 2], ["12月", 5]]);   // 商談が無い月は出さない
});

test("営業の流れ（サンプル）：案件化していない商談がある。失注の理由の合計は、失注の案件＋案件化せずの商談", () => {
  const cases = C.applyDispatches(data.cases, data.dispatches), f = C.salesFunnel(data.meetings, cases);
  assert.ok(f.total >= 8 && f.declined > 0 && f.pending > 0 && f.converted > 0 && f.lost > 0);
  assert.equal(f.total, f.converted + f.declined + f.pending);
  const lr = C.lossReasons(data.meetings, cases);
  assert.equal(lr.reduce((a, r) => a + r.count, 0), cases.filter(c => c.status === "失注").length + data.meetings.filter(m => m.outcome === "案件化せず").length);
  for (let i = 1; i < lr.length; i++) assert.ok(lr[i - 1].count >= lr[i].count);
  for (const m of data.meetings) { assert.ok(["案件化", "案件化せず", "検討中"].includes(m.outcome)); if (m.outcome === "案件化") assert.ok(m.caseId, m.id); if (m.caseId) assert.ok(cases.some(c => c.id === m.caseId), m.id); }
});

test("商談の整理：担当者名・相手・元請けか直接か・物件名・場所・予算・見積の候補を拾う", () => {
  const staff = ["担当A", "担当B", "担当D"], v1 = data.inbox[0].transcript, v2 = data.inbox[1].transcript;
  const a = C.structureMeeting(v1, data.estimateTemplates, staff);
  assert.deepEqual(a.participants, ["担当A"]); assert.equal(a.counterpart, "田中様"); assert.equal(a.contractType, "直接"); assert.equal(a.property, "サンプル邸X");
  assert.equal(a.place, "お客様宅"); assert.equal(a.budget, 2500000); assert.equal(a.resultGuess, "検討中");   // 見積を出す段階。決まったとは言っていない
  assert.ok(a.lines.map(l => l.name).includes("ユニットバス交換") && a.lines.map(l => l.name).includes("トイレ交換") && a.lines.find(l => l.name === "クロス張替").qty === 30);
  const b = C.structureMeeting(v2, data.estimateTemplates, staff);
  assert.deepEqual(b.participants, ["担当D"]); assert.equal(b.contractType, "元請け経由"); assert.equal(b.contractor, "元請けB"); assert.equal(b.property, "サンプルマンション202"); assert.equal(b.budget, 1800000);
  assert.equal(b.resultGuess, "合意"); assert.equal(b.counterpart, "管理会社の佐藤さん");
  const c = C.structureMeeting(data.inbox[2].transcript, data.estimateTemplates, staff);
  assert.equal(c.resultGuess, "不成立"); assert.equal(c.place, "事務所"); assert.equal(c.counterpart, "山本様");
  const e = C.structureMeeting("", [], staff); assert.deepEqual([e.participants, e.counterpart, e.contractType, e.property, e.lines], [[], "", "直接", "", []]);
});

test("資材の発注期限：納品は着工の前日、発注期限＝納品の必要日−納品までの日数。状態は発注済み・期限切れ・期限間近・まだ先", () => {
  const task = { name: "内装", start: "2026-12-19", end: "2026-12-28", done: 0 }, asOf = "2026-12-18";
  const d = C.orderDue({ leadDays: 7, orderedOn: null }, task, asOf);
  assert.equal(d.needBy, "2026-12-18"); assert.equal(d.orderBy, "2026-12-11"); assert.equal(d.daysLeft, -7); assert.equal(d.state, "期限切れ");
  assert.equal(C.orderDue({ leadDays: 3, orderedOn: null }, task, asOf).orderBy, "2026-12-15");
  assert.equal(C.orderDue({ leadDays: 0, orderedOn: null }, task, asOf).state, "期限間近");              // 今日が期限（あと0日）
  assert.equal(C.orderDue({ leadDays: 0, orderedOn: null }, { ...task, start: "2026-12-30" }, asOf).state, "まだ先");
  assert.equal(C.orderDue({ leadDays: 7, orderedOn: "2026-12-10" }, task, asOf).state, "発注済み");        // 発注済みなら期限は関係ない
  assert.equal(C.orderDue({ leadDays: 2, orderedOn: null }, task, asOf, 0).needBy, "2026-12-19");          // 納品を着工の当日にする設定
  assert.equal(C.orderDue({ leadDays: 2, orderedOn: null }, { ...task, start: "2026-12-26" }, asOf).state, "期限間近");   // 工程がずれると期限も動く
});

test("資材の発注アラート：期限切れは高、あと1日以内は中、2〜5日は低。発注済み・遠い先・完了した工程・失注は出ない", () => {
  const asOf = "2026-12-18", mk = o => ({ id: "A", name: "試験邸", status: "進行中", stage: 2, contractDoc: "締結済", checklist: { neighborhood: true, materials: true, craftsmen: true, curing: true }, tasks: [{ name: "内装", start: "2026-12-26", end: "2026-12-30", done: 0 }], ...o });
  const it = o => ({ id: "o1", caseId: "A", taskIdx: 0, name: "クロス", leadDays: 3, orderedOn: null, ...o });
  const kinds = (cases, orders) => C.buildAlerts({ cases, orders, asOf, reports: [{ caseId: "A", date: asOf }] }).filter(a => a.kind === "資材発注").map(a => a.level);
  assert.deepEqual(kinds([mk()], [it({ leadDays: 10 })]), ["高"]);        // 期限 12/15
  assert.deepEqual(kinds([mk()], [it({ leadDays: 6 })]), ["中"]);         // 期限 12/19（あと1日）
  assert.deepEqual(kinds([mk()], [it({ leadDays: 5 })]), ["低"]);         // 期限 12/20（あと2日）
  assert.deepEqual(kinds([mk()], [it({ leadDays: 1 })]), []);             // 期限 12/24（まだ先）
  assert.deepEqual(kinds([mk()], [it({ leadDays: 10, orderedOn: "2026-12-12" })]), []);
  assert.deepEqual(kinds([mk({ tasks: [{ name: "内装", start: "2026-12-26", end: "2026-12-30", done: 100 }] })], [it({ leadDays: 10 })]), []);
  assert.deepEqual(kinds([mk({ status: "失注" })], [it({ leadDays: 10 })]), []);
  const a = C.buildAlerts({ cases: [mk()], orders: [it({ leadDays: 10 })], asOf, reports: [{ caseId: "A", date: asOf }] }).find(x => x.kind === "資材発注");
  assert.ok(a.title.includes("クロス") && a.detail.includes("12-15") && a.detail.includes("3日過ぎて"));
});

test("タスクの進み具合：小項目があれば、チェックの割合。なければ入れた値。報告済み・完了は100", () => {
  assert.equal(C.taskProgress({ status: "対応中", progress: 30 }), 30);
  assert.equal(C.taskProgress({ status: "対応中", progress: 30, subs: [{ done: true }, { done: false }, { done: false }, { done: true }] }), 50);
  assert.equal(C.taskProgress({ status: "対応中", progress: 30, subs: [{ done: true }, { done: false }, { done: false }] }), 33);
  assert.equal(C.taskProgress({ status: "報告済", subs: [{ done: false }] }), 100);
  assert.equal(C.taskProgress({ status: "完了", progress: 0 }), 100);
  assert.equal(C.taskProgress({ status: "未着手", progress: 0, subs: [] }), 0);
});

test("秘書の提案：アラートとリマインドのすべての種類に、原因・対応・AIにできること／できないことがある", () => {
  const kinds = ["遅れ","日報","資材発注","職人の確認","職人の相談","追加・変更","着工前","契約","見積","受付〜見積","工程表","施工の期間","メモ","預けたまま","報告が届いた","報告","新着","催促","差し戻し","期限切れ"];
  for (const k of kinds) { assert.ok(C.ADVICE_KINDS.includes(k), k + " の提案がありません"); const a = C.secretaryAdvice(k); assert.ok(a.cause && a.steps.length && a.aiCan.length && a.aiCannot.length, k); }
  assert.ok(C.secretaryAdvice("知らない種類").cause);   // 未知の種類でも、空にならない
});

test("分析期間：単月・直近3か月・年累計の合計と、期間の名前。先頭の月は範囲をはみ出さない", () => {
  const s = { L: 3, months: ["4月","5月","6月","7月"], sales: [10,20,30,40], cost: [5,10,15,20], profit: [5,10,15,20], materials: [2,4,6,8], labor: [3,6,9,12], prev: { sales: [8,8,8,8], cost: [4,4,4,4], profit: [4,4,4,4], materials: [1,1,1,1], labor: [3,3,3,3] }, plan: { sales: [10,10,10,10], cost: [5,5,5,5], profit: [5,5,5,5] } };
  const m = C.periodMetrics(s, "month"), q = C.periodMetrics(s, "quarter"), y = C.periodMetrics(s, "ytd");
  assert.equal(m.cur.sales, 40); assert.equal(m.label, "7月（単月）"); assert.equal(m.achievement, 400);
  assert.equal(q.cur.sales, 90); assert.equal(q.label, "5月〜7月（直近3か月）"); assert.equal(q.prevYear.sales, 24);
  assert.equal(y.cur.sales, 100); assert.equal(y.label, "期初〜7月（年累計）"); assert.equal(y.profitRate, 50);
  assert.equal(C.periodMetrics({ ...s, L: 0 }, "quarter").n, 1);   // 期初の月でも、3か月に満たない分だけで数える
  assert.equal(C.periodMetrics({ ...s, L: -1 }, "month"), null);
});

test("アドバイザーの意見：計画未達なら営業は注意、原価率超過なら財務は注意、商談が無ければ「記録していない」を出す", () => {
  const base = { pm: { achievement: 80, cur: { sales: 80, cost: 60, profit: 20, materials: 30, labor: 30 }, plan: { sales: 100 }, prevYear: { sales: 90, cost: 60 }, yoyPct: { materials: 20, labor: 5 }, costRate: 75, profitRate: 25 }, funnel: { total: 4, converted: 1, convertRate: 25, won: 1, lost: 1, open: 2, openAmount: 3000000 }, loss: [{ reason: "価格", count: 2 }], planCostRate: 60, ops: { waiting: 1 } };
  const b = C.adviceBoard(base);
  const sales = b.find(x => x.who.startsWith("営業")), fin = b.find(x => x.who.startsWith("財務")), org = b.find(x => x.who.startsWith("組織"));
  assert.equal(sales.tone, "warn"); assert.ok(sales.actions.some(a => a.includes("返事待ち"))); assert.ok(sales.evidence.some(e => e.includes("価格")));
  assert.equal(fin.tone, "warn"); assert.ok(fin.actions[0].includes("資材"));   // 資材の伸びのほうが大きい
  assert.equal(org.tone, "warn");
  const none = C.adviceBoard({ ...base, funnel: { total: 0 } }).find(x => x.who.startsWith("営業"));
  assert.ok(none.notDone[0].includes("記録していない"));
  const good = C.adviceBoard({ ...base, pm: { ...base.pm, achievement: 110, costRate: 55 }, ops: {} });
  assert.equal(good.find(x => x.who.startsWith("営業")).tone, "good"); assert.equal(good.find(x => x.who.startsWith("財務")).tone, "good");
  for (const x of b) assert.ok(x.headline && x.actions.length, x.who);
});
test("担当者の期間の実績：選んだ月の範囲だけを合計する", () => {
  const adv = { name: "A", interviews: [1,2,3,4], hours: [1,1,1,1], recommended: [1,1,1,1], offers: [0,1,1,1], hires: [0,0,1,1], sales: [10,20,30,40] };
  const r = C.advisorRange(adv, 1, 3);
  assert.equal(r.interviews, 9); assert.equal(r.sales, 90); assert.equal(r.hires, 2);
});
