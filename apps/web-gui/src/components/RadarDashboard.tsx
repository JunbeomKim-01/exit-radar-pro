import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, AlertTriangle, Trash2, RefreshCw, MessageSquare, Activity, Wallet, TrendingUp, BarChart2
} from 'lucide-react';
import { StockSearch } from './StockSearch';
import { TradingViewChart } from './TradingViewChart';
import { SentimentInsight } from './SentimentInsight';
import { SentimentRatio } from './SentimentRatio';
import { SentimentTimeline } from './SentimentTimeline';
import { PostList } from './PostList';
import { SystemControl } from './SystemControl';
import { TrendReversalTab } from './TrendReversalTab';
import {
  fetchSentimentRatio, fetchSentimentTimeline, fetchRecentPosts, fetchSentimentInsight,
  fetchSystemStatus, fetchMyPortfolio, startTossLogin, startTossPhoneLogin, getTossLoginStatus, confirmTossLogin, 
  fetchReversalSummary, fetchReversalDetails, triggerCrawl, fetchCrawlJob,
  type SystemStatusResponse, type PortfolioData,
  type SentimentRatioResponse, type SentimentTimelineResponse, type PostsResponse,
  type SentimentInsight as SentimentInsightType
} from '../api';
import {
  fetchWatchlist, addToWatchlist, removeFromWatchlist,
  fetchTickerSummary, fetchTickerSignals, fetchTickerInsiders,
  fetchTickerInstitutions,
  type WatchlistItem, type RiskSnapshot, type RiskFactor,
  type InsiderTrade, type InstitutionHolding
} from '../radar-api';

const MARKET_INDICATOR_INFO: Record<string, string> = {
  'VXN': '나스닥 100 변동성 지수 (시장 불안정성)',
  'VIX': 'S&P 500 공포 지수 (하락장 위험 신호)',
  'DXY': '미국 달러 인덱스 (달러 가치 및 유동성)',
  'WTI': '서부 텍사스산 원유 (에너지 물가 및 경기 반영)',
  'SOX': '필라델피아 반도체 지수 (빅테크 전방 산업)',
  'HY OAS': '하이일드 채권 스프레드 (기업 신용 및 부도 위험)',
  'DGS2': '미 국채 2년물 금리 (통화 정책 및 경기 전망)',
  '거래량': '시장 거래대금 및 활동성 (신뢰도 지표)'
};

const safeFetch = async <T,>(promise: Promise<T>, fallback: T): Promise<T> => {
  try { return await promise; } catch (e) { return fallback; }
};

function StageBadge({ stage }: { stage: string }) {
  const config: Record<string, { bg: string; color: string; icon: any; label: string }> = {
    OBSERVE: { bg: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', icon: Activity, label: 'OBSERVE' },
    WARN: { bg: 'rgba(251, 191, 36, 0.15)', color: '#fbbf24', icon: AlertTriangle, label: 'WARN' },
    CONFIRMED: { bg: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', icon: Shield, label: 'CONFIRMED' },
  };
  const c = config[stage] || config.OBSERVE;
  const Icon = c.icon;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '6px',
      background: c.bg, border: `1px solid ${c.color}33`, borderRadius: '6px',
      padding: '4px 8px', fontSize: '10px', fontWeight: 800, color: c.color,
    }}>
      <Icon size={12} />
      {c.label}
    </div>
  );
}

function ActionItem({ level, text }: { level: string; text: string }) {
  const colors: Record<string, string> = {
    CONFIRMED: '#ef4444', DANGER: '#ef4444',
    WARN: '#fbbf24', OBSERVE: '#60a5fa',
    INFO: 'var(--text-muted)', OK: 'var(--accent-up)',
  };
  const color = colors[level] || 'var(--text-muted)';
  
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
      <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: color, marginTop: '6px', flexShrink: 0 }} />
      <span>{text}</span>
    </div>
  );
}

