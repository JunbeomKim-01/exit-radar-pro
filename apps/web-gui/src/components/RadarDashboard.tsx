import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Activity, RefreshCw,
  User, Globe,
  Briefcase, ArrowUpRight,
  CheckCircle2, Sparkles, Eye
} from 'lucide-react';
import { RadarAPI } from '../radar-api';
import { SentimentInsight } from './SentimentInsight';
import { SentimentTimeline } from './SentimentTimeline';
import { SentimentRatio } from './SentimentRatio';
import { PostList } from './PostList';
import { TradingViewChart } from './TradingViewChart';
import { SyncOverlay } from './SyncOverlay';
import { TrendReversalTab } from './TrendReversalTab';

const ShimmerLine = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px' }}>
    <div className="shimmer" style={{ height: '12px', width: '80%', borderRadius: '4px' }} />
    <div className="shimmer" style={{ height: '10px', width: '60%', borderRadius: '4px' }} />
  </div>
);

const Toast = ({ message, onClose }: { message: string, onClose: () => void }) => (
  <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 50, opacity: 0 }} style={{ position: 'fixed', bottom: '24px', right: '24px', background: 'rgba(20,184,166,0.15)', border: '1px solid var(--accent-brand)', padding: '16px 24px', borderRadius: '12px', backdropFilter: 'blur(10px)', color: 'var(--accent-brand)', display: 'flex', alignItems: 'center', gap: '12px', zIndex: 100000, boxShadow: '0 8px 32px rgba(0,0,0,0.4)', fontWeight: 900 }}>
    <CheckCircle2 size={20} />
    {message}
    <button onClick={onClose} style={{ marginLeft: '12px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer' }}>✕</button>
  </motion.div>
);


