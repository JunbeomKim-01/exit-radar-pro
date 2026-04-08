import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, Sparkles, ShieldAlert, CheckCircle,
  MessageSquare, Play, BarChart3, ChevronRight, RefreshCw,
  ChevronDown, ChevronUp, Cpu
} from 'lucide-react';
import { 
  fetchTickerDetailPackage,
  triggerCrawl,
  fetchCrawlJob
} from '../api';
import { TradingViewChart } from './TradingViewChart';
import { SentimentRatio } from './SentimentRatio';
import { PostList } from './PostList';

interface TickerHubProps {
  ticker: string;
  onClose: () => void;
}

export function TickerHub({ ticker, onClose }: TickerHubProps) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [activeWhaleTab, setActiveWhaleTab] = useState<'insider' | 'politician' | 'institution'>('insider');
  const [scanStatus, setScanStatus] = useState<'idle' | 'scanning' | 'completed' | 'up_to_date'>('idle');
  const [scrapedCount, setScrapedCount] = useState(0);

  const loadAll = async () => {
    setLoading(true);
    try {
      const results = await fetchTickerDetailPackage(ticker);
      setData({
        insight: results[0],
        ratio: results[1],
        timeline: results[2],
        insiders: results[3],
        institutions: results[4],
        politicians: results[5],
        posts: results[6]
      });
    } catch (err) {
      console.error('Ticker detail load error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, [ticker]);

  const handleRunScan = async () => {
    setScanStatus('scanning');
    setScrapedCount(0);
    try {
      const crawlRes = await triggerCrawl(ticker);
      const jobId = crawlRes.jobId;
      
      // Polling for the actual crawl job completion
      let isDone = false;
      const startTime = Date.now();
      const MAX_WAIT = 60000; // 1 minute timeout

      while (!isDone && (Date.now() - startTime < MAX_WAIT)) {
        const job = await fetchCrawlJob(jobId);
        
        if (job.postCount !== undefined) {
          setScrapedCount(job.postCount);
        }

        if (job.status === 'completed') {
          isDone = true;
          
          // CRITICAL: Precision Redundancy Detection
          // Use the flag sent by the scraper (consecutive 0-collection)
          if (job.isUpToDate) {
            setScanStatus('up_to_date');
            await new Promise(resolve => setTimeout(resolve, 3000));
            return;
          }
        } else if (job.status === 'failed') {
          throw new Error(job.error || 'Crawl failed');
        } else {
          // Wait 2 seconds before next poll
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      setScanStatus('completed');
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Auto-refresh all data after real scan success
      await loadAll();
    } catch (err) {
      console.error('Scan error:', err);
    } finally {
      setScanStatus('idle');
    }
  };

  if (loading && !data) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '20px' }}>
        <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'var(--accent-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <LoadingSpinner size={32} />
        </div>
        <span style={{ fontSize: '14px', fontWeight: 900, color: '#fff', letterSpacing: '0.1em' }}>DEEP_DIVING_{ticker}...</span>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      style={{ 
        position: 'fixed', inset: 0, zIndex: 900, background: 'var(--bg-dark)', 
        display: 'flex', flexDirection: 'column', overflow: 'hidden' 
      }}
    >
      <header style={{ 
        padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.2)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'var(--accent-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, color: '#000' }}>
            {ticker[0]}
          </div>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 900, color: '#fff' }}>{ticker}</div>
            <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)' }}>INTELLIGENCE_TERMINAL</div>
          </div>
        </div>
        <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', padding: '10px', borderRadius: '50%', color: '#fff', cursor: 'pointer' }}>
          <X size={20} />
        </button>
      </header>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
             <h3 style={{ fontSize: '12px', fontWeight: 900, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
               <BarChart3 size={14} color="var(--accent-brand)" /> PERSPECTIVE_CHART
             </h3>
          </div>
          <div style={{ height: '320px', background: 'var(--bg-card)', borderRadius: '16px', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
             <TradingViewChart ticker={ticker} companyName={ticker} />
          </div>
        </section>

        <section className="glass-card" style={{ padding: '20px', background: 'linear-gradient(135deg, rgba(167,139,250,0.1) 0%, rgba(0,0,0,0.2) 100%)', border: '1px solid rgba(167,139,250,0.2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <Sparkles size={18} color="#A78BFA" />
            <span style={{ fontSize: '12px', fontWeight: 900, color: '#A78BFA', letterSpacing: '0.05em' }}>AI_ANALYST_CONSENSUS</span>
          </div>
          <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#E5E7EB', fontWeight: 500, margin: 0 }}>
            {data?.insight?.summary || '현재 데이터를 기반으로 전략 지침을 수립 중입니다.'}
          </p>
        </section>

        <section>
           <h3 style={{ fontSize: '12px', fontWeight: 900, color: 'var(--text-muted)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
             <ShieldAlert size={14} color="var(--accent-down)" /> WHALE_RADAR_ACTIVITY
           </h3>
           <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <WhaleTab label="내부자" active={activeWhaleTab === 'insider'} onClick={() => setActiveWhaleTab('insider')} count={data?.insiders?.length} />
              <WhaleTab label="정치인" active={activeWhaleTab === 'politician'} onClick={() => setActiveWhaleTab('politician')} count={data?.politicians?.length} />
              <WhaleTab label="기관" active={activeWhaleTab === 'institution'} onClick={() => setActiveWhaleTab('institution')} count={data?.institutions?.length} />
           </div>
           <div style={{ minHeight: '120px', background: 'rgba(255,255,255,0.02)', borderRadius: '16px', padding: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
              {activeWhaleTab === 'insider' && <WhaleList items={data?.insiders} />}
              {activeWhaleTab === 'politician' && <WhaleList items={data?.politicians} />}
              {activeWhaleTab === 'institution' && <WhaleList items={data?.institutions} />}
           </div>
        </section>

        <section style={{ marginBottom: '40px' }}>
           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '12px', fontWeight: 900, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <MessageSquare size={14} color="var(--accent-brand)" /> COMMUNITY_SENTIMENT
              </h3>
              <button 
                onClick={handleRunScan}
                disabled={scanStatus !== 'idle'}
                style={{ 
                  background: 'var(--accent-brand)', color: '#000', border: 'none', 
                  borderRadius: '8px', padding: '6px 12px', fontSize: '11px', fontWeight: 900,
                  display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer'
                }}
              >
                {scanStatus === 'scanning' ? <RefreshCw size={12} className="spin" /> : <Play size={12} fill="currentColor" />} SCAN_NOW
              </button>
           </div>
           
           <div style={{ position: 'relative' }}>
             <div style={{ display: 'grid', gridTemplateColumns: window.innerWidth <= 768 ? '1fr' : '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                <div className="glass-card" style={{ padding: '16px' }}>
                   <SentimentRatio 
                     supportRatio={data?.ratio?.supportRatio || 0} 
                     criticizeRatio={data?.ratio?.criticizeRatio || 0} 
                     neutralRatio={data?.ratio?.neutralRatio || 0} 
                     postCount={data?.ratio?.postCount || 0} 
                   />
                </div>
                <div className="glass-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                   <div style={{ fontSize: '10px', fontWeight: 900, color: 'var(--text-muted)' }}>LATEST_SENTIMENT_ANALYSIS</div>
                   <div style={{ fontSize: '13px', color: '#fff', lineHeight: 1.6 }}>
                      {data?.insight?.key_points?.map((p: string, i: number) => (
                        <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '4px' }}>
                          <ChevronRight size={14} color="var(--accent-brand)" /> {p}
                        </div>
                      ))}
                   </div>
                </div>
             </div>

             <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                <PostList posts={data?.posts?.posts || []} />
             </div>

             <AnimatePresence>
                {scanStatus !== 'idle' && (
                  <motion.div 
                    initial={{ opacity: 0 }} 
                    animate={{ opacity: 1 }} 
                    exit={{ opacity: 0 }}
                    style={{ 
                      position: 'fixed', inset: 0, zIndex: 10000, 
                      background: 'rgba(5, 6, 8, 0.92)', backdropFilter: 'blur(40px)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexDirection: 'column', gap: '32px',
                      pointerEvents: 'all' // Blocks all interaction behind
                    }}
                  >
                    <div style={{ position: 'relative' }}>
                      {scanStatus === 'scanning' ? (
                        <>
                          <motion.div animate={{ rotate: 360 }} transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}>
                            <Cpu size={80} color="var(--accent-brand)" />
                          </motion.div>
                          <motion.div 
                            animate={{ scale: [1, 1.4, 1], opacity: [0.2, 0.5, 0.2] }}
                            transition={{ duration: 2, repeat: Infinity }}
                            style={{ position: 'absolute', inset: -20, borderRadius: '50%', border: '2px solid var(--accent-brand)', filter: 'blur(12px)' }}
                          />
                        </>
                      ) : scanStatus === 'up_to_date' ? (
                        <motion.div 
                          initial={{ scale: 0 }} animate={{ scale: 1 }}
                          style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'var(--accent-up)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          <CheckCircle size={40} color="#000" />
                        </motion.div>
                      ) : (
                        <motion.div 
                          initial={{ scale: 0 }} animate={{ scale: 1 }}
                          style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'var(--accent-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          <Sparkles size={40} color="#000" />
                        </motion.div>
                      )}
                    </div>

                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '24px', fontWeight: 900, color: '#fff', letterSpacing: '0.2em', marginBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '15px' }}>
                        {scanStatus === 'scanning' ? (
                          <>
                            ANALYZING_NOW
                            <span style={{ color: 'var(--accent-brand)', background: 'rgba(252, 213, 53, 0.1)', padding: '4px 12px', borderRadius: '8px', fontSize: '18px' }}>
                              [{scrapedCount} POSTS]
                            </span>
                          </>
                        ) : scanStatus === 'up_to_date' ? (
                          <span style={{ color: 'var(--accent-up)' }}>이미 최신 상태입니다</span>
                        ) : 'INTELLIGENCE_SUCCESS'}
                      </div>
                      <div style={{ fontSize: '12px', color: scanStatus === 'scanning' ? 'var(--accent-brand)' : 'var(--accent-up)', fontWeight: 800, letterSpacing: '0.1em' }}>
                        {scanStatus === 'scanning' ? 'CRAWLING_SOCIAL_SENTIMENT_FEEDS' : scanStatus === 'up_to_date' ? 'NO_NEW_DATA_DETECTED' : 'SYNCHRONIZING_TERMINAL_DATA_REFRESH'}
                      </div>
                    </div>

                    {/* Scanning Progress Bar */}
                    {scanStatus === 'scanning' && (
                      <div style={{ width: '200px', height: '2px', background: 'rgba(255,255,255,0.1)', borderRadius: '1px', overflow: 'hidden' }}>
                        <motion.div 
                          animate={{ x: [-200, 200] }}
                          transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                          style={{ width: '100px', height: '100%', background: 'var(--accent-brand)' }}
                        />
                      </div>
                    )}
                  </motion.div>
                )}
             </AnimatePresence>
           </div>
        </section>
      </div>
    </motion.div>
  );
}

function LoadingSpinner({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="spin">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

function WhaleTab({ label, active, onClick, count }: { label: string, active: boolean, onClick: () => void, count?: number }) {
  return (
    <button 
      onClick={onClick}
      style={{ 
        padding: '8px 16px', borderRadius: '12px', border: '1px solid',
        borderColor: active ? 'var(--accent-brand)' : 'transparent',
        background: active ? 'rgba(252, 213, 53, 0.1)' : 'rgba(255,255,255,0.03)',
        color: active ? 'var(--accent-brand)' : 'var(--text-muted)',
        fontSize: '12px', fontWeight: 800, cursor: 'pointer'
      }}
    >
      {label} {count !== undefined && <span style={{ opacity: 0.5, fontSize: '10px' }}>{count}</span>}
    </button>
  );
}

function WhaleList({ items }: { items?: any[] }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const INITIAL_COUNT = 5;

  if (!items || items.length === 0) return (
    <div style={{ height: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
      포착된 거물 거래 내역이 없습니다.
    </div>
  );

  const displayItems = isExpanded ? items : items.slice(0, INITIAL_COUNT);

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', padding: '0 0 10px', borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: '10px' }}>
         <span style={{ fontSize: '10px', fontWeight: 900, color: 'var(--text-muted)' }}>WHO / WHEN</span>
         <span style={{ fontSize: '10px', fontWeight: 900, color: 'var(--text-muted)', textAlign: 'center' }}>AVG_PRICE (平단)</span>
         <span style={{ fontSize: '10px', fontWeight: 900, color: 'var(--text-muted)', textAlign: 'right' }}>TOTAL_VALUE</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {displayItems.map((it, i) => {
          const isBuy = (it.transactionType?.includes('Buy') || it.side === 'BUY');
          const avgPrice = it.pricePerShare || (it.value && it.shares ? it.value / it.shares : null);
          
          return (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', alignItems: 'center', padding: '12px 0', borderBottom: i < displayItems.length-1 ? '1px solid rgba(255,255,255,0.03)' : 'none' }}>
               <div>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {it.insiderName || it.ownerName || it.politicianName || it.institutionName || '익명_고래'}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                    {it.transactionDate || it.filedAt || it.reportDate}
                  </div>
               </div>
               
               <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '13px', fontWeight: 900, color: '#fff' }}>
                    {avgPrice ? `$${avgPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : 'N/A'}
                  </div>
                  <div style={{ fontSize: '9px', fontWeight: 800, color: isBuy ? 'var(--accent-up)' : 'var(--accent-down)', opacity: 0.8 }}>
                    {it.transactionType || it.side || 'TRADE'}
                  </div>
               </div>

               <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '13px', fontWeight: 900, color: isBuy ? 'var(--accent-up)' : 'var(--accent-down)' }}>
                    {it.value ? `$${it.value.toLocaleString()}` : (it.amount || it.shares)?.toLocaleString()}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{it.securityTitle || 'SHARES'}</div>
               </div>
            </div>
          );
        })}
      </div>

      {items.length > INITIAL_COUNT && (
        <button 
          onClick={() => setIsExpanded(!isExpanded)}
          style={{ 
            marginTop: '10px', padding: '8px', background: 'rgba(255,255,255,0.03)', 
            border: 'none', borderRadius: '8px', color: 'var(--accent-brand)', 
            fontSize: '11px', fontWeight: 900, display: 'flex', 
            alignItems: 'center', justifyContent: 'center', gap: '6px', cursor: 'pointer' 
          }}
        >
          {isExpanded ? (
            <>COLLAPSE <ChevronUp size={12} /></>
          ) : (
            <>VIEW_ALL_TRADES ({items.length}) <ChevronDown size={12} /></>
          )}
        </button>
      )}
    </div>
  );
}
