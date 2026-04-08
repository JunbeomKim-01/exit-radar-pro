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

/**
 * Intelligent Caching System
 * 업데이트 주기가 긴 데이터를 로컬에 캐싱하여 로딩 성능을 최적화합니다.
 */
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 Hours

export async function withCache<T>(key: string, fetcher: () => Promise<T>, ttl: number = CACHE_TTL): Promise<T> {
  const cached = localStorage.getItem(`cache_${key}`);
  if (cached) {
    const { data, timestamp } = JSON.parse(cached);
    if (Date.now() - timestamp < ttl) return data;
  }
  const data = await fetcher();
  localStorage.setItem(`cache_${key}`, JSON.stringify({ data, timestamp: Date.now() }));
  return data;
}

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

export const INDICATOR_EXPLANATIONS: Record<string, string> = {
  'VXN': '나스닥 100 변동성 지수입니다. 지수가 급등 후 꺾이는 지점이 시장의 단기 바닥인 경우가 많습니다.',
  'HY OAS': '투기 등급 채권의 가산 금리입니다. 이 수치가 낮아지면 시장의 공포가 줄어들고 위험 자산 선호가 강해집니다.',
  'DGS2': '미국채 2년물 금리입니다. 연준의 정책 금리 기대를 반영하며, 금리 안정화는 성장주에 긍정적입니다.',
  'Yield Curve': '장단기 금리차(10Y-2Y)입니다. 역전됐던 금리차가 정상화되는 과정은 역사적으로 경기 침체의 전조로 해석됩니다.',
  'SOX': '필라델피아 반도체 지수의 상대 강도입니다. 반도체가 시장을 주도할 때 나스닥의 반등 탄력이 강해집니다.',
  'VIX': 'S&P 500 공포 지수입니다. 30 이상의 과매도 구간에서 하락세가 진정될 때 반등 신호로 작동합니다.',
  'DXY': '달러 인덱스입니다. 달러 약세는 신흥국 및 기술주 시장의 유동성을 공급하는 호재입니다.',
  'WTI': '국제 유가입니다. 유가 하락은 인플레이션 압력을 낮추어 금리 인하 기대감을 높입니다.',
  '거래량': '나스닥 거래량입니다. 하락 끝단에서 거래량이 폭발하는 것은 투매(Climax) 이후의 바닥 신호일 수 있습니다.',
  'CPI': '소비자 물가 지수입니다. 인플레이션 둔화는 연준의 금리 인하 가능성을 높여 시장에 유동성을 공급합니다.',
  'Fear & Greed': '시장 참여자들의 심리를 수치화한 지수입니다. 극도의 공포는 매수 기회, 극도의 탐욕은 매도 기회로 해석됩니다.'
};

// API Methods
export async function fetchSentimentRatio(ticker: string, range: string = '24h') {
  try {
    const res = await api.get<{ success: boolean; data: SentimentRatioResponse }>(`/sentiment/ratio?ticker=${ticker}&range=${range}`);
    return res.data.data;
  } catch (err) {
    console.warn(`SentimentRatio failed for ${ticker}, using fallback.`);
    return { supportRatio: 50, criticizeRatio: 30, neutralRatio: 20, postCount: 0 };
  }
}

export async function fetchSentimentTimeline(ticker: string, range: string = '24h') {
  try {
    const res = await api.get<{ success: boolean; data: SentimentTimelineResponse }>(`/sentiment/timeline?ticker=${ticker}&range=${range}`);
    return res.data.data;
  } catch (err) {
    return { timeline: [] };
  }
}

export async function fetchRecentPosts(ticker: string, limit: number = 20) {
  try {
    const res = await api.get<{ success: boolean; data: PostsResponse }>(`/posts?ticker=${ticker}&limit=${limit}`);
    return res.data.data;
  } catch (err) {
    return { posts: [] };
  }
}

export async function fetchSystemStatus() {
  const res = await api.get<SystemStatusResponse>('/system/status');
  return res.data;
}

export async function fetchSentimentInsight(ticker: string) {
  try {
    const res = await api.get<{ success: boolean; data: any }>(`/sentiment/insight?ticker=${ticker}`);
    return res.data.data;
  } catch (err) {
    return { summary: `${ticker}에 대한 시장의 실시간 여론과 고래의 움직임을 정밀 분석 중입니다.`, key_points: ["데이터 피드 동기화 중", "과거 트렌드 분석 완료", "신규 시그널 탐색"] };
  }
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

export async function fetchMarketUnifiedOpinion() {
  const res = await api.get<{ success: boolean; data: { analysis: string } }>('/market/reversal/unified-opinion');
  return res.data.data;
}

export async function fetchIndicatorAnalysis(name: string) {
  const res = await api.get<{ success: boolean; data: { analysis: string } }>(`/market/reversal/indicator-analysis?name=${name}`);
  return res.data.data;
}

export async function confirmTossLogin() {
  const res = await api.post<{ success: boolean; message: string }>('/portfolio/confirm-login');
  return res.data;
}

export async function fetchInsiderTrades(ticker: string) {
  try {
    const res = await api.get<{ success: boolean; data: any[] }>(`/radar/tickers/${ticker}/insiders`);
    return res.data.data;
  } catch (err) { return []; }
}

export async function fetchInstitutionalHoldings(ticker: string) {
  try {
    const res = await api.get<{ success: boolean; data: any[] }>(`/radar/tickers/${ticker}/institutions`);
    return res.data.data;
  } catch (err) { return []; }
}

export async function fetchPoliticianTrades(ticker: string) {
  try {
    const res = await api.get<{ success: boolean; data: any[] }>(`/radar/tickers/${ticker}/politicians`);
    return res.data.data;
  } catch (err) { return []; }
}

// ─── Parallel Intelligence Engine ───

export interface UnifiedMarketData {
  summary: any;
  details: any;
  unifiedOpinion: { analysis: string };
  indicators: Record<string, { analysis: string }>;
}

/**
 * 전역 시장 데이터 병렬 수집
 */
export async function fetchUnifiedMarketData(): Promise<UnifiedMarketData> {
  const [summary, details, unifiedOpinion] = await Promise.all([
    withCache<any>('reversal_summary', fetchReversalSummary, 6 * 60 * 60 * 1000), // 6h
    withCache<any>('reversal_details', fetchReversalDetails, 6 * 60 * 60 * 1000),
    withCache<{ analysis: string }>('market_unified_opinion', fetchMarketUnifiedOpinion, 12 * 60 * 60 * 1000) // 12h
  ]);

  return { summary, details, unifiedOpinion, indicators: {} };
}

/**
 * 개별 종목 인텔리전스 패키지 병렬 수집 (복원력 강화)
 */
export async function fetchTickerDetailPackage(ticker: string) {
  // Wrap each call with individual error handling to prevent Promise.all from failing entirely
  const safeFetch = async (fn: any) => {
    try { return await fn(ticker); } catch (e) { return null; }
  };

  return await Promise.all([
    safeFetch(fetchSentimentInsight),
    safeFetch(fetchSentimentRatio),
    safeFetch(fetchSentimentTimeline),
    safeFetch(fetchInsiderTrades),
    safeFetch(fetchInstitutionalHoldings),
    safeFetch(fetchPoliticianTrades),
    safeFetch(fetchRecentPosts)
  ]);
}
