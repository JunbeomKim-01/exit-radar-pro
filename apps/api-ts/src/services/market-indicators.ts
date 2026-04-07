/**
 * Market Indicators Collector — 시장 전환 지표 데이터 수집
 * 
 * FRED API: HY OAS, DGS2, VIX
 * Alpha Vantage: Nasdaq (QQQ), SOX (SOXX), DXY (UUP), WTI (USO)
 * Yahoo Finance fallback: VXN
 */

import axios from "axios";
import { createLogger } from "../logger";
import { prisma } from "../server";

const logger = createLogger("market-indicators");

const FRED_BASE = "https://api.stlouisfed.org/fred/series/observations";
const AV_BASE = "https://www.alphavantage.co/query";

// ─── FRED API ───

interface FredObservation {
  date: string;
  value: string;
}

async function fetchFredSeries(
  seriesId: string,
  limit: number = 120
): Promise<{ date: string; value: number }[]> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) {
    logger.error(`FRED_API_KEY not set — Cannot fetch real data for ${seriesId}`);
    throw new Error(`API_KEY_MISSING: FRED_API_KEY`);
  }

  try {
    const res = await axios.get(FRED_BASE, {
      params: {
        series_id: seriesId,
        api_key: apiKey,
        file_type: "json",
        sort_order: "desc",
        limit,
      },
      timeout: 10000,
    });

    const observations: FredObservation[] = res.data?.observations || [];
    return observations
      .filter((o) => o.value !== ".")
      .map((o) => ({ date: o.date, value: parseFloat(o.value) }))
      .reverse();
  } catch (err) {
    logger.error(`FRED ${seriesId} fetch failed:`, err);
    return [];
  }
}

// ─── Alpha Vantage ───

const avCache = new Map<string, { timestamp: number; data: { date: string; close: number; volume: number }[] }>();

async function fetchAVDaily(
  symbol: string,
  limit: number = 120
): Promise<{ date: string; close: number; volume: number }[]> {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;

  const cached = avCache.get(symbol);
  if (cached && Date.now() - cached.timestamp < 1000 * 60 * 60) {
    logger.info(`AV ${symbol} used cached data`);
    return cached.data;
  }

  if (!apiKey) {
    logger.error(`ALPHA_VANTAGE_API_KEY not set — Cannot fetch ${symbol}`);
    throw new Error(`API_KEY_MISSING: ALPHA_VANTAGE_API_KEY`);
  }

  try {
    const res = await axios.get(AV_BASE, {
      params: {
        function: "TIME_SERIES_DAILY",
        symbol,
        apikey: apiKey,
        outputsize: "compact",
      },
      timeout: 15000,
    });

    const timeSeries = res.data?.["Time Series (Daily)"] || {};
    const entries = Object.entries(timeSeries)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, limit)
      .map(([date, bar]: [string, any]) => ({
        date,
        close: parseFloat(bar["4. close"]),
        volume: parseFloat(bar["5. volume"]),
      }))
      .reverse();

    if (entries.length === 0) {
       logger.warn(`AV returned empty for ${symbol}. Check API Key or Symbol.`);
       return [];
    }

    avCache.set(symbol, { timestamp: Date.now(), data: entries });
    return entries;
  } catch (err) {
    logger.error(`AV ${symbol} fetch failed:`, err);
    return [];
  }
}

// ─── Main Collector ───

export interface DailyIndicatorRow {
  date: string;
  nasdaqClose: number;
  nasdaqVol: number;
  vixClose: number;
  vxnClose: number;
  dxyClose: number;
  wtiClose: number;
  hyOas: number;
  dgs2: number;
  yieldCurve: number;
  soxClose: number;
  sourceStatus: string;
}

