/**
 * EXIT Radar API Client — 레이더 전용 API 호출 함수
 */

import { api } from './api';
import * as MainAPI from './api';

// ─── Types ───
export interface WatchlistItem {
  id: string;
  ticker: string;
  stockId?: string;
  companyName?: string;
  addedAt: string;
  stock?: { id: string; code: string; name: string; market?: string; price?: number };
  risk?: { score: number; level: string; action: string } | null;
  returnRate?: number;
  returnAmount?: number;
  quantity?: number;
  currentValue?: number;
}

export interface RiskSnapshot {
  id: string;
  ticker: string;
  companyName: string;
  score: number;
  level: string;
  action: string;
  summary: string;
  asOf: string;
  factors: RiskFactor[];
}

export interface RiskFactor {
  id: string;
  type: string;
  title: string;
  description: string;
  weight: number;
  detectedAt: string;
}

export interface InsiderTrade {
  id: string;
  ticker: string;
  insiderName: string;
  role: string;
  side: 'BUY' | 'SELL';
  shares: number;
  pricePerShare: number;
  transactionDate: string;
  filingDate: string;
}

export interface PriceBar {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface AlertItem {
  id: string;
  ticker: string;
  title: string;
  body: string;
  level: string;
  read: boolean;
  score: number;
  createdAt: string;
}

export interface InstitutionHolding {
  id: string;
  ticker: string;
  institutionName: string;
  shares: number;
  changeShares: number;
  changePercent: number;
  reportDate: string;
}

export interface PoliticianTrade {
  id: string;
  ticker: string;
  politicianName: string;
  party: string;
  chamber: string;
  side: 'BUY' | 'SELL';
  amountRange: string;
  transactionDate: string;
  filingDate: string;
}

// ─── Watchlist API ───
export async function fetchWatchlist(): Promise<WatchlistItem[]> {
  const res = await api.get<{ success: boolean; data: WatchlistItem[] }>('/watchlist');
  return res.data.data;
}

export async function addToWatchlist(ticker: string, name?: string): Promise<WatchlistItem> {
  const res = await api.post<{ success: boolean; data: WatchlistItem }>('/watchlist', { ticker, name });
  return res.data.data;
}

export async function removeFromWatchlist(ticker: string): Promise<void> {
  await api.delete(`/watchlist/${ticker}`);
}

// ─── Radar API ───
export interface InsightData {
  summary: string;
  alert_level: "info" | "warning" | "danger";
  key_points: string[];
}

export interface TimelineData {
  ticker: string;
  timeline: any[];
}

export interface RatioData {
  supportRatio: number;
  criticizeRatio: number;
  neutralRatio: number;
  postCount: number;
}

export interface PostData {
  posts: any[];
}

export async function fetchRadarFeed(): Promise<RiskSnapshot[]> {
  const res = await api.get<{ success: boolean; data: RiskSnapshot[] }>('/radar/feed');
  return res.data.data;
}

export async function fetchTickerSummary(ticker: string): Promise<RiskSnapshot> {
  const res = await api.get<{ success: boolean; data: RiskSnapshot }>(`/radar/tickers/${ticker}/summary`);
  return res.data.data;
}

export async function fetchTickerSignals(ticker: string): Promise<RiskFactor[]> {
  const res = await api.get<{ success: boolean; data: RiskFactor[] }>(`/radar/tickers/${ticker}/signals`);
  return res.data.data;
}

export async function fetchTickerInsiders(ticker: string, force: boolean = false): Promise<InsiderTrade[]> {
  const res = await api.get<{ success: boolean; data: InsiderTrade[] }>(`/radar/tickers/${ticker}/insiders${force ? '?force=true' : ''}`);
  return res.data.data;
}

export async function fetchTickerInstitutions(ticker: string, force: boolean = false): Promise<InstitutionHolding[]> {
  const res = await api.get<{ success: boolean; data: InstitutionHolding[] }>(`/radar/tickers/${ticker}/institutions${force ? '?force=true' : ''}`);
  return res.data.data;
}

export async function fetchTickerPoliticians(ticker: string, force: boolean = false): Promise<PoliticianTrade[]> {
  const res = await api.get<{ success: boolean; data: PoliticianTrade[] }>(`/radar/tickers/${ticker}/politicians${force ? '?force=true' : ''}`);
  return res.data.data;
}

export async function fetchPriceHistory(ticker: string): Promise<PriceBar[]> {
  const res = await api.get<{ success: boolean; data: PriceBar[] }>(`/radar/tickers/${ticker}/price-history`);
  return res.data.data;
}

export interface FullTickerReport {
  summary: RiskSnapshot;
  signals: RiskFactor[];
  insiders: InsiderTrade[];
  institutions: InstitutionHolding[];
  politicians: PoliticianTrade[];
}

export async function fetchTickerFullReport(ticker: string): Promise<FullTickerReport> {
  const res = await api.get<{ success: boolean; data: FullTickerReport }>(`/radar/tickers/${ticker}/full-report`);
  return res.data.data;
}

export async function refreshTicker(ticker: string): Promise<void> {
  await api.post(`/radar/tickers/${ticker}/refresh`);
}

// ─── Alert API ───
export async function fetchAlerts(unreadOnly: boolean = false): Promise<AlertItem[]> {
  const res = await api.get<{ success: boolean; data: AlertItem[] }>(`/alerts${unreadOnly ? '?unreadOnly=true' : ''}`);
  return res.data.data;
}

export async function markAlertRead(id: string): Promise<void> {
  await api.patch(`/alerts/${id}/read`);
}

// ─── RadarAPI Unified Bridge ───
// This object maps the function names expected by RadarDashboard.tsx
// to the actual function definitions in api.ts and radar-api.ts.

export const RadarAPI = {
  getSentimentInsight: MainAPI.fetchSentimentInsight,
  getSentimentTimeline: MainAPI.fetchSentimentTimeline,
  getSentimentRatio: MainAPI.fetchSentimentRatio,
  getTickerPosts: MainAPI.fetchRecentPosts,
  getMarketInsight: MainAPI.fetchReversalDetails,
  triggerScrapJob: MainAPI.triggerCrawl,
  getScrapJobStatus: MainAPI.fetchCrawlJob,
  getCustomAIAnalysis: MainAPI.fetchIndicatorAnalysis,
  tossAuthPhone: (name: string, birthday: string, phone: string) => MainAPI.startTossPhoneLogin({ name, birthday, phone }),
  tossAuthManualClick: MainAPI.confirmTossLogin,
  getInsiderTrades: fetchTickerInsiders,
  getInstitutionalHoldings: fetchTickerInstitutions,
  getPoliticianTrades: fetchTickerPoliticians,
  getPriceHistory: fetchPriceHistory,
  getFullReport: fetchTickerFullReport,
  refreshTicker: refreshTicker,
  getRadarFeed: fetchRadarFeed,
  getTickerSummary: fetchTickerSummary,
  getTickerSignals: fetchTickerSignals,
  getPortfolio: MainAPI.fetchMyPortfolio
};
