/**
 * Reversal Engine — 전환 지표 분석 엔진
 * 
 * 1. Feature 계산 (수익률, 이동평균 괴리, 변화율)
 * 2. 룰 기반 전환 판정 (TOP/BOTTOM CANDIDATE)
 * 3. 점수 산출 및 단계(Stage) 결정
 * 4. 백테스트 과거 사례 매칭
 */

import { createLogger } from "../logger";
import { prisma } from "../server";
import { collectAllIndicators, type DailyIndicatorRow } from "./market-indicators";

const logger = createLogger("reversal-engine");

// ─── Types ───

interface ReversalFeatures {
  date: string;
  return5d: number;
  return10d: number;
  return20d: number;
  vxnChange3d: number;
  vxnVs20dma: number;
  hyOasChange5d: number;
  hyOasPercentile: number;
  dgs2Change5d: number;
  dgs2Vs20dma: number;
  yieldCurve: number;
  yieldCurveChange5d: number;
  soxReturn5d: number;
  soxRelativeStrength5d: number;
  soxVs50dma: number;
  volumeVs20dma: number;
  vixChange3d: number;
  dxyChange5d: number;
  wtiChange5d: number;
}

interface SignalBreakdown {
  name: string;
  score: number;
  maxScore: number;
  description: string;
  triggered: boolean;
}

export interface ReversalResult {
  date: string;
  signalType: "TOP_CANDIDATE" | "BOTTOM_CANDIDATE";
  score: number;
  stage: "OBSERVE" | "WARN" | "CONFIRMED";
  coreSignals: SignalBreakdown[];
  supportSignals: SignalBreakdown[];
  explanation: string;
  riskTheme: string;
  confidence: number;
  strategicAction: {
    short: string;
    long: string;
    color: string;
  };
  features: ReversalFeatures;
  chartData: DailyIndicatorRow[];
  backtestStats: {
    sampleCount: number;
    winRate5d: number;
    avgReturn5d: number;
    avgReturn10d: number;
    avgReturn20d: number;
  };
}

// ─── Feature Calculation ───

