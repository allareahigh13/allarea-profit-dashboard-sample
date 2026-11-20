/* 気づき（AI は使わない。数字から決まった規則で作る）。どの数字から出したかを必ず文に入れる。 */
import * as C from "./calc.js";
import { fmtMan, fmtPct } from "./ui.js";
import { getScope } from "./state.js";

const sumRange = (a, from, to) => { let s = 0; for (let i = from; i <= to; i++) { if (typeof a[i] !== "number") return null; s += a[i]; } return s; };

export function insights(scope) {
  const s = getScope(scope), sm = C.summarize(s);
  if (!sm) return [];
  const m = sm.metrics, L = sm.L, out = [];
  const add = (level, title, detail, action) => out.push({ level, title, detail, action });
  const name = s.name;

  // 1. 売上の計画との差・着地見込み
  {
    const d = m.sales.diff, f = m.sales.forecast, t = m.sales.target;
    if (d < 0) add("warn", `売上が計画より ${fmtMan(Math.abs(d))}万円 遅れています`,
      `${s.months[L]}までの累計売上は ${fmtMan(m.sales.cum)}万円で、計画 ${fmtMan(m.sales.planCum)}万円を ${fmtPct(Math.abs(m.sales.diffPct))} 下回っています。このペースが続くと年間 ${fmtMan(f)}万円で、目標 ${fmtMan(t)}万円に対して ${fmtMan(t - f)}万円 足りません。`,
      "見込み案件を洗い出し、前倒しできるものと失注しそうなものを分けて確認する");
    else add("good", `売上は計画より ${fmtMan(d)}万円 先行しています`,
      `${s.months[L]}までの累計売上は ${fmtMan(m.sales.cum)}万円で、計画 ${fmtMan(m.sales.planCum)}万円を ${fmtPct(m.sales.diffPct)} 上回っています。このペースだと年間 ${fmtMan(f)}万円で、目標 ${fmtMan(t)}万円に届く見込みです。`,
      "先行分を、原価の管理と次の受注の準備に回す");
  }
  // 2. 前年との比較
  if (m.sales.cumYoyPct != null) {
    const p = m.sales.cumYoyPct;
    add(p >= 0 ? "good" : "warn", `累計売上は前年の同じ時期より ${fmtPct(Math.abs(p))} ${p >= 0 ? "多い" : "少ない"}です`,
      `${s.months[L]}までで今年 ${fmtMan(m.sales.cum)}万円、前年 ${fmtMan(m.sales.cumYoy)}万円です。`,
      p >= 0 ? "伸びた要因（単価・件数のどちらか）を確かめ、続けられる形にする" : "件数と単価のどちらが減ったかを、活動分析で確認する");
  }
  // 3. 当月の前月比
  if (m.sales.momPct != null && m.sales.momPct <= -10)
    add("warn", `${s.months[L]}の売上は前月より ${fmtPct(Math.abs(m.sales.momPct))} 減りました`,
      `${s.months[L - 1]} ${fmtMan(m.sales.mom)}万円 → ${s.months[L]} ${fmtMan(m.sales.now)}万円。`, "一時的な要因（工期・入社時期のずれ）かを確認する");
  // 4. 原価率
  {
    const cr = sm.costRate, pr = sm.costRatePrev, planCr = (s.target.cost / s.target.sales) * 100;
    const up = pr != null && cr - pr > 1;
    add(up ? "warn" : "info", `原価率は ${fmtPct(cr)}（${pr != null ? "前年 " + fmtPct(pr) + "、" : ""}計画 ${fmtPct(planCr)}）`,
      `原価の内訳は、資材費が売上の ${fmtPct(sm.costBreakdown[0].ofSales)}、人件費が売上の ${fmtPct(sm.costBreakdown[1].ofSales)} です。`,
      up ? "原価率が上がった費目（資材か人件費）を特定し、単価の見直しか発注の見直しをする" : "この水準を保てるよう、費目ごとの月次の確認を続ける");
  }
  // 5. 人件費の伸びと売上の伸び
  {
    const ly = m.labor.cumYoyPct, sy = m.sales.cumYoyPct;
    if (ly != null && sy != null && ly - sy > 5)
      add("warn", "人件費が売上より速く増えています", `人件費は前年比 ${fmtPct(ly, { sign: true })}、売上は前年比 ${fmtPct(sy, { sign: true })} です。`, "稼働の配分（高い生産性の担当への寄せ方）を担当者別で確認する");
    const my = m.materials.cumYoyPct;
    if (my != null && sy != null && my - sy > 5)
      add("warn", "資材費が売上より速く増えています", `資材費は前年比 ${fmtPct(my, { sign: true })}、売上は前年比 ${fmtPct(sy, { sign: true })} です。`, "仕入れ先の単価と発注量を見直す");
  }
  // 6. 利益
  {
    const pf = m.profit.forecast, pt = m.profit.target;
    add(m.profit.diff >= 0 ? "good" : "warn", `累計利益は ${fmtMan(m.profit.cum)}万円（利益率 ${fmtPct(sm.profitRate)}）`,
      `計画 ${fmtMan(m.profit.planCum)}万円に対して ${fmtMan(m.profit.diff, { sign: true })}万円。年間の見込みは ${fmtMan(pf)}万円で、利益目標 ${fmtMan(pt)}万円に対して ${fmtMan(pf - pt, { sign: true })}万円です。`,
      m.profit.diff >= 0 ? "利益を生んでいる案件・担当の共通点を、次の受注に生かす" : "売上の底上げか原価の圧縮か、どちらが効くかを計画との差で判断する");
  }
  // 7. 直近3か月の傾向
  if (L >= 5) {
    const r = sumRange(s.sales, L - 2, L), p = sumRange(s.sales, L - 5, L - 3), ch = C.pctChange(r, p);
    if (ch != null) add(ch >= 0 ? "info" : "warn", `直近3か月の売上は、その前の3か月より ${fmtPct(Math.abs(ch))} ${ch >= 0 ? "増えています" : "減っています"}`,
      `${s.months[L - 2]}〜${s.months[L]}：${fmtMan(r)}万円、${s.months[L - 5]}〜${s.months[L - 3]}：${fmtMan(p)}万円。`, "季節の波かどうかを、前年の同じ時期と見比べて確認する");
  }
  return out;
}