export function RadarDashboard() {
  const [mainTab, setMainTab] = useState<'radar' | 'reversal'>('reversal');
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [portfolioSortBy, setPortfolioSortBy] = useState<'return' | 'value'>('value');
  const [portfolioSortOrder, setPortfolioSortOrder] = useState<'asc' | 'desc'>('desc');
  const [activeMarketInfo, setActiveMarketInfo] = useState<string | null>(null);
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  
  const [detail, setDetail] = useState<RiskSnapshot | null>(null);
  const [signals, setSignals] = useState<RiskFactor[]>([]);
  const [insiders, setInsiders] = useState<InsiderTrade[]>([]);
  const [institutions, setInstitutions] = useState<InstitutionHolding[]>([]);
  
  const [ratioData, setRatioData] = useState<SentimentRatioResponse | null>(null);
  const [timelineData, setTimelineData] = useState<SentimentTimelineResponse | null>(null);
  const [postsData, setPostsData] = useState<PostsResponse | null>(null);
  const [insightData, setInsightData] = useState<SentimentInsightType | null>(null);
  
  const [systemStatus, setSystemStatus] = useState<SystemStatusResponse | null>(null);
  
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);
  const [portfolioSyncing, setPortfolioSyncing] = useState(false);
  const [loginProgress, setLoginProgress] = useState(false);
  const [remoteLoginActive, setRemoteLoginActive] = useState(false);
  const [liveScreenshot, setLiveScreenshot] = useState<string | null>(null);
  const [loginStatus, setLoginStatus] = useState<string>("pending");
  const [loginMethod, setLoginMethod] = useState<'qr' | 'phone'>('phone');
  const [phoneDetails, setPhoneDetails] = useState({ name: '', birthday: '', phone: '' });
  const [rememberMe, setRememberMe] = useState(true);
  const [confirmingLogin, setConfirmingLogin] = useState(false);
  
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 1024);
  const [mobileTab, setMobileTab] = useState<'market' | 'portfolio'>('market');
  const [showMobileDetail, setShowMobileDetail] = useState(false);
  const [detailSubTab, setDetailSubTab] = useState<'analysis' | 'supply' | 'social'>('analysis');

  const [reversalSummary, setReversalSummary] = useState<any>(null);
  const [reversalDetails, setReversalDetails] = useState<any>(null);

  const [isScraping, setIsScraping] = useState(false);
  const [scrapProgress, setScrapProgress] = useState("");
  const [scrapCount, setScrapCount] = useState(20);
  const [detailLoading, setDetailLoading] = useState(false);
  const [marketContentTab, setMarketContentTab] = useState<'insiders' | 'institutions'>('insiders');

  const sortedWatchlist = [...watchlist].sort((a, b) => {
    if (portfolioSortBy === 'return') {
      const valA = a.returnRate || 0;
      const valB = b.returnRate || 0;
      return portfolioSortOrder === 'desc' ? valB - valA : valA - valB;
    } else {
      const valA = a.currentValue || 0;
      const valB = b.currentValue || 0;
      return portfolioSortOrder === 'desc' ? valB - valA : valA - valB;
    }
  });

  const loadData = async () => {
    const [w, revSum, revDet] = await Promise.all([
      safeFetch(fetchWatchlist(), []),
      safeFetch(fetchReversalSummary(), null),
      safeFetch(fetchReversalDetails(), null)
    ]);
    setWatchlist(w as WatchlistItem[]);
    setReversalSummary(revSum);
    setReversalDetails(revDet);
  };

  useEffect(() => { 
    loadData(); 
    const saved = localStorage.getItem('toss-phone-details');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setPhoneDetails(parsed);
        setRememberMe(true);
      } catch (e) {}
    }
    fetchSystemStatus().then(setSystemStatus).catch(console.error);
    const interval = setInterval(async () => {
      try { const s = await fetchSystemStatus(); setSystemStatus(s); }
      catch { setSystemStatus(p => p ? { ...p, api: { status: 'offline', ping: 0 } } : null); }
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleAddTicker = async (stock: { code: string; name: string }) => {
    try { await addToWatchlist(stock.code, stock.name); loadData(); } 
    catch (err: any) { alert(err.response?.data?.error || '추가 실패'); }
  };

  const handleRemoveTicker = async (ticker: string) => {
    if (confirm(`${ticker}를 삭제하시겠습니까?`)) {
      await removeFromWatchlist(ticker);
      loadData();
    }
  };

  const handleSyncPortfolio = async () => {
    setPortfolioSyncing(true);
    try {
      const p = await fetchMyPortfolio();
      setPortfolio(p);
      const newWatchlist: WatchlistItem[] = p.items.map((pi, idx) => ({
        id: `portfolio-${pi.ticker}-${idx}`,
        ticker: pi.ticker,
        companyName: pi.name,
        stock: { code: pi.ticker, name: pi.name, price: pi.currentPrice },
        returnRate: pi.returnRate,
        returnAmount: pi.returnAmount,
        quantity: pi.quantity,
        currentValue: (pi.quantity * pi.currentPrice)
      } as unknown as WatchlistItem));
      setWatchlist(newWatchlist);
      if (p.items.length > 0) handleSelectTicker(p.items[0].ticker);
    } catch(e: any) {
      if (e.response?.status === 401) {
        if (confirm("토스증권 세션이 만료되었습니다. 지금 로그인을 시도할까요?")) handleTossLogin();
      } else alert("포트폴리오 동기화 중 오류가 발생했습니다.");
    } finally { setPortfolioSyncing(false); }
  };

  const handleTossLogin = async () => {
    setLoginProgress(true);
    try { await startTossLogin(); setRemoteLoginActive(true); setLoginStatus("pending"); }
    catch (e) { alert("로그인 에이전트 시작 중 오류가 발생했습니다."); }
    finally { setLoginProgress(false); }
  };

  const handleTossPhoneLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginProgress(true);
    if (rememberMe) localStorage.setItem('toss-phone-details', JSON.stringify(phoneDetails));
    else localStorage.removeItem('toss-phone-details');
    try { await startTossPhoneLogin(phoneDetails); setRemoteLoginActive(true); setLoginStatus("휴대폰 번호 로그인 시작됨..."); }
    catch (e) { alert("휴대폰 번호 로그인 시작 중 오류가 발생했습니다."); }
  };

  useEffect(() => {
    let interval: any;
    if (remoteLoginActive) {
      interval = setInterval(async () => {
        try {
          const status = await getTossLoginStatus();
          setLoginStatus(status.status);
          if (status.screenshot) setLiveScreenshot(status.screenshot);
          if (status.status === 'success') {
            setRemoteLoginActive(false);
            alert("로그인 성공! 대시보드가 곧 동기화됩니다.");
            handleSyncPortfolio();
          } else if (status.status === 'failed' || status.status === 'timeout') {
            setRemoteLoginActive(false);
            alert(`로그인 실패: ${status.error || '시간 초과'}`);
          }
        } catch (e: any) {
          if (e.response?.status === 404) { setRemoteLoginActive(false); setLoginStatus("세션 유실됨"); }
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [remoteLoginActive]);

  const handleManualLoginClick = async () => {
    setConfirmingLogin(true);
    try { const res = await confirmTossLogin(); if (!res.success) alert(res.message); }
    catch (e) { alert("오류 발생"); }
    finally { setConfirmingLogin(false); }
  };

  const handleSelectTicker = async (ticker: string) => {
    setSelectedTicker(ticker);
    setDetailLoading(true);
    const existing = watchlist.find(it => it.ticker === ticker);
    setDetail({ ticker, companyName: existing?.stock?.name || existing?.companyName || 'LOADING...', score: 0, level: 'Analyzing' } as any);

    const [summary, sigs, ins, inst, ratio, timeline, posts, insight] = await Promise.all([
      safeFetch(fetchTickerSummary(ticker), null),
      safeFetch(fetchTickerSignals(ticker), []),
      safeFetch(fetchTickerInsiders(ticker), []),
      safeFetch(fetchTickerInstitutions(ticker), []),
      safeFetch(fetchSentimentRatio(ticker, '24h'), null),
      safeFetch(fetchSentimentTimeline(ticker, 7), null),
      safeFetch(fetchRecentPosts(ticker, 100), null), 
      safeFetch(fetchSentimentInsight(ticker), null)
    ]);
    
    if (summary) setDetail(summary as RiskSnapshot);
    setSignals(sigs as RiskFactor[]);
    setInsiders(ins as InsiderTrade[]);
    setInstitutions(inst as InstitutionHolding[]);
    setRatioData(ratio as SentimentRatioResponse);
    setTimelineData(timeline as SentimentTimelineResponse);
    setPostsData(posts as PostsResponse);
    setInsightData(insight as SentimentInsightType);
    setDetailLoading(false);
    if (isMobile) setShowMobileDetail(true);
  };

  const resolveUnderlyingTicker = (ticker: string) => {
    const mapping: Record<string, string> = { "MSFU": "MSFT", "TSLL": "TSLA", "NVDU": "NVDA" };
    return mapping[ticker.toUpperCase()] || ticker.toUpperCase();
  };

  const handleTriggerScrap = async () => {
    if (!selectedTicker) return;
    setIsScraping(true);
    setScrapProgress("데이터 수집 시작...");
    try {
      const res = await triggerCrawl(selectedTicker, scrapCount);
      const jobId = res.jobId;
      let attempts = 0;
      const pollInterval = setInterval(async () => {
        attempts++;
        try {
          const job = await fetchCrawlJob(jobId);
          if (job.status === 'completed') {
            clearInterval(pollInterval);
            setScrapProgress(`수집 완료: ${job.postCount}건.`);
            setTimeout(() => setIsScraping(false), 3000);
            handleSelectTicker(selectedTicker);
          } else if (job.status === 'failed') {
            clearInterval(pollInterval);
            alert(`실패: ${job.error}`);
            setIsScraping(false);
          } else setScrapProgress(`${attempts}s.. 수집 중`);
        } catch (e) {}
        if (attempts >= 60) { clearInterval(pollInterval); setIsScraping(false); }
      }, 1000);
    } catch (e) { setIsScraping(false); }
  };

  const underlying = detail ? resolveUnderlyingTicker(detail.ticker) : "";

  const renderReturnBadge = (rate?: number) => {
    if (rate === undefined) return null;
    const isUp = rate >= 0;
    return <div className={`trading-badge ${isUp ? 'up' : 'down'}`}>{isUp ? '+' : ''}{rate.toFixed(2)}%</div>;
  };

  return (
    <div className="app-container">
      {isMobile && (
        <div className="bottom-nav">
          <motion.button className={`nav-item ${mobileTab === 'market' ? 'active' : ''}`} onClick={() => { setMobileTab('market'); setShowMobileDetail(false); }}><div className="icon-wrapper"><BarChart2 size={24} /></div><span>시장</span></motion.button>
          <motion.button className={`nav-item ${mobileTab === 'portfolio' ? 'active' : ''}`} onClick={() => { setMobileTab('portfolio'); setShowMobileDetail(false); }}><div className="icon-wrapper"><Wallet size={24} /></div><span>포트폴리오</span></motion.button>
          <motion.div className="nav-pill" style={{ width: '50%' }} animate={{ x: mobileTab === 'market' ? '0%' : '100%' }} />
        </div>
      )}

      {!isMobile && (
        <div style={{ background: 'var(--bg-panel)', borderBottom: '1px solid var(--border-color)', padding: '0 16px', display: 'flex' }}>
          <button onClick={() => setMainTab('reversal')} style={{ padding: '12px 20px', background: 'transparent', border: 'none', borderBottom: mainTab === 'reversal' ? '2px solid var(--accent-brand)' : 'transparent', color: mainTab === 'reversal' ? '#fff' : 'var(--text-muted)', fontSize: '13px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}><TrendingUp size={16} /> TREND REVERSAL</button>
          <button onClick={() => setMainTab('radar')} style={{ padding: '12px 20px', background: 'transparent', border: 'none', borderBottom: mainTab === 'radar' ? '2px solid var(--accent-brand)' : 'transparent', color: mainTab === 'radar' ? '#fff' : 'var(--text-muted)', fontSize: '13px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}><Activity size={16} /> ENTITY RADAR</button>
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {mainTab === 'reversal' && !isMobile ? (
          <TrendReversalTab />
        ) : (
          <div className="terminal-grid" style={{ height: '100%', position: 'relative' }}>
            <AnimatePresence mode="wait">
              {isMobile ? (
                showMobileDetail ? (
                  <motion.div key="mobile-detail" initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 50, opacity: 0 }} className="mobile-detail-overlay">
                    <div className="detail-header">
                       <button onClick={() => setShowMobileDetail(false)} className="back-btn"><TrendingUp size={20} style={{ transform: 'rotate(-90deg)' }} /> 뒤로</button>
                       <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '16px', fontWeight: 900 }}>{selectedTicker}</div>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{detail?.companyName}</div>
                       </div>
                    </div>
                    <div className="detail-scroll-area">
                        <div style={{ padding: '0 16px 20px' }}>
                           <div style={{ height: '300px', background: 'var(--bg-panel)', marginBottom: '16px' }}>
                              <TradingViewChart ticker={underlying || selectedTicker || ''} companyName={detail?.companyName || ''} />
                           </div>
                           <div className="detail-tabs" style={{ marginBottom: '16px' }}>
                              <button onClick={() => setDetailSubTab('analysis')} className={`tab-btn ${detailSubTab === 'analysis' ? 'active' : ''}`}>분석</button>
                              <button onClick={() => setDetailSubTab('supply')} className={`tab-btn ${detailSubTab === 'supply' ? 'active' : ''}`}>수급</button>
                              <button onClick={() => setDetailSubTab('social')} className={`tab-btn ${detailSubTab === 'social' ? 'active' : ''}`}>소셜</button>
                           </div>

                           {detailSubTab === 'analysis' && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                                 <div className="risk-badge" style={{ background: detail?.level === 'Critical' ? 'rgba(239,68,68,0.1)' : 'rgba(14,203,129,0.1)', color: detail?.level === 'Critical' ? 'var(--accent-down)' : 'var(--accent-up)' }}>RISK: {detail?.score}</div>
                                 <SystemControl status={null} stock={null} onRefresh={() => handleSelectTicker(selectedTicker || '')} hideStatus />
                              </div>
                              <div className="mobile-section"><h3 className="section-title"><Shield size={14} /> 리스크 시그널</h3><div className="signal-list">{signals.length > 0 ? signals.map(s => <div key={s.id} className="signal-item"><span className="signal-title">{s.title}</span><p className="signal-desc">{s.description}</p></div>) : <div className="empty-detail">데이터 없음</div>}</div></div>
                            </motion.div>
                          )}

                          {detailSubTab === 'supply' && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                              <div className="mobile-section">
                                <h3 className="section-title"><Activity size={14} /> 내부자 거래</h3>
                                <div className="data-table-container">
                                  <table className="data-table">
                                    <thead><tr><th>날짜</th><th>인사이드</th><th>타입</th><th>수량</th><th>금액</th></tr></thead>
                                    <tbody>
                                      {insiders.map((it, idx) => (
                                        <tr key={idx}><td>{new Date(it.transactionDate).toLocaleDateString()}</td><td>{it.insiderName}</td><td className={it.side === 'BUY' ? 'insider-buy' : 'insider-sell'}>{it.side}</td><td className="nums">{it.shares.toLocaleString()}</td><td className="nums">${(it.shares * it.pricePerShare).toLocaleString()}</td></tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                              <div className="mobile-section">
                                <h3 className="section-title"><Shield size={14} /> 기관 보유</h3>
                                <div className="data-table-container">
                                  <table className="data-table">
                                    <thead><tr><th>기관</th><th>수량</th><th>변화</th></tr></thead>
                                    <tbody>{institutions.map((ih, idx) => (<tr key={idx}><td>{ih.institutionName}</td><td className="nums">{ih.shares.toLocaleString()}</td><td className={ih.changePercent > 0 ? 'insider-buy' : 'insider-sell'}>{ih.changePercent.toFixed(2)}%</td></tr>))}</tbody>
                                  </table>
                                </div>
                              </div>
                            </motion.div>
                          )}

                          {detailSubTab === 'social' && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                               <div className="mobile-section"><h3 className="section-title"><MessageSquare size={14} /> 커뮤니티 투심</h3>{insightData && <SentimentInsight insight={insightData} loading={detailLoading} />}</div>
                               <div className="mobile-section" style={{ height: '240px' }}><h3 className="section-title"><Activity size={14} /> 감성 타임라인</h3>{timelineData && <SentimentTimeline timeline={timelineData.timeline} />}</div>
                               <div style={{ marginTop: '20px' }}>{ratioData && <SentimentRatio {...ratioData} />}</div>
                               <div className="smart-sync-section compact" style={{ margin: '16px 0', padding: '12px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                     <div className="sync-status"><div className={isScraping ? "sync-dot pulse" : ""} style={{ background: isScraping ? 'var(--accent-brand)' : 'var(--text-muted)', width: '6px', height: '6px', borderRadius: '50%' }} /><span style={{ fontSize: '11px', fontWeight: 800, color: isScraping ? 'var(--accent-brand)' : 'var(--text-muted)' }}>{isScraping ? "SYNCING..." : "COMMUNITY SYNC"}</span></div>
                                     <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>LIMIT</span><input type="number" value={scrapCount} onChange={(e) => setScrapCount(Number(e.target.value))} style={{ width: '40px', background: 'var(--bg-dark)', border: '1px solid var(--border-color)', color: '#fff', fontSize: '11px', textAlign: 'center' }}/></div>
                                  </div>
                                  <button onClick={handleTriggerScrap} disabled={isScraping} style={{ width: '100%', padding: '8px', background: 'var(--accent-brand)', color: '#000', borderRadius: '4px', fontSize: '11px', fontWeight: 900 }}>START SYNC</button>
                               </div>
                            </motion.div>
                          )}
                        </div>
                    </div>
                  </motion.div>
                ) : mobileTab === 'market' ? (
                  <motion.div key="mobile-market" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ flex: 1, overflowY: 'auto', paddingBottom: '90px' }}>
                    <div style={{ padding: '16px' }}>
                       <div style={{ background: 'var(--bg-panel)', borderRadius: '12px', border: '1px solid var(--border-color)', padding: '16px', marginBottom: '16px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                             <div><div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}><span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 800 }}>MARKET_STAGE</span>{reversalSummary && <StageBadge stage={reversalSummary.stage} />}</div><div style={{ fontSize: '20px', fontWeight: 900, color: reversalSummary?.signalType === 'TOP_CANDIDATE' ? '#ef4444' : 'var(--accent-up)' }}>{reversalSummary?.signalType === 'TOP_CANDIDATE' ? '하락 전환 위험' : '상승 전환 기회'}</div></div>
                             <div style={{ textAlign: 'right' }}><span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 800, display: 'block', marginBottom: '4px' }}>SCORE</span><div style={{ fontSize: '24px', fontWeight: 900, color: '#fff' }}>{reversalSummary?.score || 0}</div></div>
                          </div>
                          <div style={{ background: 'rgba(255,255,255,0.02)', padding: '10px', borderRadius: '6px', fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.4, border: '1px solid rgba(255,255,255,0.05)', marginBottom: '12px' }}>{reversalSummary?.explanation || "시장 데이터를 분석 중입니다..."}</div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', fontWeight: 800, color: 'var(--text-muted)' }}><span>SIGNAL_CONFIDENCE</span><span style={{ color: '#fff' }}>{(reversalSummary?.confidence || 0).toFixed(0)}%</span></div>
                       </div>

                       <h3 style={{ fontSize: '13px', fontWeight: 900, marginBottom: '12px', color: 'var(--text-active)' }}>시장 핵심 지표</h3>
                       <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '24px' }}>
                          {['VXN', 'VIX', 'DXY', 'WTI', 'SOX', 'HY OAS', 'DGS2', '거래량'].map(name => {
                            const sig = reversalDetails?.signal?.coreSignals?.find((s: any) => s.name.includes(name)) || reversalDetails?.signal?.supportSignals?.find((s: any) => s.name.includes(name));
                            return (
                               <div key={name} onClick={() => setActiveMarketInfo(activeMarketInfo === name ? null : name)} style={{ background: 'var(--bg-card)', padding: '12px', borderRadius: '12px', border: '1px solid var(--border-color)', position: 'relative', overflow: 'hidden' }}>
                                 <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 800 }}>{name}</span>
                                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}><span className="nums" style={{ fontSize: '16px', fontWeight: 900, color: sig?.triggered ? 'var(--accent-down)' : 'var(--text-active)' }}>{sig ? `${sig.score}/${sig.maxScore}` : '--'}</span>{sig?.triggered && <AlertTriangle size={12} color="#ef4444" />}</div>
                                 <div style={{ height: '3px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', overflow: 'hidden', marginTop: '4px' }}><div style={{ width: sig ? `${(sig.score/sig.maxScore)*100}%` : '0%', height: '100%', background: sig?.triggered ? 'var(--accent-down)' : 'var(--accent-brand)' }} /></div>
                                 <AnimatePresence>{activeMarketInfo === name && (<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px', textAlign: 'center', fontSize: '9px', fontWeight: 700, color: 'var(--accent-brand)', zIndex: 10 }}>{MARKET_INDICATOR_INFO[name] || sig?.description}</motion.div>)}</AnimatePresence>
                               </div>
                            );
                          })}
                       </div>
                       <h3 style={{ fontSize: '13px', fontWeight: 900, marginBottom: '12px', color: 'var(--text-active)' }}>나스닥 지수 (QQQ)</h3>
                       <div style={{ height: '320px', background: 'var(--bg-panel)', borderRadius: '12px', overflow: 'hidden' }}><TradingViewChart ticker="QQQ" companyName="Nasdaq 100 ETF" /></div>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div key="mobile-portfolio" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="terminal-panel" style={{ border: 'none' }}>
                    <div style={{ padding: '16px', background: 'var(--bg-panel)', borderBottom: '1px solid var(--border-color)' }}>
                       <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}><span style={{ fontWeight: 800 }}>내 자산</span><button onClick={handleSyncPortfolio} className="toss-sync-btn" disabled={portfolioSyncing}><RefreshCw size={12} className={portfolioSyncing ? 'animate-spin' : ''} /> Sync</button></div>
                       {portfolio && (<div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}><div style={{ fontSize: '28px', fontWeight: 900 }}>${portfolio.totalAssetValue.toLocaleString()}</div><div style={{ fontSize: '14px', fontWeight: 800, color: portfolio.totalReturnRate >= 0 ? 'var(--accent-up)' : 'var(--accent-down)' }}>{portfolio.totalReturnRate >= 0 ? '+' : ''}{portfolio.totalReturnRate.toFixed(2)}%</div></div>)}
                       <div style={{ marginTop: '16px' }}><StockSearch onSelect={(stock) => handleAddTicker({ code: stock.code, name: stock.name })} initialValue="" /></div>
                    </div>
                    <div className="terminal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span>PORTFOLIO ASSETS</span><div style={{ display: 'flex', gap: '8px' }}><button onClick={() => { setPortfolioSortBy('return'); setPortfolioSortOrder(portfolioSortOrder === 'desc' ? 'asc' : 'desc'); }} style={{ fontSize: '10px', color: portfolioSortBy === 'return' ? 'var(--accent-brand)' : 'var(--text-muted)' }}>수익률</button><button onClick={() => { setPortfolioSortBy('value'); setPortfolioSortOrder(portfolioSortOrder === 'desc' ? 'asc' : 'desc'); }} style={{ fontSize: '10px', color: portfolioSortBy === 'value' ? 'var(--accent-brand)' : 'var(--text-muted)' }}>총액</button></div></div>
                    <div className="terminal-content mobile-list-safe-area" style={{ padding: 0 }}>
                        {sortedWatchlist.map(item => (
                         <div key={item.id} className="high-density-row" onClick={() => handleSelectTicker(item.ticker)} style={{ gridTemplateColumns: '1fr 1fr 80px' }}>
                            <div className="ticker-info"><span className="ticker-symbol">{item.ticker}</span><span className="ticker-name">{item.stock?.name || item.companyName || ''}</span></div>
                            <div style={{ textAlign: 'right' }}><span style={{ fontSize: '13px', fontWeight: 800, color: '#fff' }}>${item.currentValue?.toLocaleString() || '--'}</span><span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{item.quantity?.toLocaleString() || '0'}주</span></div>
                            <div className="price-info" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>{renderReturnBadge(item.returnRate)}<Trash2 size={14} onClick={(e) => { e.stopPropagation(); handleRemoveTicker(item.ticker); }} style={{ opacity: 0.3 }} /></div>
                         </div>
                       ))}
                    </div>
                  </motion.div>
                )
              ) : (
                 <>
                   <motion.aside key="desktop-left" initial={false} animate={{ opacity: 1 }} className="terminal-panel" style={{ width: 'clamp(280px, 18vw, 320px)', flexShrink: 0, height: '100%' }}>
                       <div style={{ padding: '20px 16px', borderBottom: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.02)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}><span style={{ fontWeight: 800, fontSize: '11px', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>NAVIGATOR / ASSETS</span><button onClick={handleSyncPortfolio} className="toss-sync-btn" disabled={portfolioSyncing}><RefreshCw size={10} className={portfolioSyncing ? 'animate-spin' : ''} /> REFRESH</button></div>
                          {portfolio && (<div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}><div style={{ fontSize: '24px', fontWeight: 900, color: '#fff' }}>${portfolio.totalAssetValue.toLocaleString()}</div><div style={{ fontSize: '12px', fontWeight: 800, color: portfolio.totalReturnRate >= 0 ? 'var(--accent-up)' : 'var(--accent-down)' }}>{portfolio.totalReturnRate >= 0 ? '▲' : '▼'} {Math.abs(portfolio.totalReturnRate).toFixed(2)}%</div></div>)}
                       </div>
                       <div className="terminal-header"><span>WATCHLIST INDICATORS</span><div style={{ display: 'flex', gap: '4px' }}><button onClick={() => { setPortfolioSortBy('return'); setPortfolioSortOrder(prev => prev === 'desc' ? 'asc' : 'desc'); }} style={{ fontSize: '9px', color: portfolioSortBy === 'return' ? 'var(--accent-brand)' : 'var(--text-muted)' }}>%</button><button onClick={() => { setPortfolioSortBy('value'); setPortfolioSortOrder(prev => prev === 'desc' ? 'asc' : 'desc'); }} style={{ fontSize: '9px', color: portfolioSortBy === 'value' ? 'var(--accent-brand)' : 'var(--text-muted)' }}>$</button></div></div>
                       <div style={{ padding: '12px' }}><StockSearch onSelect={(stock) => handleAddTicker({ code: stock.code, name: stock.name })} initialValue="" /></div>
                       <div className="terminal-content" style={{ padding: 0, paddingBottom: '140px' }}>
                          {sortedWatchlist.map(item => (
                            <div key={item.id} className={`high-density-row ${selectedTicker === item.ticker ? 'active' : ''}`} onClick={() => handleSelectTicker(item.ticker)} style={{ padding: '12px 16px', gridTemplateColumns: 'minmax(80px, 1.2fr) 1fr 1fr' }}>
                              <div className="ticker-info"><span style={{ fontSize: '13px', fontWeight: 900, color: selectedTicker === item.ticker ? 'var(--accent-brand)' : '#fff' }}>{item.ticker}</span><span style={{ fontSize: '10px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.stock?.name || item.companyName || ''}</span></div>
                              <div style={{ textAlign: 'right' }}><span style={{ fontSize: '12px', fontWeight: 800, color: '#fff' }}>${item.currentValue?.toLocaleString() || '--'}</span><span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>{item.quantity?.toLocaleString() || '0'} shares</span></div>
                              <div className="price-info" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}><div style={{ fontSize: '11px', fontWeight: 800, color: (item.returnRate || 0) >= 0 ? 'var(--accent-up)' : 'var(--accent-down)' }}>{(item.returnRate || 0) >= 0 ? '+' : ''}{(item.returnRate || 0).toFixed(2)}%</div><Trash2 size={12} onClick={(e) => { e.stopPropagation(); handleRemoveTicker(item.ticker); }} style={{ opacity: 0.3, cursor: 'pointer' }} /></div>
                            </div>
                          ))}
                       </div>
                   </motion.aside>

                   <motion.main key="desktop-main" initial={false} animate={{ opacity: 1 }} className="terminal-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-panel)', height: '100%' }}>
                      {!selectedTicker || !detail ? (
                        <div className="empty-state" style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontWeight: 800 }}>PENDING_TICKER_SELECTION</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                           <div style={{ padding: '20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}><div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><div style={{ width: '8px', height: '18px', background: 'var(--accent-brand)', borderRadius: '2px' }} /><span style={{ fontSize: '24px', fontWeight: 900, color: '#fff' }}>{detail.ticker}</span><span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>/ {detail.companyName}</span></div></div>
                              <div style={{ display: 'flex', gap: '32px', alignItems: 'center' }}><div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}><div style={{ textAlign: 'right' }}><div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 800 }}>RISK_INTENSITY</div><div style={{ fontSize: '28px', fontWeight: 900, color: detail.level === 'Critical' ? 'var(--accent-down)' : 'var(--accent-up)' }}>{detail.score}<span style={{ fontSize: '12px', color: 'var(--text-muted)' }}> / 100</span></div></div><div style={{ height: '32px', width: '1px', background: 'var(--border-color)' }} /><SystemControl status={systemStatus} stock={null} onRefresh={() => handleSelectTicker(selectedTicker)} hideStatus /></div></div>
                           </div>
                           <div style={{ flex: 2, minHeight: '350px', background: 'var(--bg-dark)' }}><TradingViewChart ticker={detail.ticker} companyName={detail.companyName} /></div>
                           <div className="terminal-grid" style={{ flex: 1.5, borderTop: '2px solid var(--border-color)', display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) minmax(350px, 1.2fr)', minHeight: '300px' }}>
                              <div style={{ borderRight: '1px solid var(--border-color)', padding: '20px', overflowY: 'auto' }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}><h3 className="section-title"><Shield size={14} /> RADAR_SIGNALS</h3></div><div className="signal-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>{signals.map(s => (<div key={s.id} className="signal-item" style={{ borderLeft: '2px solid var(--accent-brand)', paddingLeft: '12px' }}><span className="signal-title">{s.title}</span><p className="signal-desc">{s.description}</p></div>))}</div></div>
                              <div style={{ display: 'flex', flexDirection: 'column' }}><div style={{ display: 'flex', background: 'rgba(0,0,0,0.3)' }}><button onClick={() => setMarketContentTab('insiders')} style={{ flex: 1, padding: '12px', background: marketContentTab === 'insiders' ? 'rgba(255,255,255,0.05)' : 'transparent', color: marketContentTab === 'insiders' ? '#fff' : 'var(--text-muted)', fontSize: '11px', fontWeight: 900 }}>INSIDER_FLOW</button><button onClick={() => setMarketContentTab('institutions')} style={{ flex: 1, padding: '12px', background: marketContentTab === 'institutions' ? 'rgba(255,255,255,0.05)' : 'transparent', color: marketContentTab === 'institutions' ? '#fff' : 'var(--text-muted)', fontSize: '11px', fontWeight: 900 }}>INSTITUTION_METRICS</button></div><div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>{marketContentTab === 'insiders' ? (<div className="data-table-container"><table className="data-table high-density"><thead><tr><th>DATE</th><th>INSIDER</th><th>SIDE</th><th>VALUE</th></tr></thead><tbody>{insiders.map((it, idx) => (<tr key={idx}><td>{new Date(it.transactionDate).toLocaleDateString()}</td><td>{it.insiderName}</td><td className={it.side === 'BUY' ? 'insider-buy' : 'insider-sell'}>{it.side}</td><td>${(it.shares * it.pricePerShare).toLocaleString()}</td></tr>))}</tbody></table></div>) : (<div className="data-table-container"><table className="data-table high-density"><thead><tr><th>INSTITUTION</th><th>SHARES</th><th>DELTA</th></tr></thead><tbody>{institutions.map((ih, idx) => (<tr key={idx}><td>{ih.institutionName}</td><td>{ih.shares.toLocaleString()}</td><td className={ih.changePercent > 0 ? 'insider-buy' : 'insider-sell'}>{ih.changePercent.toFixed(2)}%</td></tr>))}</tbody></table></div>)}</div></div>
                           </div>
                        </div>
                      )}
                   </motion.main>

                   <motion.aside key="desktop-right" initial={false} animate={{ opacity: 1 }} className="terminal-panel" style={{ width: 'clamp(350px, 22vw, 400px)', flexShrink: 0, height: '100%' }}>
                      <div className="terminal-header"><span>SOCIAL_SENTIMENT_CORE</span></div>
                      <div className="terminal-content" style={{ padding: 0, overflowY: 'auto' }}>
                         {insightData && <div style={{ padding: '20px 16px' }}><SentimentInsight insight={insightData} loading={detailLoading} /></div>}
                         <div style={{ height: '240px', padding: '0 16px', marginBottom: '16px' }}>{timelineData && <SentimentTimeline timeline={timelineData.timeline} />}</div>
                          <div className="smart-sync-section" style={{ margin: '16px', padding: '16px', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}><div className="sync-status"><div className={isScraping ? "sync-dot pulse" : ""} style={{ background: isScraping ? 'var(--accent-brand)' : 'var(--text-muted)', width: '6px', height: '6px', borderRadius: '50%' }} /><span style={{ fontSize: '11px', fontWeight: 900, color: isScraping ? 'var(--accent-brand)' : 'var(--text-muted)' }}>{isScraping ? "SCRAPING_ENGINE_ACTIVE" : "ENGINE_IDLE"}</span></div></div>
                             <button onClick={handleTriggerScrap} disabled={isScraping} style={{ width: '100%', padding: '12px', background: 'var(--accent-brand)', color: '#000', borderRadius: '6px', fontWeight: 900 }}><Activity size={16} /> START SYNC</button>
                          </div>
                         <div style={{ padding: '0 16px 20px' }}>{ratioData && <SentimentRatio {...ratioData} />}</div>
                         <div style={{ borderTop: '1px solid var(--border-color)', padding: '16px' }}><PostList posts={postsData?.posts || []} /></div>
                      </div>
                   </motion.aside>
                 </>
               )}
             </AnimatePresence>
          </div>
        )}
      </div>

      {remoteLoginActive && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: 'var(--bg-panel)', padding: '24px', borderRadius: '12px', border: '1px solid var(--border-color)', width: '100%', maxWidth: '500px', textAlign: 'center' }}>
            <h3 style={{ marginBottom: '20px' }}>TOSS LOGIN</h3>
            {loginMethod === 'qr' ? (
              <div>{liveScreenshot ? <img src={`data:image/jpeg;base64,${liveScreenshot}`} style={{ width: '100%', borderRadius: '8px' }} /> : 'Loading...'}</div>
            ) : (
              <form onSubmit={handleTossPhoneLogin} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <input type="text" placeholder="NAME" value={phoneDetails.name} onChange={e => setPhoneDetails({...phoneDetails, name: e.target.value})} style={{ padding: '12px', background: 'var(--bg-dark)', border: '1px solid var(--border-color)', color: '#fff' }} />
                <input type="text" placeholder="YYMMDD" value={phoneDetails.birthday} onChange={e => setPhoneDetails({...phoneDetails, birthday: e.target.value})} style={{ padding: '12px', background: 'var(--bg-dark)', border: '1px solid var(--border-color)', color: '#fff' }} />
                <input type="text" placeholder="PHONE" value={phoneDetails.phone} onChange={e => setPhoneDetails({...phoneDetails, phone: e.target.value})} style={{ padding: '12px', background: 'var(--bg-dark)', border: '1px solid var(--border-color)', color: '#fff' }} />
                <button type="submit" style={{ padding: '12px', background: 'var(--accent-brand)' }}>START AUTH</button>
              </form>
            )}
            <div style={{ marginTop: '20px', display: 'flex', gap: '12px' }}>
              <button onClick={() => setRemoteLoginActive(false)}>CLOSE</button>
              <button onClick={() => setLoginMethod(loginMethod === 'qr' ? 'phone' : 'qr')}>SWITCH METHOD</button>
              <button onClick={handleManualLoginClick}>FORCE CLICK LOGIN</button>
            </div>
            <div style={{ marginTop: '12px', color: 'var(--accent-brand)' }}>{loginStatus}</div>
          </div>
        </div>
      )}
    </div>
  );
}
