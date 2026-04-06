/**
 * Market Indicators Collector — 시장 전환 지표 데이터 수집
 * 
 * FRED API: HY OAS, DGS2, VIX
 * Alpha Vantage: Nasdaq (QQQ), SOX (SOXX), DXY (UUP), WTI (USO)
 * Yahoo Finance fallback: VXN
 */

import axios from "axios";
import { createLogger } from "../logger";

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
    return []; // Return empty instead of demo
  }
}

// ─── Alpha Vantage ───

const avCache = new Map<string, { timestamp: number; data: { date: string; close: number; volume: number }[] }>();

async function fetchAVDaily(
  symbol: string,
  limit: number = 120
): Promise<{ date: string; close: number; volume: number }[]> {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;

  // Check cache first (valid for 1 hour)
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
    return []; // No more demo data
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
  soxClose: number;
  sourceStatus: string;
}

export async function collectAllIndicators(days: number = 60): Promise<DailyIndicatorRow[]> {
  logger.info(`시장 지표 수집 시작 (${days}일)`);

  // Rate-limit aware sequential fetches
  const [nasdaq, sox, dxy, wti] = await Promise.all([
    fetchAVDaily("QQQ", days),
    fetchAVDaily("SOXX", days),
    fetchAVDaily("UUP", days),
    fetchAVDaily("USO", days),
  ]);

  // FRED data (no rate limit concerns)
  const [vixData, hyOasData, dgs2Data] = await Promise.all([
    fetchFredSeries("VIXCLS", days),
    fetchFredSeries("BAMLH0A0HYM2", days),
    fetchFredSeries("DGS2", days),
  ]);

  // VXN — use FRED VXNCLS if available, else estimate from VIX
  const vxnData = await fetchFredSeries("VXNCLS", days).catch(() => []);

  // Build date-indexed maps
  const nasdaqMap = new Map(nasdaq.map((r) => [r.date, r]));
  const soxMap = new Map(sox.map((r) => [r.date, r]));
  const dxyMap = new Map(dxy.map((r) => [r.date, r]));
  const wtiMap = new Map(wti.map((r) => [r.date, r]));
  const vixMap = new Map(vixData.map((r) => [r.date, r.value]));
  const vxnMap = new Map(vxnData.map((r) => [r.date, r.value]));
  const hyOasMap = new Map(hyOasData.map((r) => [r.date, r.value]));
  const dgs2Map = new Map(dgs2Data.map((r) => [r.date, r.value]));

  // Use nasdaq dates as reference
  const allDates = nasdaq.map((r) => r.date);

  // Forward-fill helper
  let lastVix = 0, lastVxn = 0, lastDxy = 0, lastWti = 0, lastHyOas = 0, lastDgs2 = 0, lastSox = 0;

  const rows: DailyIndicatorRow[] = allDates.map((date) => {
    const nq = nasdaqMap.get(date);
    const sx = soxMap.get(date);
    const dx = dxyMap.get(date);
    const wt = wtiMap.get(date);

    const vix = vixMap.get(date) ?? lastVix;
    const vxn = vxnMap.get(date) ?? lastVxn;
    const hy = hyOasMap.get(date) ?? lastHyOas;
    const dg = dgs2Map.get(date) ?? lastDgs2;

    lastVix = vix;
    lastVxn = vxn;
    lastHyOas = hy;
    lastDgs2 = dg;
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
      vxnClose: vxn || vix * 1.15, // VXN fallback: approximate from VIX
      dxyClose: dx?.close ?? lastDxy,
      wtiClose: wt?.close ?? lastWti,
      hyOas: hy,
      dgs2: dg,
      soxClose: sx?.close ?? lastSox,
      sourceStatus: missing.length === 0 ? "ok" : missing.length <= 2 ? "partial" : "stale",
    };
  });

  if (rows.length === 0 || (rows.length > 0 && rows[rows.length - 1].nasdaqClose === 0)) {
     logger.warn("핵심 데이터(NASDAQ)가 없어 분석을 수행할 수 없습니다.");
     return [];
  }

  logger.info(`시장 지표 수집 완료: ${rows.length}일`);
  return rows;
}