function sma(values: number[], period: number): number {
  if (values.length < period) return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function pctChange(current: number, previous: number): number {
  if (previous === 0) return 0;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function percentileRank(value: number, history: number[]): number {
  const sorted = [...history].sort((a, b) => a - b);
  const rank = sorted.findIndex((v) => v >= value);
  return rank >= 0 ? (rank / sorted.length) * 100 : 100;
}

function computeFeatures(bars: DailyIndicatorRow[]): ReversalFeatures | null {
  if (bars.length < 5) return null;

  const latest = bars[bars.length - 1];
  const idx = bars.length - 1;

  // Returns
  const return5d = pctChange(bars[idx].nasdaqClose, bars[Math.max(0, idx - 5)]?.nasdaqClose || bars[idx].nasdaqClose);
  const return10d = pctChange(bars[idx].nasdaqClose, bars[Math.max(0, idx - 10)]?.nasdaqClose || bars[idx].nasdaqClose);
  const return20d = pctChange(bars[idx].nasdaqClose, bars[Math.max(0, idx - 20)]?.nasdaqClose || bars[idx].nasdaqClose);

  // VXN
  const vxnValues = bars.map((b) => b.vxnClose);
  const vxnChange3d = pctChange(latest.vxnClose, bars[Math.max(0, idx - 3)]?.vxnClose || latest.vxnClose);
  const vxn20dma = sma(vxnValues, 20);
  const vxnVs20dma = vxn20dma > 0 ? ((latest.vxnClose - vxn20dma) / vxn20dma) * 100 : 0;

  // HY OAS
  const hyOasValues = bars.map((b) => b.hyOas);
  const hyOasChange5d = pctChange(latest.hyOas, bars[Math.max(0, idx - 5)]?.hyOas || latest.hyOas);
  const hyOasPercentile = percentileRank(latest.hyOas, hyOasValues);

  // DGS2
  const dgs2Values = bars.map((b) => b.dgs2);
  const dgs2Change5d = pctChange(latest.dgs2, bars[Math.max(0, idx - 5)]?.dgs2 || latest.dgs2);
  const dgs2_20dma = sma(dgs2Values, 20);
  const dgs2Vs20dma = dgs2_20dma > 0 ? ((latest.dgs2 - dgs2_20dma) / dgs2_20dma) * 100 : 0;

  // Yield Curve (10Y-2Y)
  const yieldCurve = latest.yieldCurve;
  const yieldCurveChange5d = pctChange(latest.yieldCurve, bars[Math.max(0, idx - 5)]?.yieldCurve || latest.yieldCurve);

  // SOX
  const soxReturn5d = pctChange(latest.soxClose, bars[Math.max(0, idx - 5)]?.soxClose || latest.soxClose);
  const soxRelativeStrength5d = return5d !== 0 ? soxReturn5d / Math.abs(return5d) : 1;
  const soxValues = bars.map((b) => b.soxClose);
  const sox50dma = sma(soxValues, Math.min(50, soxValues.length));
  const soxVs50dma = sox50dma > 0 ? ((latest.soxClose - sox50dma) / sox50dma) * 100 : 0;

  // Volume
  const volValues = bars.map((b) => b.nasdaqVol);
  const vol20dma = sma(volValues, 20) || volValues[volValues.length - 1] || 1;
  const volumeVs20dma = vol20dma > 0 ? latest.nasdaqVol / vol20dma : 1;

  // VIX, DXY, WTI
  const vixChange3d = pctChange(latest.vixClose, bars[Math.max(0, idx - 3)]?.vixClose || latest.vixClose);
  const dxyChange5d = pctChange(latest.dxyClose, bars[Math.max(0, idx - 5)]?.dxyClose || latest.dxyClose);
  const wtiChange5d = pctChange(latest.wtiClose, bars[Math.max(0, idx - 5)]?.wtiClose || latest.wtiClose);

  return {
    date: latest.date,
    return5d, return10d, return20d,
    vxnChange3d, vxnVs20dma,
    hyOasChange5d, hyOasPercentile,
    dgs2Change5d, dgs2Vs20dma,
    yieldCurve, yieldCurveChange5d,
    soxReturn5d, soxRelativeStrength5d, soxVs50dma,
    volumeVs20dma,
    vixChange3d, dxyChange5d, wtiChange5d,
  };
}

// ─── Rule Engine ───

function evaluateTopCandidate(f: ReversalFeatures): { core: SignalBreakdown[]; support: SignalBreakdown[] } {
  const core: SignalBreakdown[] = [
    {
      name: "VXN 재상승",
      maxScore: 25,
      score: f.vxnChange3d > 5 ? 25 : f.vxnChange3d > 2 ? 15 : f.vxnChange3d > 0 ? 8 : 0,
      description: `VXN 3일 변화율 ${f.vxnChange3d.toFixed(1)}%${f.vxnVs20dma > 0 ? ", 20DMA 상회" : ""}`,
      triggered: f.vxnChange3d > 2,
    },
    {
      name: "HY OAS 확대",
      maxScore: 20,
      score: f.hyOasChange5d > 5 ? 20 : f.hyOasChange5d > 2 ? 14 : f.hyOasChange5d > 0 ? 6 : 0,
      description: `하이일드 스프레드 5일 변화 ${f.hyOasChange5d.toFixed(1)}% (상위 ${f.hyOasPercentile.toFixed(0)}%)`,
      triggered: f.hyOasChange5d > 2,
    },
    {
      name: "DGS2 상승",
      maxScore: 15,
      score: f.dgs2Change5d > 3 ? 15 : f.dgs2Change5d > 1 ? 10 : f.dgs2Change5d > 0 ? 4 : 0,
      description: `2년물 금리 5일 변화 ${f.dgs2Change5d.toFixed(1)}%`,
      triggered: f.dgs2Change5d > 1,
    },
    {
      name: "SOX 리더십 약화",
      maxScore: 20,
      score: f.soxRelativeStrength5d < 0.8 ? 20 : f.soxRelativeStrength5d < 1.0 ? 12 : f.soxRelativeStrength5d < 1.1 ? 4 : 0,
      description: `SOX 상대강도 ${f.soxRelativeStrength5d.toFixed(2)}x${f.soxVs50dma < 0 ? ", 50DMA 하회" : ""}`,
      triggered: f.soxRelativeStrength5d < 1.0,
    },
  ];

  const support: SignalBreakdown[] = [
    {
      name: "VIX 급등",
      maxScore: 5,
      score: f.vixChange3d > 10 ? 5 : f.vixChange3d > 5 ? 3 : f.vixChange3d > 0 ? 1 : 0,
      description: `VIX 3일 변화 ${f.vixChange3d.toFixed(1)}%`,
      triggered: f.vixChange3d > 5,
    },
    {
      name: "DXY 강세",
      maxScore: 3,
      score: f.dxyChange5d > 1 ? 3 : f.dxyChange5d > 0.3 ? 2 : 0,
      description: `달러 인덱스 5일 변화 ${f.dxyChange5d.toFixed(1)}%`,
      triggered: f.dxyChange5d > 0.3,
    },
    {
      name: "WTI 위험",
      maxScore: 2,
      score: f.wtiChange5d < -3 ? 2 : f.wtiChange5d < -1 ? 1 : 0,
      description: `원유 5일 변화 ${f.wtiChange5d.toFixed(1)}%`,
      triggered: f.wtiChange5d < -1,
    },
    {
      name: "거래량 폭발",
      maxScore: 4,
      score: f.volumeVs20dma > 1.5 ? 4 : f.volumeVs20dma > 1.2 ? 2 : 0,
      description: `거래량/20DMA ${f.volumeVs20dma.toFixed(2)}x`,
      triggered: f.volumeVs20dma > 1.2,
    },
    {
      name: "Yield Curve",
      maxScore: 6,
      score: f.yieldCurve < 0 ? 6 : f.yieldCurve < 0.2 ? 3 : 0,
      description: `장단기 금리차 ${f.yieldCurve.toFixed(2)}% (역전 시 위험)`,
      triggered: f.yieldCurve < 0,
    }
  ];

  return { core, support };
}

function evaluateBottomCandidate(f: ReversalFeatures): { core: SignalBreakdown[]; support: SignalBreakdown[] } {
  const core: SignalBreakdown[] = [
    {
      name: "VXN 둔화",
      maxScore: 25,
      score: f.vxnChange3d < -5 ? 25 : f.vxnChange3d < -2 ? 18 : f.vxnChange3d < 0 ? 8 : 0,
      description: `VXN 3일 변화율 ${f.vxnChange3d.toFixed(1)}%${f.vxnVs20dma < 0 ? ", 20DMA 하회 전환" : ""}`,
      triggered: f.vxnChange3d < -2,
    },
    {
      name: "HY OAS 축소",
      maxScore: 20,
      score: f.hyOasChange5d < -3 ? 20 : f.hyOasChange5d < -1 ? 14 : f.hyOasChange5d < 0 ? 6 : 0,
      description: `하이일드 스프레드 5일 변화 ${f.hyOasChange5d.toFixed(1)}%`,
      triggered: f.hyOasChange5d < -1,
    },
    {
      name: "DGS2 안정/하락",
      maxScore: 15,
      score: f.dgs2Change5d < -2 ? 15 : f.dgs2Change5d < 0 ? 10 : f.dgs2Change5d < 1 ? 4 : 0,
      description: `2년물 금리 5일 변화 ${f.dgs2Change5d.toFixed(1)}%`,
      triggered: f.dgs2Change5d < 0,
    },
    {
      name: "SOX 리더십 개선",
      maxScore: 20,
      score: f.soxRelativeStrength5d > 1.3 ? 20 : f.soxRelativeStrength5d > 1.1 ? 14 : f.soxRelativeStrength5d > 1.0 ? 6 : 0,
      description: `SOX 상대강도 ${f.soxRelativeStrength5d.toFixed(2)}x`,
      triggered: f.soxRelativeStrength5d > 1.1,
    },
  ];

  const support: SignalBreakdown[] = [
    {
      name: "VIX 둔화",
      maxScore: 6,
      score: f.vixChange3d < -5 ? 6 : f.vixChange3d < -2 ? 4 : f.vixChange3d < 0 ? 1 : 0,
      description: `VIX 3일 변화 ${f.vixChange3d.toFixed(1)}%`,
      triggered: f.vixChange3d < -2,
    },
    {
      name: "DXY 약세",
      maxScore: 6,
      score: f.dxyChange5d < -1 ? 6 : f.dxyChange5d < -0.3 ? 3 : 0,
      description: `달러 인덱스 5일 변화 ${f.dxyChange5d.toFixed(1)}%`,
      triggered: f.dxyChange5d < -0.3,
    },
    {
      name: "WTI 반등",
      maxScore: 4,
      score: f.wtiChange5d > 2 ? 4 : f.wtiChange5d > 0 ? 2 : 0,
      description: `원유 5일 변화 ${f.wtiChange5d.toFixed(1)}%`,
      triggered: f.wtiChange5d > 0,
    },
    {
      name: "거래량 확대",
      maxScore: 4,
      score: f.volumeVs20dma > 1.3 ? 4 : f.volumeVs20dma > 1.1 ? 2 : 0,
      description: `거래량/20DMA ${f.volumeVs20dma.toFixed(2)}x`,
      triggered: f.volumeVs20dma > 1.1,
    },
    {
      name: "Yield Curve",
      maxScore: 6,
      score: f.yieldCurve > 0 ? 6 : f.yieldCurve > -0.1 ? 3 : 0,
      description: `장단기 금리차 ${f.yieldCurve.toFixed(2)}% (정상화 시 시그널)`,
      triggered: f.yieldCurve > 0,
    }
  ];

  return { core, support };
}

function determineStage(score: number): "OBSERVE" | "WARN" | "CONFIRMED" {
  if (score >= 70) return "CONFIRMED";
  if (score >= 50) return "WARN";
  return "OBSERVE";
}

function determineRiskTheme(coreSignals: SignalBreakdown[]): string {
  const maxSignal = coreSignals.reduce((max, s) => (s.score > max.score ? s : max), coreSignals[0]);
  if (maxSignal.name.includes("VXN") || maxSignal.name.includes("VIX")) return "volatility";
  if (maxSignal.name.includes("HY OAS")) return "credit";
  if (maxSignal.name.includes("DGS2")) return "rate";
  if (maxSignal.name.includes("SOX")) return "leadership";
  return "mixed";
}

function generateExplanation(signalType: string, stage: string, score: number, core: SignalBreakdown[]): string {
  const triggered = core.filter((s) => s.triggered);
  const drivers = triggered.map((s) => s.name).join(", ");

  if (signalType === "TOP_CANDIDATE") {
    if (stage === "CONFIRMED") return `나스닥 하락 전환이 확인되었습니다. 주요 요인: ${drivers}. 익절 및 비중 축소를 적극 검토하세요.`;
    if (stage === "WARN") return `하락 전환 경고 단계입니다. ${drivers} 신호가 감지되었습니다. 신규 진입을 자제하고 기존 포지션을 점검하세요.`;
    return `하락 전환 관찰 단계입니다. 일부 지표에서 약화 신호가 보이고 있습니다.`;
  } else {
    if (stage === "CONFIRMED") return `상승 전환이 확인되었습니다. 주요 요인: ${drivers}. 점진적 비중 확대를 검토하세요.`;
    if (stage === "WARN") return `상승 전환 가능성이 높아지고 있습니다. ${drivers}가 개선되고 있습니다.`;
    return `상승 전환 관찰 단계입니다. 일부 지표에서 개선 신호가 보이고 있습니다.`;
  }
}

export function determineStrategicAction(signalType: string, score: number): ReversalResult["strategicAction"] {
  if (signalType === "BOTTOM_CANDIDATE") {
    if (score >= 70) return { short: "AGGRESSIVE_BUY", long: "상승 전환 확정: 공격적인 매수 및 비중 확대 구간입니다.", color: "var(--accent-up)" };
    if (score >= 40) return { short: "LAYER_IN", long: "상승 신호 강화: 1~2차 분할 매수를 시작하기에 적합한 시점입니다.", color: "#34d399" };
    return { short: "WAIT_FOR_SIGNAL", long: "바닥 다지기 관찰: 추가적인 신호 개선을 기다리며 관망하세요.", color: "var(--text-muted)" };
  } else {
    if (score >= 70) return { short: "AGGR_REDUCE", long: "하락 전환 확정: 전량 매도 혹은 인버스 비중 확대를 강력 권고합니다.", color: "var(--accent-down)" };
    if (score >= 40) return { short: "LAYER_OUT", long: "리스크 관리: 수익권 종목의 분할 익절 및 현금 비중 확보를 시작하세요.", color: "#fbbf24" };
    return { short: "TRAILING_STOP", long: "과열 주의: 추세는 살아있으나 추적 손절가를 상향 조정하며 대응하세요.", color: "var(--text-muted)" };
  }
}

// ─── Backtest (simplified) ───

function runSimpleBacktest(bars: DailyIndicatorRow[], signalType: string): ReversalResult["backtestStats"] {
  // Simplified: find historical dates where similar conditions existed
  const cases: { return5d: number; return10d: number; return20d: number }[] = [];
  
  const minBars = Math.min(25, bars.length - 1);
  for (let i = minBars; i < bars.length - 20; i++) {
    const r20 = pctChange(bars[i].nasdaqClose, bars[Math.max(0, i - 20)].nasdaqClose);
    const isTop = signalType === "TOP_CANDIDATE" && r20 >= 5;
    const isBottom = signalType === "BOTTOM_CANDIDATE" && r20 <= -5;

    if (isTop || isBottom) {
      if (i + 20 < bars.length) {
        cases.push({
          return5d: pctChange(bars[i + 5]?.nasdaqClose || bars[i].nasdaqClose, bars[i].nasdaqClose),
          return10d: pctChange(bars[i + 10]?.nasdaqClose || bars[i].nasdaqClose, bars[i].nasdaqClose),
          return20d: pctChange(bars[i + 20]?.nasdaqClose || bars[i].nasdaqClose, bars[i].nasdaqClose),
        });
      }
    }
  }

  if (cases.length === 0) {
    return { sampleCount: 0, winRate5d: 0, avgReturn5d: 0, avgReturn10d: 0, avgReturn20d: 0 };
  }

  const winDirection = signalType === "BOTTOM_CANDIDATE" ? 1 : -1; // Bottom→expect up, Top→expect down
  const wins5d = cases.filter((c) => c.return5d * winDirection > 0).length;

  return {
    sampleCount: cases.length,
    winRate5d: (wins5d / cases.length) * 100,
    avgReturn5d: cases.reduce((s, c) => s + c.return5d, 0) / cases.length,
    avgReturn10d: cases.reduce((s, c) => s + c.return10d, 0) / cases.length,
    avgReturn20d: cases.reduce((s, c) => s + c.return20d, 0) / cases.length,
  };
}

// ─── Main Analysis ───

export async function analyzeReversal(): Promise<ReversalResult> {
  logger.info("전환 지표 분석 시작");

  // 1. Collect data
  const bars = await collectAllIndicators(90);
  if (bars.length < 5) {
    throw new Error("시장 데이터가 충분하지 않습니다 (최소 5일 필요)");
  }

  // 2. Compute features
  const features = computeFeatures(bars);
  if (!features) {
    throw new Error("Feature 계산 실패");
  }

  // 3. Evaluate both directions
  const topEval = evaluateTopCandidate(features);
  const bottomEval = evaluateBottomCandidate(features);

  const topScore = [...topEval.core, ...topEval.support].reduce((s, x) => s + x.score, 0);
  const bottomScore = [...bottomEval.core, ...bottomEval.support].reduce((s, x) => s + x.score, 0);

  // 4. Choose dominant signal
  const isTop = topScore >= bottomScore;
  const signalType = isTop ? "TOP_CANDIDATE" : "BOTTOM_CANDIDATE";
  const score = isTop ? topScore : bottomScore;
  const coreSignals = isTop ? topEval.core : bottomEval.core;
  const supportSignals = isTop ? topEval.support : bottomEval.support;
  const stage = determineStage(score);
  const riskTheme = determineRiskTheme(coreSignals);
  const explanation = generateExplanation(signalType, stage, score, coreSignals);
  const strategicAction = determineStrategicAction(signalType, score);

  // 5. Backtest
  const backtestStats = runSimpleBacktest(bars, signalType);
  const confidence = backtestStats.sampleCount > 5 ? Math.min(90, backtestStats.winRate5d) : 30;

  // 6. Save to DB
  await prisma.reversalSignal.create({
    data: {
      date: new Date(features.date),
      signalType,
      score,
      stage,
      coreSignals: JSON.stringify(coreSignals),
      supportSignals: JSON.stringify(supportSignals),
      explanation,
      riskTheme,
      confidence,
      return5d: features.return5d,
      return10d: features.return10d,
      return20d: features.return20d,
      vxnChange3d: features.vxnChange3d,
      vxnVs20dma: features.vxnVs20dma,
      hyOasChange5d: features.hyOasChange5d,
      hyOasPercentile: features.hyOasPercentile,
      dgs2Change5d: features.dgs2Change5d,
      soxRelStr5d: features.soxRelativeStrength5d,
      volumeVs20dma: features.volumeVs20dma,
    },
  });

  // Save indicator bars
  for (const bar of bars) {
    await prisma.marketIndicatorBar.upsert({
      where: { date: new Date(bar.date) },
      update: { ...bar, date: new Date(bar.date) },
      create: { ...bar, date: new Date(bar.date) },
    });
  }

  logger.info(`전환 분석 완료: ${signalType} score=${score} stage=${stage}`);

  return {
    date: features.date,
    signalType: signalType as "TOP_CANDIDATE" | "BOTTOM_CANDIDATE",
    score,
    stage,
    coreSignals,
    supportSignals,
    explanation,
    riskTheme,
    confidence,
    strategicAction,
    features,
    chartData: bars.slice(-60), // Last 60 days for chart
    backtestStats,
  };
}