export async function collectAllIndicators(days: number = 60): Promise<DailyIndicatorRow[]> {
  logger.info(`시장 지표 수집 시작 (${days}일)`);

  // 0. Fetch existing data for fallback
  const existingBars = await prisma.marketIndicatorBar.findMany({
    orderBy: { date: "desc" },
    take: days,
  });
  const dbData = existingBars.sort((a, b) => a.date.getTime() - b.date.getTime());
  const latestDbDate = dbData.length > 0 ? dbData[dbData.length - 1].date.toISOString().split('T')[0] : null;
  const todayStr = new Date().toISOString().split('T')[0];

  // Performance Optimization: Use cache if today's data exists and enough history
  if (latestDbDate === todayStr && dbData.length >= 5) {
     logger.info("DB에 최신 데이터가 존재합니다. API 호출을 건너뜁니다.");
     return dbData.map(b => ({
       date: b.date.toISOString().split('T')[0],
       nasdaqClose: b.nasdaqClose,
       nasdaqVol: b.nasdaqVol,
       vixClose: b.vixClose,
       vxnClose: b.vxnClose,
       dxyClose: b.dxyClose,
       wtiClose: b.wtiClose,
       hyOas: b.hyOas,
       dgs2: b.dgs2,
       yieldCurve: b.yieldCurve,
       soxClose: b.soxClose,
       sourceStatus: "cached"
     }));
  }

  // 1. Sequential fetches with delay to avoid Alpha Vantage rate limits (5 calls/min)
  let nasdaq: any[] = [];
  let sox: any[] = [];
  let dxy: any[] = [];
  let wti: any[] = [];

  try { 
    nasdaq = await fetchAVDaily("QQQ", days); 
    if (nasdaq.length > 0) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      sox = await fetchAVDaily("SOXX", days);
      await new Promise(resolve => setTimeout(resolve, 1000));
      dxy = await fetchAVDaily("UUP", days);
      await new Promise(resolve => setTimeout(resolve, 1000));
      wti = await fetchAVDaily("USO", days);
    }
  } catch (e) {
    logger.warn("Alpha Vantage 수집 중 일부 실패 발생. 가용한 데이터만 사용합니다.");
  }

  // FRED data
  const [vixData, hyOasData, dgs2Data, yieldCurveData] = await Promise.all([
    fetchFredSeries("VIXCLS", days),
    fetchFredSeries("BAMLH0A0HYM2", days),
    fetchFredSeries("DGS2", days),
    fetchFredSeries("T10Y2Y", days),
  ]);

  const vxnData = await fetchFredSeries("VXNCLS", days).catch(() => []);

  // Use nasdaq dates as reference
  const allDates = nasdaq.map((r) => r.date);
  
  if (allDates.length < 5) {
     // EMERGENCY FALLBACK: If API fails, use DB only
     if (dbData.length >= 5) {
        logger.warn(`API 수집 데이터 부족 (${allDates.length}일). DB 데이터(${dbData.length}일)로 비상 복구합니다.`);
        return dbData.map(b => ({
          date: b.date.toISOString().split('T')[0],
          nasdaqClose: b.nasdaqClose,
          nasdaqVol: b.nasdaqVol,
          vixClose: b.vixClose,
          vxnClose: b.vxnClose,
          dxyClose: b.dxyClose,
          wtiClose: b.wtiClose,
          hyOas: b.hyOas,
          dgs2: b.dgs2,
          yieldCurve: b.yieldCurve,
          soxClose: b.soxClose,
          sourceStatus: "fallback"
        }));
     }
     logger.warn("핵심 데이터(NASDAQ)가 충분하지 않아 분석을 수행할 수 없습니다.");
     return [];
  }

  // Build date-indexed maps
  const nasdaqMap = new Map(nasdaq.map((r) => [r.date, r]));
  const soxMap = new Map(sox.map((r) => [r.date, r]));
  const dxyMap = new Map(dxy.map((r) => [r.date, r]));
  const wtiMap = new Map(wti.map((r) => [r.date, r]));
  const vixMap = new Map(vixData.map((r) => [r.date, r.value]));
  const vxnMap = new Map(vxnData.map((r) => [r.date, r.value]));
  const hyOasMap = new Map(hyOasData.map((r) => [r.date, r.value]));
  const dgs2Map = new Map(dgs2Data.map((r) => [r.date, r.value]));
  const yieldCurveMap = new Map(yieldCurveData.map((r) => [r.date, r.value]));

  // Forward-fill helper
  let lastVix = vixData[0]?.value ?? 0;
  let lastVxn = vxnData[0]?.value ?? lastVix * 1.15;
  let lastHyOas = hyOasData[0]?.value ?? 0;
  let lastDgs2 = dgs2Data[0]?.value ?? 0;
  let lastYieldCurve = yieldCurveData[0]?.value ?? 0;
  let lastSox = sox[0]?.close ?? 0;
  let lastDxy = dxy[0]?.close ?? 0;
  let lastWti = wti[0]?.close ?? 0;

  const rows: DailyIndicatorRow[] = allDates.map((date) => {
    const nq = nasdaqMap.get(date);
    const sx = soxMap.get(date);
    const dx = dxyMap.get(date);
    const wt = wtiMap.get(date);

    const vix = vixMap.get(date) ?? lastVix;
    const vxn = vxnMap.get(date) ?? lastVxn;
    const hy = hyOasMap.get(date) ?? lastHyOas;
    const dg = dgs2Map.get(date) ?? lastDgs2;
    const yc = yieldCurveMap.get(date) ?? lastYieldCurve;

    lastVix = vix;
    lastVxn = vxn;
    lastHyOas = hy;
    lastDgs2 = dg;
    lastYieldCurve = yc;
    if (sx) lastSox = sx.close;
    if (dx) lastDxy = dx.close;
    if (wt) lastWti = wt.close;

    const missing: string[] = [];
    if (!nq) missing.push("nasdaq");
    if (vxn === 0) missing.push("vxn");

    return {
      date,
      nasdaqClose: nq?.close ?? 0,
      nasdaqVol: nq?.volume ?? 0,
      vixClose: vix,
      vxnClose: vxn || vix * 1.15,
      dxyClose: dx?.close ?? lastDxy,
      wtiClose: wt?.close ?? lastWti,
      hyOas: hy,
      dgs2: dg,
      yieldCurve: yc,
      soxClose: sx?.close ?? lastSox,
      sourceStatus: missing.length === 0 ? "ok" : missing.length <= 2 ? "partial" : "stale",
    };
  });

  logger.info(`시장 지표 수집 완료: ${rows.length}일`);
  return rows;
}