/** 全体のときだけ出す、事業間の気づき。 */
export function bizInsights(data, overrides) {
  const comp = C.composition(data, overrides), out = [];
  const top = [...comp.parts].sort((a, b) => b.profitPct - a.profitPct)[0];
  const lowRate = [...comp.parts].sort((a, b) => (a.profit / a.sales) - (b.profit / b.sales))[0];
  out.push({ level: "info", title: `${top.name}が、利益の ${fmtPct(top.profitPct)} を生んでいます`,
    detail: comp.parts.map(p => `${p.name}：売上 ${fmtMan(p.sales)}万円（${fmtPct(p.salesPct)}）、利益 ${fmtMan(p.profit)}万円（${fmtPct(p.profitPct)}）`).join("／"),
    action: "売上の割合と利益の割合が大きく違う事業は、原価か単価に偏りがないかを確認する" });
  const prog = data.businesses.map(b => { const sm = C.summarize(C.buildScope(data, b.id, overrides)); return { n: b.name, p: sm.metrics.sales.progress, plan: sm.metrics.sales.planProgress }; });
  const late = prog.filter(x => x.p < x.plan - 0.5);
  if (late.length) out.push({ level: "warn", title: `${late.map(x => x.n).join("・")}の売上進捗が、計画線より遅れています`,
    detail: late.map(x => `${x.n}：進捗 ${fmtPct(x.p)}（計画どおりなら ${fmtPct(x.plan)}）`).join("／"), action: "遅れている事業の見込み案件を、先に確認する" });
  void lowRate;
  return out;
}
