/**
 * Alpha Vantage Service — 가격/거래량 데이터 조회 및 이상 감지
 */

import axios from "axios";
import { createLogger } from "../logger";

const logger = createLogger("alpha-vantage");

const API_KEY = process.env.ALPHA_VANTAGE_API_KEY || "demo";
const BASE_URL = "https://www.alphavantage.co/query";

export interface PriceBar {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface VolumeAnomaly {
  detected: boolean;
  currentVolume: number;
  averageVolume: number;
  ratio: number;
}

export interface TrendBreak {
  detected: boolean;
  currentPrice: number;
  sma50: number;
  sma200: number;
  description: string;
}

/**
 * 일봉 가격 히스토리 조회 (최근 100일)
 */
export async function fetchDailyPrices(ticker: string): Promise<PriceBar[]> {
  try {
    const res = await axios.get(BASE_URL, {
      params: {
        function: "TIME_SERIES_DAILY",
        symbol: ticker,
        outputsize: "compact",
        apikey: API_KEY,
      },
      timeout: 10000,
    });

    const timeSeries = res.data["Time Series (Daily)"];
    if (!timeSeries) {
      logger.warn(`No price data for ${ticker}. Response: ${JSON.stringify(res.data).slice(0, 200)}`);
      return [];
    }

    const bars: PriceBar[] = Object.entries(timeSeries)
      .map(([date, values]: [string, any]) => ({
        time: date,
        open: parseFloat(values["1. open"]),
        high: parseFloat(values["2. high"]),
        low: parseFloat(values["3. low"]),
        close: parseFloat(values["4. close"]),
        volume: parseInt(values["5. volume"], 10),
      }))
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

    logger.info(`${ticker}: ${bars.length}일 가격 데이터 조회 완료`);
    return bars;
  } catch (err) {
    logger.error(`Alpha Vantage 조회 실패 (${ticker}):`, err);
    return [];
  }
}

/**
 * 거래량 이상 감지 (20일 평균 대비)
 */
export function detectVolumeAnomaly(bars: PriceBar[], threshold: number = 2.0): VolumeAnomaly {
  if (bars.length < 21) return { detected: false, currentVolume: 0, averageVolume: 0, ratio: 0 };

  const currentVolume = bars[0].volume;
  const avg20 = bars.slice(1, 21).reduce((sum, b) => sum + b.volume, 0) / 20;
  const ratio = avg20 > 0 ? currentVolume / avg20 : 0;

  return {
    detected: ratio >= threshold,
    currentVolume,
    averageVolume: Math.round(avg20),
    ratio: Math.round(ratio * 100) / 100,
  };
}

/**
 * 추세 이탈 감지 (SMA 50/200)
 */
export function detectTrendBreak(bars: PriceBar[]): TrendBreak {
  if (bars.length < 50) {
    return { detected: false, currentPrice: bars[0]?.close || 0, sma50: 0, sma200: 0, description: "데이터 부족" };
  }

  const currentPrice = bars[0].close;
  const sma50 = bars.slice(0, 50).reduce((s, b) => s + b.close, 0) / 50;
  const sma200 = bars.length >= 200
    ? bars.slice(0, 200).reduce((s, b) => s + b.close, 0) / 200
    : 0;

  const belowSma50 = currentPrice < sma50;
  const belowSma200 = sma200 > 0 && currentPrice < sma200;

  let description = "추세 정상";
  let detected = false;

  if (belowSma50 && belowSma200) {
    description = "50일·200일 이동평균 모두 하회 — 강한 하락 추세";
    detected = true;
  } else if (belowSma50) {
    description = "50일 이동평균 하회 — 단기 약세 신호";
    detected = true;
  }

  return {
    detected,
    currentPrice: Math.round(currentPrice * 100) / 100,
    sma50: Math.round(sma50 * 100) / 100,
    sma200: Math.round(sma200 * 100) / 100,
    description,
  };
}