export function RadarDashboard() {
  const [selectedTicker, setSelectedTicker] = useState<string | null>('AAPL');
  const latestRequestTicker = useRef<string | null>(null);
  const [insightData, setInsightData] = useState<any | null>(null);
  const [timelineData, setTimelineData] = useState<any | null>(null);
  const [ratioData, setRatioData] = useState<any | null>(null);
  const [postsData, setPostsData] = useState<any | null>(null);
  const [sentimentLoading, setSentimentLoading] = useState(false);
  const [isFeedLoading, setIsFeedLoading] = useState(false);
  const [isInsightLoading, setIsInsightLoading] = useState(false);
  const [isSmartLoading, setIsSmartLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'market' | 'portfolio' | 'radar'>('overview');
  const [mobileTab, setMobileTab] = useState<'market' | 'portfolio' | 'ticker'>('market');
  const [marketContentTab, setMarketContentTab] = useState<'insiders' | 'politicians' | 'institutions'>('insiders');
  
  const [insiderTrades, setInsiderTrades] = useState<any[]>([]);
  const [institutions, setInstitutions] = useState<any[]>([]);
  const [politicians, setPoliticians] = useState<any[]>([]);
  const [portfolioData, setPortfolioData] = useState<any | null>(null);
  const [radarFeed, setRadarFeed] = useState<any[]>([]);
  
  // Scraper Sync States
  const [isScraping, setIsScraping] = useState(false);
  const [portfolioSortKey, setPortfolioSortKey] = useState<'return' | 'valuation' | 'ticker'>('valuation');
  const [tickerSubTab, setTickerSubTab] = useState<'chart' | 'insight' | 'smart' | 'feed'>('chart');
  const [scrapProgress, setScrapProgress] = useState(0);
  const [syncJobStatus, setSyncJobStatus] = useState<'pending' | 'running' | 'completed' | 'failed'>('pending');
  const [syncPostCount, setSyncPostCount] = useState(0);
  const [syncError, setSyncError] = useState<string | null>(null);

  // TOSS Secure Auth States
  const [remoteLoginActive, setRemoteLoginActive] = useState(false);
  const [loginStatus, setLoginStatus] = useState('READY_FOR_HANDSHAKE');
  const [loginProgress, setLoginProgress] = useState(false);
  const [confirmingLogin, setConfirmingLogin] = useState(false);
  const [phoneDetails, setPhoneDetails] = useState({ name: '', phone: '', birthday: '' });
  const [showToast, setShowToast] = useState<string | null>(null);

  useEffect(() => {
    fetchPortfolio();
    fetchRadarFeed();
    if (selectedTicker) {
      handleSelectTicker(selectedTicker);
    }
  }, []);

  const fetchPortfolio = async () => {
    try {
      const data = await RadarAPI.getPortfolio();
      setPortfolioData(data);
    } catch (err) {
      console.error('Portfolio fetch error:', err);
    }
  };

  const fetchRadarFeed = async () => {
    try {
      const data = await RadarAPI.getRadarFeed();
      setRadarFeed(data);
    } catch (err) {
      console.error('Radar feed error:', err);
    }
  };

  const handleSelectTicker = async (ticker: string) => {
    setSelectedTicker(ticker);
    latestRequestTicker.current = ticker;
    setSentimentLoading(true);
    
    // Strict State Reset: prevent ghost data from previous tickers
    setPostsData(null);
    setInsightData(null);
    setTimelineData(null);
    setRatioData(null);
    setInsiderTrades([]);
    setInstitutions([]);
    setPoliticians([]);
    
    setMarketContentTab('insiders'); 
    setSentimentLoading(true);
    setIsFeedLoading(true);
    setIsInsightLoading(true);
    setIsSmartLoading(true);

    // 1. Fetch Insight Data (Sentiment + Timeline + Ratio)
    const fetchInsightGroup = async () => {
      try {
        const [insight, timeline, ratio] = await Promise.all([
          RadarAPI.getSentimentInsight(ticker),
          RadarAPI.getSentimentTimeline(ticker),
          RadarAPI.getSentimentRatio(ticker)
        ]);
        if (latestRequestTicker.current === ticker) {
          setInsightData(insight);
          setTimelineData(timeline);
          setRatioData(ratio);
        }
      } finally {
        if (latestRequestTicker.current === ticker) setIsInsightLoading(false);
      }
    };

    // 2. Fetch Feed Data (Posts)
    const fetchFeedGroup = async () => {
      try {
        const posts = await RadarAPI.getTickerPosts(ticker);
        if (latestRequestTicker.current === ticker) setPostsData(posts);
      } finally {
        if (latestRequestTicker.current === ticker) setIsFeedLoading(false);
      }
    };

    // 3. Fetch Smart Data (Insider + Inst + Pol)
    const fetchSmartGroup = async () => {
      try {
        const [trades, inst, pol] = await Promise.all([
          RadarAPI.getInsiderTrades(ticker),
          RadarAPI.getInstitutionalHoldings(ticker),
          RadarAPI.getPoliticianTrades(ticker)
        ]);
        if (latestRequestTicker.current === ticker) {
          setInsiderTrades(trades);
          setInstitutions(inst);
          setPoliticians(pol);
        }
      } finally {
        if (latestRequestTicker.current === ticker) setIsSmartLoading(false);
      }
    };

    // Fire all groups in parallel - they will finish independently
    fetchInsightGroup();
    fetchFeedGroup();
    fetchSmartGroup();

    // Overall loading bar for the whole ticker view (as a general indicator)
    Promise.allSettled([fetchInsightGroup(), fetchFeedGroup(), fetchSmartGroup()]).then(() => {
      if (latestRequestTicker.current === ticker) setSentimentLoading(false);
    });
  };

  const handleTriggerScrap = async () => {
    if (!selectedTicker) return;
    setIsScraping(true);
    setSyncError(null);
    setScrapProgress(0);
    setSyncJobStatus('running');

    try {
      const result = await RadarAPI.triggerScrapJob(selectedTicker);
      if (result && result.jobId) {
        monitorScrapJob(result.jobId);
      } else {
        setSyncError('Failed to start scraping engine');
        setSyncJobStatus('failed');
      }
    } catch (err) {
      setSyncError('Network error during engine startup');
      setSyncJobStatus('failed');
    }
  };

  const monitorScrapJob = (jobId: string) => {
    const interval = setInterval(async () => {
      try {
        const result = await RadarAPI.getScrapJobStatus(jobId);
        const currentStatus = (result.status === 'running') ? 'running' : result.status;
        setSyncJobStatus(currentStatus);
        const progress = result.status === 'completed' ? 100 : Math.min((result.postCount / 20) * 100, 95);
        setScrapProgress(progress);
        setSyncPostCount(result.postCount || 0);

        if (currentStatus === 'completed') {
          clearInterval(interval);
          handleSelectTicker(selectedTicker || '');
        } else if (currentStatus === 'failed') {
          clearInterval(interval);
          setSyncError(result.error || 'Scraping engine crashed');
        }
      } catch (err) {
        clearInterval(interval);
        setSyncError('Connection to monitoring engine lost');
        setSyncJobStatus('failed');
      }
    }, 1500);
  };

  const handleTossPhoneLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginProgress(true);
    setLoginStatus('CONNECTING_TO_AUTH_SERVER...');
    try {
      const res = await RadarAPI.tossAuthPhone(phoneDetails.name, phoneDetails.birthday, phoneDetails.phone);
      if (res.success) {
        setLoginStatus('WAITING_FOR_MOBILE_CONFIRMATION...');
        setConfirmingLogin(true);
      } else {
        setLoginStatus('AUTH_REJECTED_BY_SERVER');
        setTimeout(() => setLoginProgress(false), 2000);
      }
    } catch (err) {
      setLoginStatus('HANDSHAKE_FAILED');
      setTimeout(() => setLoginProgress(false), 2000);
    }
  };

  const handleManualLoginClick = async () => {
    setConfirmingLogin(true);
    setLoginStatus('ESTABLISHING_HTTPS_TUNNEL...');
    try {
      const res = await RadarAPI.tossAuthManualClick();
      if (res.success) {
        setLoginStatus('REMOTE_AUTH_SESSION_ESTABLISHED');
        setShowToast('포트폴리오 연동에 성공했습니다!');
        setTimeout(() => {
          setRemoteLoginActive(false);
          setLoginProgress(false);
          fetchPortfolio();
        }, 2000);
      } else {
        setLoginStatus('AUTH_HEARTBEAT_TIMEOUT');
        setTimeout(() => setConfirmingLogin(false), 2000);
      }
    } catch (err) {
      setLoginStatus('REMOTE_PROTOCOL_ERROR');
      setTimeout(() => setConfirmingLogin(false), 2000);
    }
  };

  return (
    <div className="terminal-container" style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: 'var(--bg-dark)', overflow: 'hidden' }}>
      
      {/* ─── Top Utility Navigation Bar (Responsive Consistently) ─── */}
      <nav className="terminal-nav" style={{ height: '56px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(10px)', zIndex: 1000, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '10px', height: '10px', background: 'var(--accent-brand)', borderRadius: '50%', boxShadow: '0 0 12px var(--accent-brand)' }} />
          <h1 style={{ fontSize: '13px', fontWeight: 900, letterSpacing: '0.05em', color: '#fff', margin: 0 }}>
            RADAR_PRO <span className="desktop-only" style={{ opacity: 0.4, fontWeight: 500 }}>V0.1.0</span>
          </h1>
        </div>

        {/* Desktop Main Tabs */}
        <div className="desktop-only" style={{ display: 'flex', gap: '4px' }}>
          {(['overview', 'market', 'portfolio', 'radar'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} className={activeTab === tab ? 'active' : ''} style={{ padding: '6px 14px', borderRadius: '8px', border: 'none', background: activeTab === tab ? 'rgba(255,255,255,0.05)' : 'transparent', color: activeTab === tab ? 'var(--accent-brand)' : 'var(--text-muted)', fontSize: '10px', fontWeight: 900, cursor: 'pointer', textTransform: 'uppercase' }}>
              {tab}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div className="nums desktop-only" style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{new Date().toLocaleTimeString()}</div>
          <button className="desktop-only" onClick={() => setRemoteLoginActive(true)} style={{ width: '28px', height: '28px', background: 'rgba(255,255,255,0.05)', borderRadius: '50%', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><User size={14} color={portfolioData ? 'var(--accent-brand)' : 'var(--text-muted)'} /></button>
        </div>
      </nav>

      {/* ─── Mobile Bottom Tab Navigation (Slim 2-Tab Mode) ─── */}
      <div className="mobile-only" style={{ position: 'fixed', bottom: 0, left: 0, right: 0, height: '64px', background: 'rgba(10,12,18,0.95)', borderTop: '1px solid var(--border-color)', display: 'flex', zIndex: 1000, backdropFilter: 'blur(20px)' }}>
          <button onClick={() => setMobileTab('market')} style={{ flex: 1, border: 'none', background: 'transparent', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px', color: mobileTab === 'market' ? 'var(--accent-brand)' : 'var(--text-muted)' }}>
             <Globe size={20} />
             <span style={{ fontSize: '10px', fontWeight: 900 }}>MARKET_ANALYSIS</span>
          </button>
          <button onClick={() => setMobileTab('portfolio')} style={{ flex: 1, border: 'none', background: 'transparent', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px', color: mobileTab === 'portfolio' ? 'var(--accent-brand)' : 'var(--text-muted)' }}>
             <Briefcase size={20} />
             <span style={{ fontSize: '10px', fontWeight: 900 }}>MY_PORTFOLIO</span>
          </button>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        
        {/* ─── Desktop Multi-Section Sidebar (Ticker & Portfolio Unified) ─── */}
        <aside className="desktop-only" style={{ width: '320px', borderRight: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,0.15)' }}>
          
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {/* Asset Section */}
            <div style={{ padding: '24px 20px 12px' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 800, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}><Briefcase size={12} />MY_ASSETS_STATE</div>
              {portfolioData?.items?.length > 0 ? (
                portfolioData.items.map((item: any) => (
                  <motion.div key={item.ticker} onClick={() => { setSelectedTicker(item.ticker); handleSelectTicker(item.ticker); setActiveTab('overview'); }} whileHover={{ x: 4, background: 'rgba(255,255,255,0.02)' }} style={{ padding: '12px 14px', borderRadius: '12px', cursor: 'pointer', marginBottom: '6px', border: '1px solid transparent', borderColor: selectedTicker === item.ticker ? 'rgba(139,92,246,0.2)' : 'transparent', background: selectedTicker === item.ticker ? 'rgba(139,92,246,0.05)' : 'transparent' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 900, color: '#fff', fontSize: '13px' }}>{item.ticker}</span>
                      <span className="nums" style={{ fontSize: '11px', color: item.returnRate >= 0 ? 'var(--accent-up)' : 'var(--accent-down)', fontWeight: 800 }}>{item.returnRate >= 0 ? '+' : ''}{item.returnRate.toFixed(1)}%</span>
                    </div>
                  </motion.div>
                ))
              ) : (
                <div style={{ padding: '12px', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>포트폴리오 연동이 필요합니다.</div>
              )}
            </div>

            <div style={{ margin: '0 20px', borderTop: '1px solid var(--border-color)' }} />

            {/* Watchlist Section */}
            <div style={{ padding: '20px' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 800, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}><Eye size={12} />WATCHLIST_CORE</div>
              {['AAPL', 'TSLA', 'NVDA', 'MSFT', 'AMZN', 'GOOGL', 'META', 'NFLX', 'AMD', 'COIN'].map(ticker => (
                <motion.div key={ticker} onClick={() => { setSelectedTicker(ticker); handleSelectTicker(ticker); setActiveTab('overview'); }} whileHover={{ x: 4, background: 'rgba(255,255,255,0.02)' }} style={{ padding: '10px 14px', borderRadius: '10px', cursor: 'pointer', marginBottom: '4px', border: '1px solid transparent', borderColor: selectedTicker === ticker ? 'rgba(139,92,246,0.2)' : 'transparent', background: selectedTicker === ticker ? 'rgba(139,92,246,0.05)' : 'transparent' }}>
                   <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 900, fontSize: '13px', color: selectedTicker === ticker ? 'var(--accent-brand)' : '#fff' }}>{ticker}</span>
                      <Sparkles size={12} color="rgba(255,255,255,0.2)" />
                   </div>
                </motion.div>
              ))}
            </div>
          </div>
        </aside>

        {/* ─── Main Content Switcher ─── */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
           <AnimatePresence mode="wait">
             
             {/* ─── CASE: OVERVIEW (Responsive Dashboard) ─── */}
             {window.innerWidth > 1024 && activeTab === 'overview' && (
                <motion.div key="overview-view" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="terminal-grid" style={{ display: 'grid', gridTemplateColumns: window.innerWidth > 1024 ? 'minmax(0, 1fr) 400px' : '1fr', gap: window.innerWidth > 1024 ? '32px' : '0', padding: window.innerWidth > 1024 ? '32px' : '0' }}>
                   <section className="terminal-panel" style={{ height: window.innerWidth > 1024 ? '540px' : '300px', border: 'none' }}><TradingViewChart ticker={selectedTicker || 'AAPL'} /></section>
                   <aside className="terminal-panel" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', border: 'none' }}>
                      <div className="terminal-header"><span>SOCIAL_INTELLIGENCE</span></div>
                      <div className="terminal-content" style={{ overflowY: 'auto', padding: 0 }}>
                         <div style={{ padding: '24px 20px' }}><SentimentInsight insight={insightData} loading={sentimentLoading} /></div>
                         <div style={{ height: '240px', padding: '0 20px' }}>{timelineData && <SentimentTimeline timeline={timelineData.timeline} />}</div>
                         <div className="smart-sync-section" style={{ margin: '20px', padding: '20px', background: 'rgba(255,255,255,0.02)', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
                            <button onClick={handleTriggerScrap} disabled={isScraping} style={{ width: '100%', padding: '14px', background: 'var(--accent-brand)', color: '#000', borderRadius: '8px', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}><RefreshCw size={16} className={isScraping ? 'animate-spin' : ''} />{isScraping ? "SCROLLING_THREADS..." : "START_LIVE_SYNC"}</button>
                         </div>
                         <div style={{ padding: '0 20px 24px' }}>{ratioData && <SentimentRatio {...ratioData} />}</div>
                         <div style={{ borderTop: '1px solid var(--border-color)', padding: '16px' }}><PostList posts={postsData?.posts || []} /></div>
                      </div>
                   </aside>

                   {/* Sub-Data Section (Smart Money Feed) */}
                   <section className="terminal-panel" style={{ minHeight: '400px', border: 'none' }}>
                      <div className="terminal-header">
                        <div className="mobile-scroll-container" style={{ display: 'flex', gap: '20px', overflowX: 'auto', paddingBottom: '4px' }}>
                           <button onClick={() => setMarketContentTab('insiders')} className={marketContentTab === 'insiders' ? 'active' : ''} style={{ background: 'transparent', border: 'none', color: marketContentTab === 'insiders' ? '#fff' : 'var(--text-muted)', fontSize: '11px', fontWeight: 900, cursor: 'pointer', whiteSpace: 'nowrap' }}>INSIDER_FLOW</button>
                           <button onClick={() => setMarketContentTab('politicians')} className={marketContentTab === 'politicians' ? 'active' : ''} style={{ background: 'transparent', border: 'none', color: marketContentTab === 'politicians' ? '#fff' : 'var(--text-muted)', fontSize: '11px', fontWeight: 900, cursor: 'pointer', whiteSpace: 'nowrap' }}>POLITICIAN_RADAR</button>
                           <button onClick={() => setMarketContentTab('institutions')} className={marketContentTab === 'institutions' ? 'active' : ''} style={{ background: 'transparent', border: 'none', color: marketContentTab === 'institutions' ? '#fff' : 'var(--text-muted)', fontSize: '11px', fontWeight: 900, cursor: 'pointer', whiteSpace: 'nowrap' }}>INSTITUTIONAL_HOLDINGS</button>
                        </div>
                      </div>
                      <div className="terminal-content" style={{ padding: '24px', overflowY: 'auto' }}>
                         <table className="data-table">
                            {marketContentTab === 'insiders' ? (
                               <><thead><tr><th>OFFICER</th><th>SIDE</th><th>SHARES</th><th>VALUE</th><th>FILED</th></tr></thead>
                               <tbody>{insiderTrades.map((tr, idx) => (<tr key={idx}><td>{tr.officerName}</td><td className={tr.side === 'BUY' ? 'insider-buy' : 'insider-sell'}>{tr.side}</td><td>{tr.shares?.toLocaleString()}</td><td>${(tr.value / 1000).toFixed(0)}K</td><td>{new Date(tr.transactionDate).toLocaleDateString()}</td></tr>))}</tbody></>
                            ) : marketContentTab === 'politicians' ? (
                               <><thead><tr><th>POLITICIAN</th><th>PARTY</th><th>SIDE</th><th>AMOUNT</th><th>DATE</th></tr></thead>
                               <tbody>{politicians.map((pt, idx) => (<tr key={idx}><td>{pt.politicianName}</td><td>{pt.party}</td><td className={pt.side === 'BUY' ? 'insider-buy' : 'insider-sell'}>{pt.side}</td><td className="nums">{pt.amountRange}</td><td>{new Date(pt.transactionDate).toLocaleDateString()}</td></tr>))}</tbody></>
                            ) : (
                               <><thead><tr><th>INSTITUTION_ENTITY</th><th>TOTAL_SHARES</th><th>QUARTERLY_DELTA</th><th>REPORT_DATE</th></tr></thead>
                               <tbody>{institutions.map((ih, idx) => (<tr key={idx}><td>{ih.investorName}</td><td className="nums">{ih.totalShares?.toLocaleString()}</td><td style={{ color: ih.changeAmount >= 0 ? 'var(--accent-up)' : 'var(--accent-down)' }}>{ih.changeAmount >= 0 ? '+' : ''}{ih.changePercentage?.toFixed(2)}%</td><td>{new Date(ih.reportDate).toLocaleDateString()}</td></tr>))}</tbody></>
                            )}
                         </table>
                      </div>
                   </section>
                </motion.div>
             )}

             {/* ─── CASE: MARKET (Macro Yield Curve & Strategy) ─── */}
             {window.innerWidth > 1024 && activeTab === 'market' && (
                <motion.div key="market-view" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ height: '100%', overflow: 'hidden' }}>
                   <TrendReversalTab />
                </motion.div>
             )}

             {/* ─── CASE: PORTFOLIO (Full Asset Management) ─── */}
             {window.innerWidth > 1024 && activeTab === 'portfolio' && (
                <motion.div key="portfolio-view" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} style={{ padding: '40px' }}>
                   <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px' }}>
                      <h2 style={{ fontSize: '36px', fontWeight: 900, color: '#fff', margin: 0, letterSpacing: '-0.02em' }}>ASSET_PORTFOLIO</h2>
                      <div style={{ display: 'flex', gap: '32px' }}>
                         <div style={{ textAlign: 'right' }}><div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 800 }}>VALUE_VALUATION</div><div className="nums" style={{ fontSize: '28px', fontWeight: 900 }}>${portfolioData?.totalAssetValue?.toLocaleString() || '0'}</div></div>
                         <div style={{ textAlign: 'right' }}><div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 800 }}>TOTAL_ROI</div><div className="nums" style={{ fontSize: '28px', fontWeight: 900, color: (portfolioData?.totalReturnRate || 0) >= 0 ? 'var(--accent-up)' : 'var(--accent-down)' }}>{(portfolioData?.totalReturnRate || 0) >= 0 ? '+' : ''}{portfolioData?.totalReturnRate?.toFixed(2)}%</div></div>
                      </div>
                   </div>
                   <div className="terminal-panel" style={{ overflow: 'hidden' }}>
                      <table className="data-table">
                         <thead><tr><th>TICKER</th><th>ASSET</th><th>QUANTITY</th><th>PRICE</th><th>RETURN</th><th>VALUATION</th></tr></thead>
                         <tbody>{portfolioData?.items.map((item: any) => (<tr key={item.ticker} onClick={() => { setSelectedTicker(item.ticker); setActiveTab('overview'); handleSelectTicker(item.ticker); }} style={{ cursor: 'pointer' }}><td>{item.ticker}</td><td>{item.name}</td><td>{item.quantity}</td><td>${item.currentPrice?.toLocaleString()}</td><td style={{ color: item.returnRate >= 0 ? 'var(--accent-up)' : 'var(--accent-down)', fontWeight: 900 }}>{item.returnRate.toFixed(2)}%</td><td className="nums">${(item.currentPrice * item.quantity).toLocaleString()}</td></tr>))}</tbody>
                      </table>
                   </div>
                </motion.div>
             )}

             {/* ─── CASE: RADAR (Real-time Event Watch Feed) ─── */}
             {window.innerWidth > 1024 && activeTab === 'radar' && (
                <motion.div key="radar-view" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ padding: '32px' }}>
                   <div style={{ marginBottom: '32px' }}><h2 style={{ fontSize: '32px', fontWeight: 900, color: '#fff', margin: 0 }}>RADAR_WATCH_FEED</h2><p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '4px' }}>글로벌 시장의 수급 이벤트를 0.5초 주기로 스캔합니다.</p></div>
                   <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '20px' }}>
                      {radarFeed.length > 0 ? radarFeed.map((event, i) => (
                        <motion.div key={i} whileHover={{ y: -4, background: 'rgba(255,255,255,0.03)' }} style={{ padding: '24px', background: 'var(--bg-card)', borderRadius: '20px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div style={{ padding: '6px 12px', background: 'rgba(139,92,246,0.1)', borderRadius: '6px', color: 'var(--accent-brand)', fontSize: '10px', fontWeight: 900 }}>{event.category || 'EVENT'}</div>
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500 }}>{new Date(event.timestamp || Date.now()).toLocaleTimeString()}</span>
                           </div>
                           <div style={{ fontSize: '16px', fontWeight: 800, color: '#fff', lineHeight: 1.5 }}>{event.title}</div>
                           <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{event.description}</div>
                           <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '8px' }}>
                              <div style={{ padding: '4px 10px', borderRadius: '4px', background: 'rgba(255,255,255,0.03)', fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)' }}>{event.ticker}</div>
                              <ArrowUpRight size={14} color="var(--accent-brand)" />
                           </div>
                        </motion.div>
                      )) : [1,2,3,4,5,6].map(i => <div key={i} style={{ height: '160px', background: 'var(--bg-card)', borderRadius: '20px', border: '1px solid var(--border-color)' }}><ShimmerLine /></div>)}
                   </div>
                </motion.div>
             )}

             {/* ─── CASE: MOBILE STOCK DETAIL 2.0 (HIGH-FIDELITY) ─── */}
             {window.innerWidth <= 1024 && mobileTab === 'ticker' && (
                <motion.div key="mobile-ticker-v2" className="mobile-only" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-dark)' }}>
                   
                   {/* Ticker Header & Dynamic Sub-Tabs */}
                   <div style={{ padding: '20px', paddingBottom: '0', background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid var(--border-color)', position: 'sticky', top: 0, zIndex: 10 }}>
                      {(sentimentLoading || isScraping) && (
                         <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '2px', background: 'rgba(255,255,255,0.05)', zIndex: 20 }}>
                            <motion.div initial={{ width: 0 }} animate={{ width: '100%' }} transition={{ repeat: Infinity, duration: 1.5 }} style={{ height: '100%', background: 'var(--accent-brand)', boxShadow: '0 0 12px var(--accent-brand)' }} />
                         </div>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                         <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                           <div style={{ width: '4px', height: '24px', background: 'var(--accent-brand)', borderRadius: '2px' }} />
                           <h2 style={{ fontSize: '28px', fontWeight: 900, color: '#fff', margin: 0 }}>{selectedTicker}</h2>
                         </div>
                         <button onClick={() => setMobileTab('portfolio')} style={{ fontSize: '10px', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', padding: '6px 14px', borderRadius: '12px', fontWeight: 900, letterSpacing: '0.05em' }}>CLOSE_TERMINAL</button>
                      </div>
                      
                      {/* SUB-TAB NAVIGATOR */}
                      <div style={{ display: 'flex', gap: '4px', paddingBottom: '12px', overflowX: 'auto' }} className="mobile-scroll-container">
                         {(['chart', 'insight', 'smart', 'feed'] as const).map(tab => (
                            <button key={tab} onClick={() => setTickerSubTab(tab)} style={{ flexShrink: 0, padding: '10px 18px', borderRadius: '12px', border: '1px solid', borderColor: tickerSubTab === tab ? 'rgba(252,213,53,0.3)' : 'transparent', background: tickerSubTab === tab ? 'rgba(252,213,53,0.1)' : 'transparent', color: tickerSubTab === tab ? 'var(--accent-brand)' : 'var(--text-muted)', fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', transition: 'all 0.3s ease' }}>
                               {tab}
                            </button>
                         ))}
                      </div>
                   </div>

                   <div style={{ flex: 1, overflowY: 'auto', padding: '20px', paddingBottom: '110px' }}>
                      <AnimatePresence mode="wait">
                         {tickerSubTab === 'chart' && (
                            <motion.div key="sub-chart" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                               {/* Realtime Indicators moved to TOP per user request */}
                               <div style={{ padding: '20px', background: 'rgba(252,213,53,0.03)', borderRadius: '20px', border: '1px dashed rgba(252,213,53,0.2)' }}>
                                  <div style={{ fontSize: '11px', color: 'var(--accent-brand)', fontWeight: 900, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                     <Activity size={14} /> REALTIME_INDICATORS
                                  </div>
                                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{insightData?.summary || "종목의 실시간 수급 및 소셜 심리를 분석하고 있습니다. 잠시만 기다려 주십시오."}</div>
                                </div>
                                
                                <div style={{ height: '500px', background: 'var(--bg-card)', borderRadius: '24px', overflow: 'hidden', border: '1px solid var(--border-color)', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
                                  <TradingViewChart ticker={selectedTicker || 'AAPL'} />
                               </div>
                            </motion.div>
                         )}

                         {tickerSubTab === 'insight' && (
                            <motion.div key="sub-insight" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                               {isInsightLoading && (
                                 <div style={{ height: '2px', background: 'rgba(255,255,255,0.05)', overflow: 'hidden', borderRadius: '1px' }}>
                                   <motion.div initial={{ x: '-100%' }} animate={{ x: '100%' }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} style={{ height: '100%', width: '30%', background: 'var(--accent-brand)' }} />
                                 </div>
                               )}
                               <SentimentInsight insight={insightData} loading={isInsightLoading} />
                               <div style={{ height: '240px', background: 'var(--bg-card)', borderRadius: '24px', padding: '20px', border: '1px solid var(--border-color)', position: 'relative' }}>
                                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 800, marginBottom: '16px' }}>SENTIMENT_TIMELINE</div>
                                  {isInsightLoading && !timelineData ? <ShimmerLine /> : (timelineData && <SentimentTimeline timeline={timelineData.timeline} />)}
                               </div>
                               <div style={{ background: 'var(--bg-card)', borderRadius: '24px', padding: '20px', border: '1px solid var(--border-color)', position: 'relative' }}>
                                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 800, marginBottom: '16px' }}>SENTIMENT_RATIO</div>
                                  {isInsightLoading && !ratioData ? <ShimmerLine /> : (ratioData && <SentimentRatio {...ratioData} />)}
                               </div>
                            </motion.div>
                         )}

                         {tickerSubTab === 'smart' && (
                            <motion.div key="sub-smart" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                               <section className="terminal-panel" style={{ border: 'none', background: 'rgba(255,255,255,0.02)', borderRadius: '24px', overflow: 'hidden' }}>
                                  <div className="terminal-header" style={{ padding: '16px', background: 'rgba(255,255,255,0.03)' }}>
                                    <div className="mobile-scroll-container" style={{ display: 'flex', gap: '20px', overflowX: 'auto', paddingBottom: '4px' }}>
                                       <button onClick={() => setMarketContentTab('insiders')} className={marketContentTab === 'insiders' ? 'active' : ''} style={{ background: 'transparent', border: 'none', color: marketContentTab === 'insiders' ? '#fff' : 'var(--text-muted)', fontSize: '11px', fontWeight: 900, cursor: 'pointer', whiteSpace: 'nowrap' }}>INSIDER_FLOW</button>
                                       <button onClick={() => setMarketContentTab('politicians')} className={marketContentTab === 'politicians' ? 'active' : ''} style={{ background: 'transparent', border: 'none', color: marketContentTab === 'politicians' ? '#fff' : 'var(--text-muted)', fontSize: '11px', fontWeight: 900, cursor: 'pointer', whiteSpace: 'nowrap' }}>POLITICIAN</button>
                                       <button onClick={() => setMarketContentTab('institutions')} className={marketContentTab === 'institutions' ? 'active' : ''} style={{ background: 'transparent', border: 'none', color: marketContentTab === 'institutions' ? '#fff' : 'var(--text-muted)', fontSize: '11px', fontWeight: 900, cursor: 'pointer', whiteSpace: 'nowrap' }}>INSTITUTIONAL</button>
                                    </div>
                                  </div>
                                  <div className="terminal-content" style={{ padding: '16px', overflowX: 'auto', position: 'relative' }}>
                                     {isSmartLoading && (
                                       <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: 'rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                                         <motion.div initial={{ x: '-100%' }} animate={{ x: '100%' }} transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }} style={{ height: '100%', width: '40%', background: 'var(--accent-brand)' }} />
                                       </div>
                                     )}
                                     <table className="data-table" style={{ fontSize: '11px' }}>
                                        {isSmartLoading && insiderTrades.length === 0 ? (
                                           <tbody>{[1,2,3,4,5,6].map(i => <tr key={i}><td colSpan={4} style={{ padding: 0 }}><ShimmerLine /></td></tr>)}</tbody>
                                        ) : marketContentTab === 'insiders' ? (
                                           <><thead><tr><th>ENTITY</th><th>SIDE</th><th>VALUE</th><th>FILED</th></tr></thead>
                                           <tbody>{insiderTrades.slice(0, 15).map((tr, idx) => (
                                             <tr key={idx}>
                                               <td style={{ maxWidth: '100px' }}>
                                                 <div style={{ fontWeight: 900, color: '#fff', fontSize: '11px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tr.insiderName}</div>
                                                 <div style={{ fontSize: '9px', color: 'var(--text-muted)' }}>{tr.role || 'Officer'}</div>
                                               </td>
                                               <td className={tr.side === 'BUY' ? 'insider-buy' : 'insider-sell'}>{tr.side}</td>
                                               <td>${((tr.shares * tr.pricePerShare) / 1000).toFixed(0)}K</td>
                                               <td>{new Date(tr.transactionDate).toLocaleDateString()}</td>
                                             </tr>
                                           ))}</tbody></>
                                        ) : marketContentTab === 'politicians' ? (
                                           <><thead><tr><th>POLITICIAN</th><th>SIDE</th><th>AMOUNT</th><th>DATE</th></tr></thead>
                                           <tbody>{politicians.slice(0, 15).map((pt, idx) => (
                                             <tr key={idx}>
                                               <td>
                                                 <div style={{ fontWeight: 900, color: '#fff', fontSize: '11px' }}>{pt.politicianName}</div>
                                                 <div style={{ fontSize: '9px', color: pt.party === 'Democrat' ? '#3b82f6' : '#ef4444' }}>{pt.party}</div>
                                               </td>
                                               <td className={pt.side === 'BUY' ? 'insider-buy' : 'insider-sell'}>{pt.side}</td>
                                               <td className="nums">{pt.amountRange}</td>
                                               <td>{new Date(pt.transactionDate).toLocaleDateString()}</td>
                                             </tr>
                                           ))}</tbody></>
                                        ) : (
                                           <><thead><tr><th>INSTITUTION</th><th>TOTAL</th><th>DELTA</th><th>DATE</th></tr></thead>
                                           <tbody>{institutions.slice(0, 15).map((ih, idx) => (
                                             <tr key={idx}>
                                               <td style={{ maxWidth: '120px' }}>
                                                 <div style={{ fontWeight: 900, color: '#fff', fontSize: '11px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ih.investorName}</div>
                                               </td>
                                               <td className="nums">{ih.totalShares?.toLocaleString()}</td>
                                               <td style={{ color: ih.changeAmount >= 0 ? 'var(--accent-up)' : 'var(--accent-down)', fontWeight: 800 }}>{ih.changePercentage?.toFixed(2)}%</td>
                                               <td>{new Date(ih.reportDate).toLocaleDateString()}</td>
                                             </tr>
                                           ))}</tbody></>
                                        )}
                                     </table>
                                  </div>
                               </section>
                            </motion.div>
                         )}

                         {tickerSubTab === 'feed' && (
                            <motion.div key="sub-feed" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                     <Activity size={14} color="var(--accent-brand)" className={isFeedLoading ? 'animate-pulse' : ''} />
                                     <span style={{ fontSize: '13px', fontWeight: 900, color: '#fff', letterSpacing: '0.05em' }}>REALTIME_SOCIAL_DATA</span>
                                  </div>
                                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 800 }}>
                                     {isFeedLoading ? "FETCHING..." : `${postsData?.posts?.length || 0}_THREADS`}
                                  </span>
                               </div>

                               <div style={{ borderRadius: '24px', overflow: 'hidden', border: '1px solid var(--border-color)', background: 'var(--bg-card)', position: 'relative' }}>
                                  {isFeedLoading && (
                                     <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: 'rgba(255,255,255,0.05)', overflow: 'hidden', zIndex: 5 }}>
                                        <motion.div initial={{ x: '-100%' }} animate={{ x: '100%' }} transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }} style={{ height: '100%', width: '25%', background: 'var(--accent-brand)' }} />
                                     </div>
                                  )}
                                  {(isFeedLoading && !postsData) ? (
                                     <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                                        {[1, 2, 3, 4, 5].map(i => (
                                           <div key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                              <ShimmerLine />
                                           </div>
                                        ))}
                                     </div>
                                  ) : (
                                     <PostList posts={postsData?.posts || []} />
                                  )}
                               </div>
                            </motion.div>
                         )}
                      </AnimatePresence>
                   </div>

                   {/* Mobile Floating Sync Button (Scrap Button) */}
                   <motion.button 
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={handleTriggerScrap}
                      disabled={isScraping}
                      style={{ 
                        position: 'fixed', 
                        bottom: '90px', 
                        right: '24px', 
                        width: '64px', 
                        height: '64px', 
                        borderRadius: '32px', 
                        background: 'var(--accent-brand)', 
                        color: '#000', 
                        border: 'none', 
                        boxShadow: '0 12px 32px rgba(252,213,53,0.4)', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center', 
                        zIndex: 2000,
                        cursor: 'pointer'
                      }}
                   >
                      <RefreshCw size={28} className={isScraping ? 'animate-spin' : ''} />
                   </motion.button>
                </motion.div>
             )}

             {/* ─── CASE: MOBILE MARKET ─── */}
             {window.innerWidth <= 1024 && mobileTab === 'market' && (
                <motion.div key="mobile-market" className="mobile-only" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ height: '100%', paddingBottom: '100px', overflowY: 'auto' }}>
                   <div style={{ padding: '24px 20px 0' }}><h2 style={{ fontSize: '24px', fontWeight: 900, color: '#fff', margin: 0, letterSpacing: '-0.02em' }}>MARKET_STATUS</h2></div>
                   
                   {/* Quick Ticker Access for Mobile */}
                   <div style={{ padding: '20px' }}>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 800, marginBottom: '12px', letterSpacing: '0.05em' }}>TRENDING_TICKERS</div>
                      <div className="mobile-scroll-container" style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '8px' }}>
                         {['AAPL', 'TSLA', 'NVDA', 'MSFT', 'COIN', 'AMD'].map(ticker => (
                            <button key={ticker} onClick={() => { setSelectedTicker(ticker); handleSelectTicker(ticker); setMobileTab('ticker'); }} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '12px 18px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', minWidth: '90px' }}>
                               <span style={{ fontWeight: 900, fontSize: '14px', color: 'var(--accent-brand)' }}>{ticker}</span>
                               <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: 700 }}>EXPLORE</span>
                            </button>
                         ))}
                      </div>
                   </div>

                   <TrendReversalTab />
                </motion.div>
             )}

             {/* ─── CASE: MOBILE PORTFOLIO ─── */}
             {window.innerWidth <= 1024 && mobileTab === 'portfolio' && (
                <motion.div key="mobile-portfolio" className="mobile-only" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: 'flex', flexDirection: 'column' }}>
                   <div style={{ padding: '24px 20px', borderBottom: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                     <div>
                       <h2 style={{ fontSize: '20px', fontWeight: 900, color: '#fff', margin: 0 }}>MY_PORTFOLIO</h2>
                       <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 800, marginTop: '4px' }}>REALTIME_ASSET_VALUATION</div>
                     </div>
                     <button onClick={() => setRemoteLoginActive(true)} style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(252,213,53,0.1)', border: '1px solid rgba(252,213,53,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><User size={20} color="var(--accent-brand)" /></button>
                   </div>
                   
                   {loginProgress && (
                      <div style={{ height: '2px', background: 'rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                         <motion.div initial={{ width: 0 }} animate={{ width: '100%' }} transition={{ repeat: Infinity, duration: 1.5 }} style={{ height: '100%', background: 'var(--accent-brand)', boxShadow: '0 0 12px var(--accent-brand)' }} />
                      </div>
                   )}

                   {/* Sorting Filters */}
                   <div style={{ padding: '16px 20px', display: 'flex', gap: '8px', overflowX: 'auto', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border-color)' }}>
                      <button onClick={() => setPortfolioSortKey('ticker')} style={{ background: portfolioSortKey === 'ticker' ? 'var(--accent-brand)' : 'rgba(255,255,255,0.05)', color: portfolioSortKey === 'ticker' ? '#000' : 'var(--text-muted)', border: 'none', padding: '6px 12px', borderRadius: '8px', fontSize: '10px', fontWeight: 900, whiteSpace: 'nowrap' }}>NAME🔗</button>
                      <button onClick={() => setPortfolioSortKey('return')} style={{ background: portfolioSortKey === 'return' ? 'var(--accent-brand)' : 'rgba(255,255,255,0.05)', color: portfolioSortKey === 'return' ? '#000' : 'var(--text-muted)', border: 'none', padding: '6px 12px', borderRadius: '8px', fontSize: '10px', fontWeight: 900, whiteSpace: 'nowrap' }}>ROI%🔥</button>
                      <button onClick={() => setPortfolioSortKey('valuation')} style={{ background: portfolioSortKey === 'valuation' ? 'var(--accent-brand)' : 'rgba(255,255,255,0.05)', color: portfolioSortKey === 'valuation' ? '#000' : 'var(--text-muted)', border: 'none', padding: '6px 12px', borderRadius: '8px', fontSize: '10px', fontWeight: 900, whiteSpace: 'nowrap' }}>VALUE💎</button>
                   </div>

                   <div style={{ padding: '20px', paddingBottom: '100px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {[...(portfolioData?.items || [])].sort((a, b) => {
                      if (portfolioSortKey === 'return') return b.returnRate - a.returnRate;
                      if (portfolioSortKey === 'valuation') return (b.currentPrice * b.quantity) - (a.currentPrice * a.quantity);
                      return a.ticker.localeCompare(b.ticker);
                    }).map((item: any) => (
                       <motion.div 
                          key={item.ticker} 
                          animate={loginProgress ? { opacity: [1, 0.4, 1] } : {}}
                          transition={loginProgress ? { repeat: Infinity, duration: 1.5 } : {}}
                          onClick={() => { setSelectedTicker(item.ticker); handleSelectTicker(item.ticker); setMobileTab('ticker'); }} 
                          style={{ padding: '16px', background: 'var(--bg-card)', borderRadius: '20px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '12px', cursor: 'pointer' }}
                       >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                               <div style={{ fontWeight: 900, color: '#fff', fontSize: '18px' }}>{item.ticker}</div>
                               <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>{item.name}</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                               <div className="nums" style={{ fontSize: '18px', fontWeight: 900, color: item.returnRate >= 0 ? 'var(--accent-up)' : 'var(--accent-down)' }}>{item.returnRate >= 0 ? '+' : ''}{item.returnRate.toFixed(2)}%</div>
                               <div style={{ fontSize: '9px', fontWeight: 900, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Current_Yield</div>
                            </div>
                          </div>
                          
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', padding: '12px', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.03)' }}>
                             <div>
                                <div style={{ fontSize: '8px', color: 'var(--text-muted)', fontWeight: 800 }}>QUANTITY</div>
                                <div className="nums" style={{ fontSize: '13px', fontWeight: 900, color: '#fff' }}>{item.quantity}</div>
                             </div>
                             <div>
                                <div style={{ fontSize: '8px', color: 'var(--text-muted)', fontWeight: 800 }}>PRICE</div>
                                <div className="nums" style={{ fontSize: '13px', fontWeight: 900, color: '#fff' }}>${item.currentPrice?.toLocaleString()}</div>
                             </div>
                             <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '8px', color: 'var(--text-muted)', fontWeight: 800 }}>VALUATION</div>
                                <div className="nums" style={{ fontSize: '13px', fontWeight: 900, color: 'var(--accent-brand)' }}>${(item.currentPrice * item.quantity).toLocaleString()}</div>
                             </div>
                          </div>
                       </motion.div>
                    ))}
                   </div>
                </motion.div>
             )}

           </AnimatePresence>
        </div>
      </div>

      {/* ─── TOSS Secure Authentication Layer ─── */}
      <AnimatePresence>
        {remoteLoginActive && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10000, background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
            <motion.div initial={{ scale: 0.9, y: 30 }} animate={{ scale: 1, y: 0 }} style={{ background: 'var(--bg-panel)', padding: '40px', borderRadius: '32px', border: '1px solid var(--border-color)', width: '100%', maxWidth: '520px', boxShadow: '0 32px 64px rgba(0,0,0,0.6)', position: 'relative' }}>
               
               {/* Login Progress Overlay */}
               <AnimatePresence>
                 {loginProgress && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ position: 'absolute', inset: 0, background: 'var(--bg-panel)', borderRadius: '32px', zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '20px' }}>
                    <div style={{ position: 'relative', width: '80px', height: '80px' }}>
                       <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2, ease: "linear" }} style={{ position: 'absolute', inset: 0, border: '4px solid rgba(20,184,166,0.1)', borderTop: '4px solid var(--accent-brand)', borderRadius: '50%' }} />
                       <div style={{ position: 'absolute', inset: '20px', background: 'rgba(20,184,166,0.05)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Activity size={24} color="var(--accent-brand)" className="animate-pulse" /></div>
                    </div>
                    <div style={{ fontSize: '15px', fontWeight: 900, color: 'var(--accent-brand)', letterSpacing: '0.1em' }}>{loginStatus}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>보안 인증 세션을 동기화하는 중입니다.</div>
                    {confirmingLogin && <button onClick={handleManualLoginClick} style={{ marginTop: '20px', padding: '12px 24px', background: 'var(--accent-brand)', color: '#000', borderRadius: '8px', fontWeight: 900 }}>인증 시도 완료 (수동 확인)</button>}
                  </motion.div>
                 )}
               </AnimatePresence>

               <div style={{ textAlign: 'center', marginBottom: '32px' }}><h3 style={{ fontSize: '24px', fontWeight: 900, color: '#fff', margin: 0, letterSpacing: '0.05em' }}>TOSS_SECURE_AUTH</h3><p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '8px' }}>사용자의 소중한 자산 정보를 안전하게 연동합니다.</p></div>
               
               <div style={{ background: 'rgba(0,0,0,0.2)', padding: '32px', borderRadius: '24px', border: '1px solid rgba(255,255,255,0.05)', marginBottom: '32px' }}>
                <form onSubmit={handleTossPhoneLogin} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div><label style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 800, marginBottom: '6px', display: 'block' }}>USER_NAME_FULL</label><input type="text" value={phoneDetails.name} onChange={e => setPhoneDetails({...phoneDetails, name: e.target.value})} style={{ width: '100%', padding: '16px', background: 'var(--bg-dark)', border: '1px solid var(--border-color)', color: '#fff', borderRadius: '10px', fontSize: '15px' }} /></div>
                  <div><label style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 800, marginBottom: '6px', display: 'block' }}>BIRTH_DATE (YYYYMMDD)</label><input type="text" value={phoneDetails.birthday} onChange={e => setPhoneDetails({...phoneDetails, birthday: e.target.value})} style={{ width: '100%', padding: '16px', background: 'var(--bg-dark)', border: '1px solid var(--border-color)', color: '#fff', borderRadius: '10px' }} /></div>
                  <div><label style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 800, marginBottom: '6px', display: 'block' }}>MOBILE_PHONE_NUM</label><input type="text" value={phoneDetails.phone} onChange={e => setPhoneDetails({...phoneDetails, phone: e.target.value})} style={{ width: '100%', padding: '16px', background: 'var(--bg-dark)', border: '1px solid var(--border-color)', color: '#fff', borderRadius: '10px' }} /></div>
                  <button type="submit" style={{ padding: '18px', background: 'var(--accent-brand)', color: '#000', borderRadius: '10px', fontWeight: 900, marginTop: '12px' }}>휴대폰 인증 요청</button>
                </form>
               </div>
               <div style={{ textAlign: 'center' }}><button onClick={() => setRemoteLoginActive(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '13px', textDecoration: 'underline' }}>나중에 연동하기</button></div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>{showToast && <Toast message={showToast} onClose={() => setShowToast(null)} />}</AnimatePresence>
      <SyncOverlay isVisible={isScraping} ticker={selectedTicker || ''} progress={scrapProgress.toString()} postCount={syncPostCount} status={syncJobStatus} error={syncError || undefined} onClose={() => { setIsScraping(false); }} />
    </div>
  );
}
