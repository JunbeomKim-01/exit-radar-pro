import axios from 'axios';

// Fastify Proxy or direct connection (CORS is enabled on API side)
export const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
});

/**
 * Visitor ID (Session Isolation)
 * 브라우저별 고유 ID를 생성하여 헤더에 포함합니다.
 */
const getVisitorId = () => {
  let id = localStorage.getItem('fm_visitor_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('fm_visitor_id', id);
  }
  return id;
};

api.interceptors.request.use((config) => {
  config.headers['X-Visitor-Id'] = getVisitorId();
  return config;
});

export interface SentimentRatioResponse {
  ticker: string;
  windowType: string;
  supportRatio: number;
  criticizeRatio: number;
  neutralRatio: number;
  postCount: number;
  computedAt: string;
  cached: boolean;
}

export interface SentimentTimelineResponse {
  ticker: string;
  timeline: Array<{
    id: string;
    ticker: string;
    windowType: string;
    supportRatio: number;
    criticizeRatio: number;
    neutralRatio: number;
    postCount: number;
    computedAt: string;
  }>;
}

export interface SystemStatusResponse {
  api: { status: "online" | "offline"; ping: number };
  database: { status: "online" | "offline"; ping: number };
  classifier: { status: "online" | "offline"; ping: number };
  scraper?: { status: "online" | "offline"; lastRun?: string };
  timestamp: string;
}

export interface SentimentInsight {
  summary: string;
  alert_level: "info" | "warning" | "danger";
  key_points: string[];
}

export interface Stock {
  id?: string;
  code: string;
  name: string;
  market?: string;
  price?: number;
  currency?: "KRW" | "USD";
  change?: number;
  changeRate?: number;
}

export interface SentimentResult {
  label: "support" | "criticize" | "neutral";
  confidence: number;
  rationale: string;
}

export interface PostResponse {
  id: string;
  ticker: string | null;
  title: string;
  body: string;
  authorHash: string;
  authorName: string;
  url: string;
  createdAt: string;
  _count: { comments: number };
  sentimentResults: SentimentResult[];
}

export interface PostsResponse {
  posts: PostResponse[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
  };
}

export interface CrawlJob {
  id: string;
  status: "pending" | "running" | "completed" | "failed";
  ticker: string | null;
  postCount: number;
  startedAt: string;
  completedAt: string | null;
  error?: string;
}

// API Methods
export async function fetchSentimentRatio(ticker: string, range: string = '24h') {
  const res = await api.get<{ success: boolean; data: SentimentRatioResponse }>(`/sentiment/ratio?ticker=${ticker}&range=${range}`);
  return res.data.data;
}

export async function fetchSentimentTimeline(ticker: string, days: number = 7) {
  const res = await api.get<{ success: boolean; data: SentimentTimelineResponse }>(`/sentiment/timeline?ticker=${ticker}&days=${days}`);
  return res.data.data;
}

export async function fetchRecentPosts(ticker: string, limit: number = 40) {
  const res = await api.get<{ success: boolean; data: PostsResponse }>(`/posts?ticker=${ticker}&limit=${limit}`);
  return res.data.data;
}

export async function fetchSystemStatus() {
  const res = await api.get<SystemStatusResponse>('/system/status');
  return res.data;
}

export async function startProcess(name: string) {
  const res = await api.post<{ success: boolean; message: string }>('/system/process/start', { name });
  return res.data;
}

export async function stopProcess(name: string) {
  const res = await api.post<{ success: boolean; message: string }>('/system/process/stop', { name });
  return res.data;
}

export async function fetchStockSuggestions(query: string) {
  const res = await api.get<{ success: boolean; data: Stock[] }>(`/stocks/search?q=${query}`);
  return res.data.data;
}

export async function triggerCrawl(ticker: string, maxCount: number = 20) {
  const res = await api.post<{ success: boolean; data: { message: string, jobId: string } }>('/crawl/run', { ticker, maxCount });
  return res.data.data;
}

export async function fetchCrawlJob(jobId: string) {
  const res = await api.get<{ success: boolean; data: CrawlJob }>(`/crawl/jobs/${jobId}`);
  return res.data.data;
}

export async function fetchSentimentInsight(ticker: string) {
  const res = await api.get<{ success: boolean; data: SentimentInsight }>(`/sentiment/insight?ticker=${ticker}`);
  return res.data.data;
}

export interface PortfolioItem {
  ticker: string;
  name: string;
  quantity: number;
  averagePrice: number;
  currentPrice: number;
  returnAmount: number;
  returnRate: number;
  currency: string;
}

export interface PortfolioData {
  totalAssetValue: number;
  totalInvested: number;
  totalReturnAmount: number;
  totalReturnRate: number;
  currency: string;
  items: PortfolioItem[];
}

export async function fetchMyPortfolio() {
  const res = await api.get<{ success: boolean; data: PortfolioData }>('/portfolio/sync');
  return res.data.data;
}

export async function startTossLogin() {
  const res = await api.post<{ success: boolean; data: any }>('/auth/toss/login');
  return res.data;
}

export async function startTossPhoneLogin(details: { name: string, birthday: string, phone: string }) {
  const res = await api.post<{ success: boolean; data: any }>('/auth/toss/login/phone', details);
  return res.data;
}

export async function getTossLoginStatus() {
  const res = await api.get<{ success: boolean; data: any }>('/auth/toss/login/status');
  return res.data.data;
}

export async function uploadTossSession(sessionData: any) {
  const res = await api.post<{ success: boolean; data: any }>('/auth/toss/session', sessionData);
  return res.data;
}

export async function switchTossLoginMethod(method: 'qr' | 'phone') {
  const res = await api.post<{ success: boolean; data: any }>('/auth/toss/login/switch', { method });
  return res.data;
}

// ─── Trend Reversal ───

export async function fetchReversalSummary() {
  const res = await api.get<{ success: boolean; data: any }>('/market/reversal/summary');
  return res.data.data;
}

export async function fetchReversalDetails() {
  const res = await api.get<{ success: boolean; data: any }>('/market/reversal/details');
  return res.data.data;
}

export async function fetchReversalCases(signalType?: string, limit?: number) {
  const params = new URLSearchParams();
  if (signalType) params.set('signalType', signalType);
  if (limit) params.set('limit', String(limit));
  const res = await api.get<{ success: boolean; data: any[] }>(`/market/reversal/cases?${params}`);
  return res.data.data;
}

export async function triggerReversalRefresh() {
  const res = await api.post<{ success: boolean; data: any }>('/market/reversal/refresh');
  return res.data.data;
}

export async function confirmTossLogin() {
  const res = await api.post<{ success: boolean; message: string }>('/portfolio/confirm-login');
  return res.data;
}
