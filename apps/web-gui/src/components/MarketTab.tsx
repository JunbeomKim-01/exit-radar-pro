import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Activity, AlertTriangle, Info, Sparkles, 
  RefreshCw, Search
} from 'lucide-react';
import { 
  fetchUnifiedMarketData, 
  INDICATOR_EXPLANATIONS
} from '../api';

// ─── Constants & Types ───

const MAIN_7_INDICATORS = [
  'VIX', 'Yield Curve', 'DXY', 'HY OAS', 'SOX', 'WTI', 'Fear & Greed'
];

interface MarketTabProps {
  onSelectTicker: (ticker: string) => void;
}

// ─── Components ───

function Sparkline({ data, color, height = 24 }: { data: number[], color: string, height?: number }) {
  if (!data || data.length === 0) return <div style={{ height, background: 'rgba(255,255,255,0.03)', borderRadius: '4px' }} />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = (max - min) || 1;
  const points = data.map((val, i) => {
    const x = (i / (data.length - 1)) * 100;
    const y = 100 - ((val - min) / range) * 100;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width="100%" height={height} viewBox="0 -5 100 110" preserveAspectRatio="none" style={{ opacity: 0.8 }}>
       <polyline fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={points} />
    </svg>
  );
}

function ProgressHeader({ score, label, color }: { score: number, label: string, color: string }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
        <span style={{ fontSize: '10px', fontWeight: 900, color: 'var(--text-muted)' }}>{label}</span>
        <span style={{ fontSize: '10px', fontWeight: 900, color }}>{score}%</span>
      </div>
      <div style={{ height: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', overflow: 'hidden' }}>
        <motion.div initial={{ width: 0 }} animate={{ width: `${score}%` }} transition={{ duration: 1 }} style={{ height: '100%', background: color }} />
      </div>
    </div>
  );
}

// ─── Main Market Tab ───

export function MarketTab({ onSelectTicker }: MarketTabProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedIndicator, setSelectedIndicator] = useState<string>('VIX');
  const [tickerSearch, setTickerSearch] = useState('');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (tickerSearch.trim()) {
      onSelectTicker(tickerSearch.trim().toUpperCase());
      setTickerSearch('');
    }
  };

  const loadData = async () => {
    setRefreshing(true);
    try {
      const unified = await fetchUnifiedMarketData();
      setData(unified);
    } catch (err) {
      console.error('Market data load error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  if (loading && !data) {
    return (
      <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '20px' }}>
        <RefreshCw size={32} className="spin" color="var(--accent-brand)" />
        <span style={{ fontSize: '12px', fontWeight: 900, color: 'var(--text-muted)' }}>SYNCHRONIZING_MARKET_INTELLIGENCE...</span>
      </div>
    );
  }

  const { summary, details, unifiedOpinion } = data || {};
  const score = summary?.score || 50;
  const actionColor = summary?.strategicAction?.color || 'var(--accent-brand)';

  const getIndicatorData = (name: string) => {
    if (!details?.chartData) return [];
    const n = name.toUpperCase();
    if (n.includes('VIX')) return details.chartData.map((b: any) => b.vixClose);
    if (n.includes('YIELD')) return details.chartData.map((b: any) => b.yieldCurve);
    if (n.includes('DXY')) return details.chartData.map((b: any) => b.dxyClose);
    if (n.includes('HY OAS')) return details.chartData.map((b: any) => b.hyOas);
    if (n.includes('SOX')) return details.chartData.map((b: any) => b.soxClose);
    if (n.includes('WTI')) return details.chartData.map((b: any) => b.wtiClose);
    return details.chartData.map((b: any) => b.nasdaqVol); // Fallback
  };

  const allSignals = [...(details?.signal?.coreSignals || []), ...(details?.signal?.supportSignals || [])];
  const indicatorsToShow = allSignals.filter(s => MAIN_7_INDICATORS.some(m => s.name.toUpperCase().includes(m.toUpperCase())));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto', background: 'var(--bg-dark)', padding: '20px' }}>
      
      {/* ─── Search Bar ─── */}
      <form onSubmit={handleSearch} style={{ position: 'relative', marginBottom: '24px' }}>
        <input 
          type="text"
          placeholder="SEARCH_TICKER (e.g. AAPL, BTC)..."
          value={tickerSearch}
          onChange={(e) => setTickerSearch(e.target.value)}
          style={{ 
            width: '100%', padding: '14px 20px 14px 48px', borderRadius: '14px',
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
            color: '#fff', fontSize: '13px', fontWeight: 800, outline: 'none',
            transition: 'all 0.2s', letterSpacing: '0.05em'
          }}
          onFocus={(e) => (e.target as any).parentElement.style.borderColor = 'var(--accent-brand)'}
          onBlur={(e) => (e.target as any).parentElement.style.borderColor = 'rgba(255,255,255,0.08)'}
        />
        <Search size={18} color="var(--text-muted)" style={{ position: 'absolute', left: '18px', top: '50%', transform: 'translateY(-50%)' }} />
        {tickerSearch && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)' }}>
            <button type="submit" style={{ padding: '6px 12px', background: 'var(--accent-brand)', color: '#000', border: 'none', borderRadius: '8px', fontSize: '10px', fontWeight: 900, cursor: 'pointer' }}>GO</button>
          </motion.div>
        )}
      </form>

      {/* ─── 7-Indicator Total Score & Action Guidance ─── */}
      <header className="glass-card" style={{ padding: '24px', background: `linear-gradient(135deg, ${actionColor}10 0%, rgba(0,0,0,0.4) 100%)`, border: `1px solid ${actionColor}33`, marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <div className="neon-pulse-brand" style={{ width: '8px', height: '8px', background: actionColor, borderRadius: '50%' }} />
              <span style={{ fontSize: '10px', fontWeight: 900, color: 'var(--text-muted)', letterSpacing: '0.1em' }}>MASTER_STRATEGY_SCORE</span>
            </div>
            <h1 style={{ fontSize: '32px', fontWeight: 900, color: '#fff', margin: 0, letterSpacing: '-0.03em' }}>
              {summary?.strategicAction?.short || 'STABLE_TRANSITION'}
            </h1>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span className="nums" style={{ fontSize: '48px', fontWeight: 900, color: actionColor, lineHeight: 1 }}>{score}</span>
            <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-muted)' }}>/100</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
           <ProgressHeader score={summary?.confidence || 85} label="AI_CONFIDENCE" color="#A78BFA" />
           <ProgressHeader score={score} label="MARKET_MOMENTUM" color={actionColor} />
        </div>

        <div style={{ padding: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <Sparkles size={16} color="#A78BFA" />
            <span style={{ fontSize: '11px', fontWeight: 900, color: '#A78BFA' }}>AI_ACTION_GUIDANCE</span>
          </div>
          <p style={{ fontSize: '14px', lineHeight: 1.6, color: 'var(--text-secondary)', margin: 0, fontWeight: 500 }}>
            {unifiedOpinion?.analysis || '현재 시장 지표를 분석 중입니다. 리스크 관리를 최우선으로 하십시오.'}
          </p>
        </div>
      </header>

      {/* ─── 7 Indicators Grid ─── */}
      <h3 style={{ fontSize: '14px', fontWeight: 900, color: '#fff', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Activity size={18} color="var(--accent-brand)" /> MACRO_REVERSAL_FLOW (7_INDICATORS)
      </h3>

      <div style={{ display: 'grid', gridTemplateColumns: window.innerWidth <= 1024 ? '1fr' : 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px', marginBottom: '80px' }}>
        {indicatorsToShow.map((s, i) => (
          <motion.div 
            key={i} 
            className="glass-card" 
            whileHover={{ y: -4 }}
            style={{ 
              padding: '20px', 
              background: selectedIndicator === s.name ? 'rgba(252, 213, 53, 0.05)' : 'rgba(255,255,255,0.02)',
              borderColor: selectedIndicator === s.name ? 'var(--accent-brand)' : 'rgba(255,255,255,0.08)',
              cursor: 'pointer'
            }}
            onClick={() => setSelectedIndicator(s.name)}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div>
                <div style={{ fontSize: '10px', fontWeight: 900, color: 'var(--text-muted)' }}>{s.name.toUpperCase()}</div>
                <div style={{ fontSize: '18px', fontWeight: 900, color: '#fff' }}>{s.description}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '14px', fontWeight: 900, color: s.triggered ? 'var(--accent-down)' : 'var(--accent-brand)' }}>
                  {s.score}<span style={{ fontSize: '10px', opacity: 0.5 }}>/{s.maxScore}</span>
                </div>
                {s.triggered && <AlertTriangle size={14} color="var(--accent-down)" />}
              </div>
            </div>

            <div style={{ height: '40px', marginBottom: '12px' }}>
               <Sparkline data={getIndicatorData(s.name)} color={s.triggered ? 'var(--accent-down)' : 'var(--accent-brand)'} height={40} />
            </div>

            <div style={{ display: 'flex', gap: '8px', padding: '10px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              <Info size={14} style={{ flexShrink: 0 }} />
              {INDICATOR_EXPLANATIONS[s.name.split(' ')[0]] || '시장 지배력을 분석 중입니다.'}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Floating Refresh Button */}
      <button 
        onClick={loadData}
        disabled={refreshing}
        style={{ 
          position: 'fixed', bottom: '100px', right: '20px', 
          width: '48px', height: '48px', borderRadius: '50%',
          background: 'var(--accent-brand)', color: '#000', border: 'none',
          boxShadow: '0 8px 24px rgba(252, 213, 53, 0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 100
        }}
      >
        <RefreshCw size={20} className={refreshing ? 'spin' : ''} />
      </button>
    </div>
  );
}
