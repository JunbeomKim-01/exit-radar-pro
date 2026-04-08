/**
 * TrendReversalTab — 전환 지표 탭
 * 
 * 시장 전환 위험/기회를 정량적으로 보여주는 대시보드.
 * 전략 중심(Strategic Action) UI와 인터랙티브 상세 분석 패널 제공.
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RefreshCw, AlertTriangle, TrendingUp,
  Activity, ArrowUpCircle, ArrowDownCircle, Eye, AlertCircle, CheckCircle2,
  Info, Sparkles
} from 'lucide-react';
import {
  fetchReversalSummary, fetchReversalDetails,
  triggerReversalRefresh, fetchIndicatorAnalysis,
  fetchMarketUnifiedOpinion
} from '../api';
import { TradingViewChart } from './TradingViewChart';

// ─── Constants ───

const ShimmerLine = () => (
  <div className="shimmer" style={{ height: '0.875rem', width: '100%', borderRadius: '0.25rem', marginBottom: '0.5rem' }} />
);

export const INDICATOR_EXPLANATIONS: Record<string, string> = {
  'VXN': '나스닥 100 변동성 지수입니다. 지수가 급등 후 꺾이는 지점이 시장의 단기 바닥인 경우가 많습니다.',
  'HY OAS': '투기 등급 채권의 가산 금리입니다. 이 수치가 낮아지면 시장의 공포가 줄어들고 위험 자산 선호가 강해집니다.',
  'DGS2': '미국채 2년물 금리입니다. 연준의 정책 금리 기대를 반영하며, 금리 안정화는 성장주에 긍정적입니다.',
  'Yield Curve': '장단기 금리차(10Y-2Y)입니다. 역전됐던 금리차가 정상화되는 과정은 역사적으로 경기 침체의 전조로 해석됩니다.',
  'SOX': '필라델피아 반도체 지수의 상대 강도입니다. 반도체가 시장을 주도할 때 나스닥의 반등 탄력이 강해집니다.',
  'VIX': 'S&P 500 공포 지수입니다. 30 이상의 과매도 구간에서 하락세가 진정될 때 반등 신호로 작동합니다.',
  'DXY': '달러 인덱스입니다. 달러 약세는 신흥국 및 기술주 시장의 유동성을 공급하는 호재입니다.',
  'WTI': '국제 유가입니다. 유가 하락은 인플레이션 압력을 낮추어 금리 인하 기대감을 높입니다.',
  '거래량': '나스닥 거래량입니다. 하락 끝단에서 거래량이 폭발하는 것은 투매(Climax) 이후의 바닥 신호일 수 있습니다.'
};

// ─── Types ───

interface SignalBreakdown {
  name: string;
  score: number;
  maxScore: number;
  description: string;
  triggered: boolean;
}

interface ReversalSummary {
  date: string;
  signalType: 'TOP_CANDIDATE' | 'BOTTOM_CANDIDATE';
  score: number;
  stage: 'OBSERVE' | 'WARN' | 'CONFIRMED';
  coreSignalScore: number;
  supportSignalScore: number;
  confidence: number;
  explanation: string;
  riskTheme: string;
  strategicAction: {
    short: string;
    long: string;
    color: string;
  };
  dominantDrivers: string[];
  updatedAt: string;
}

interface ReversalDetails {
  signal: {
    coreSignals: SignalBreakdown[];
    supportSignals: SignalBreakdown[];
  };
  features: Record<string, number>;
  chartData: any[];
}

// INDICATOR_EXPLANATIONS MOVED TO TOP FOR EXPORT

// ─── Stage Badge ───

function StageBadge({ stage }: { stage: string }) {
  const config: Record<string, { bg: string; color: string; icon: any; label: string }> = {
    OBSERVE: { bg: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', icon: Eye, label: 'OBSERVE' },
    WARN: { bg: 'rgba(251, 191, 36, 0.15)', color: '#fbbf24', icon: AlertCircle, label: 'WARN' },
    CONFIRMED: { bg: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', icon: CheckCircle2, label: 'CONFIRMED' },
  };
  const c = config[stage] || config.OBSERVE;
  const Icon = c.icon;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '0.375rem',
      background: c.bg, border: `1px solid ${c.color}33`, borderRadius: '0.375rem',
      padding: '0.25rem 0.625rem', fontSize: '0.6875rem', fontWeight: 800, color: c.color,
    }}>
      <Icon size={14} />
      {c.label}
    </div>
  );
}

// ─── Sparkline ───

function Sparkline({ data, color, height = 24 }: { data: number[], color: string, height?: number }) {
  if (!data || data.length === 0) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = (max - min) || 1;
  const points = data.map((val, i) => {
    const x = (i / (data.length - 1)) * 100;
    const y = 100 - ((val - min) / range) * 100;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width="100%" height={height} viewBox="0 -5 100 110" preserveAspectRatio="none" style={{ marginTop: '0.25rem', opacity: 0.8 }}>
       <polyline
         fill="none"
         stroke={color}
         strokeWidth="2"
         strokeLinecap="round"
         strokeLinejoin="round"
         points={points}
       />
    </svg>
  );
}

// ─── Signal Card ───

export function SignalCard({ signal, chartData, active, onClick }: { signal: SignalBreakdown; chartData?: number[]; active?: boolean; onClick: () => void }) {
  const fillPercent = signal.maxScore > 0 ? (signal.score / signal.maxScore) * 100 : 0;
  const barColor = signal.triggered 
    ? (fillPercent > 70 ? 'var(--accent-down)' : fillPercent > 40 ? '#fbbf24' : 'var(--accent-brand)')
    : 'var(--text-muted)';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      whileTap={{ scale: 0.96 }}
      onClick={onClick}
      className="glass-card"
      style={{
        background: active ? 'rgba(252, 213, 53, 0.08)' : 'rgba(255, 255, 255, 0.02)',
        borderColor: active ? 'var(--accent-brand)' : (signal.triggered ? `${barColor}66` : 'rgba(255,255,255,0.08)'),
        padding: '1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        cursor: 'pointer',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        minWidth: window.innerWidth <= 1024 ? '11.25rem' : 'auto'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
             <div style={{ width: '0.1875rem', height: '0.625rem', background: barColor, borderRadius: '0.125rem' }} />
             <span style={{ fontSize: '0.625rem', fontWeight: 900, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
               {signal.name}
             </span>
          </div>
          <span className="nums" style={{ fontSize: '1.25rem', fontWeight: 900, color: signal.triggered ? barColor : 'var(--text-active)', letterSpacing: '-0.02em' }}>
            {signal.description?.match(/[-+]?\d*\.?\d+[%x]?/)?.[0] || '--'}
          </span>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '0.8125rem', fontWeight: 900, color: barColor }}>
            {signal.score}<span style={{ fontSize: '0.5625rem', opacity: 0.5 }}>/{signal.maxScore}</span>
          </div>
          {signal.triggered && (
             <div className="neon-pulse-brand" style={{ width: '0.375rem', height: '0.375rem', background: 'var(--accent-down)', borderRadius: '50%', marginLeft: 'auto', marginTop: '0.25rem' }} />
          )}
        </div>
      </div>
      
      {/* Score bar */}
      <div style={{ height: '0.1875rem', background: 'rgba(255,255,255,0.03)', borderRadius: '0.125rem', overflow: 'hidden' }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${fillPercent}%` }}
          transition={{ duration: 1, ease: 'easeOut' }}
          style={{ height: '100%', background: barColor, borderRadius: '0.125rem' }}
        />
      </div>

      {chartData && chartData.length > 0 && (
        <div style={{ height: '1.875rem', opacity: 0.6 }}>
           <Sparkline data={chartData} color={barColor} height={30} />
        </div>
      )}
    </motion.div>
  );
}

// ─── Main Component ───

export function ReversalDetailsPanel({ selectedSignal, aiAnalysis, fetchingAnalysis, chartData, onBack }: { selectedSignal: any, aiAnalysis: string | null, fetchingAnalysis: boolean, chartData: any[], onBack?: () => void }) {
  if (!selectedSignal) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '14px', fontWeight: 800 }}>
        ← 분석하고자 하는 지표를 선택하세요
      </div>
    );
  }

  return (
    <motion.div
      key={selectedSignal.name}
      initial={{ opacity: 0, x: '1.25rem' }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: '-1.25rem' }}
      style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}
    >
      <header>
        {onBack && window.innerWidth <= 1024 && (
          <button 
            onClick={onBack}
            style={{ 
              marginBottom: '1rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', 
              borderRadius: '0.5rem', padding: '0.5rem 0.75rem', color: 'var(--accent-brand)', fontSize: '0.6875rem', fontWeight: 900,
              display: 'flex', alignItems: 'center', gap: '0.375rem' 
            }}
          >
            ← BACK_TO_RADAR
          </button>
        )}
        <div style={{ fontSize: '0.625rem', color: 'var(--text-muted)', fontWeight: 800, marginBottom: '0.25rem' }}>DEEP_DIVE_ANALYTICS</div>
        <h2 style={{ fontSize: '1.75rem', fontWeight: 900, color: '#fff', margin: 0, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {selectedSignal.name}
          {selectedSignal.triggered && <AlertTriangle size={24} color="var(--accent-down)" />}
        </h2>
        <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '0.75rem', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontSize: '0.8125rem', lineHeight: 1.6, display: 'flex', gap: '0.75rem' }}>
          <Info size={16} style={{ flexShrink: 0, marginTop: '0.125rem' }} color="var(--accent-brand)" />
          {INDICATOR_EXPLANATIONS[selectedSignal.name.split(' ')[0]] || INDICATOR_EXPLANATIONS[selectedSignal.name] || '지표 상세 설명이 준비 중입니다.'}
        </div>
      </header>

      {/* 🤖 AI Analyst Insight Section */}
      <div className="glass-card" style={{
        marginTop: '0.5rem',
        padding: '1.5rem',
        background: 'linear-gradient(135deg, rgba(139,92,246,0.1) 0%, rgba(0,0,0,0.2) 100%)',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Pulsing Status Dot */}
        <div style={{ position: 'absolute', top: '1.5rem', right: '1.5rem' }}>
           <div className="neon-pulse-brand" style={{ width: '0.5rem', height: '0.5rem', background: '#A78BFA', borderRadius: '50%' }} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '1rem' }}>
          <Sparkles size={20} color="#A78BFA" />
          <span style={{ fontSize: '0.8125rem', fontWeight: 900, color: '#A78BFA', textTransform: 'uppercase', letterSpacing: '0.1rem' }}>
            AI_MACRO_BRIEFING
          </span>
        </div>

        {fetchingAnalysis ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
            <ShimmerLine />
          </div>
        ) : aiAnalysis ? (
          <div style={{ 
            color: '#E5E7EB', 
            fontSize: '0.875rem', 
            lineHeight: '1.8', 
            fontWeight: 500,
            whiteSpace: 'pre-wrap',
            letterSpacing: '-0.01em'
          }}>
            {aiAnalysis}
          </div>
        ) : (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', fontStyle: 'italic' }}>
            분석 지침을 수립하는 중입니다...
          </div>
        )}
      </div>

      <div style={{ padding: '1.25rem', background: 'var(--bg-card)', borderRadius: '0.75rem', border: '1px solid var(--border-color)', height: selectedSignal.name.toUpperCase().includes('YIELD CURVE') ? '25rem' : 'auto' }}>
        <div style={{ fontSize: '0.625rem', color: 'var(--text-muted)', fontWeight: 800, marginBottom: '0.75rem' }}>{selectedSignal.name.toUpperCase().includes('YIELD CURVE') ? 'REALTIME_MACRO_FLOW' : '60D_TREND_VISUALIZATION'}</div>
        {selectedSignal.name.toUpperCase().includes('YIELD CURVE') || selectedSignal.name.includes('금리 커브') ? (
          <TradingViewChart ticker="YIELD CURVE" companyName="Yield Curve" />
        ) : (
          <Sparkline data={chartData} color="var(--accent-brand)" height={100} />
        )}
      </div>

      <div style={{ padding: '1.25rem', background: selectedSignal.triggered ? 'rgba(239,68,68,0.05)' : 'rgba(14,203,129,0.05)', borderRadius: '0.75rem', border: `1px solid ${selectedSignal.triggered ? 'var(--accent-down)44' : 'var(--accent-up)44'}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 800 }}>CURRENT_SIGNAL_STATUS</span>
          <span style={{ fontSize: '0.625rem', fontWeight: 900, padding: '0.25rem 0.5rem', background: selectedSignal.triggered ? 'var(--accent-down)' : 'var(--accent-up)', color: '#000', borderRadius: '0.25rem' }}>
            {selectedSignal.triggered ? 'CRITICAL_BREACH' : 'RANGE_STABLE'}
          </span>
        </div>
        <p className="nums" style={{ fontSize: '1.5rem', fontWeight: 900, color: '#fff', margin: '0.5rem 0' }}>{selectedSignal.description}</p>
        
        <div style={{ marginTop: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6875rem', marginBottom: '0.5rem' }}>
            <span style={{ color: 'var(--text-muted)' }}>SCORE_CONTRIBUTION</span>
            <span style={{ color: '#fff', fontWeight: 900 }}>{selectedSignal.score} / {selectedSignal.maxScore}</span>
          </div>
          <div style={{ height: '0.375rem', background: 'rgba(0,0,0,0.2)', borderRadius: '0.1875rem', overflow: 'hidden' }}>
            <div style={{ width: `${(selectedSignal.score / selectedSignal.maxScore) * 100}%`, height: '100%', background: 'var(--accent-brand)' }} />
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export function TrendReversalTab() {
  const [summary, setSummary] = useState<ReversalSummary | null>(null);
  const [details, setDetails] = useState<ReversalDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedSignalName, setSelectedSignalName] = useState<string | null>(null);
  
  // Navigation State for Mobile (Grid vs Detail)
  const [mobileView, setMobileView] = useState<'grid' | 'detail'>('grid');
  
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [fetchingAnalysis, setFetchingAnalysis] = useState(false);
  const [analysisCache, setAnalysisCache] = useState<Record<string, string>>({});

  const [unifiedAnalysis, setUnifiedAnalysis] = useState<string | null>(null);
  const [fetchingUnified, setFetchingUnified] = useState(false);
  const [isBriefingExpanded, setIsBriefingExpanded] = useState(false);

  const loadData = async () => {
    try {
      const [s, d] = await Promise.all([
        fetchReversalSummary().catch(() => null),
        fetchReversalDetails().catch(() => null),
      ]);
      setSummary(s);
      setDetails(d);
      
      if (d && !selectedSignalName) {
        setSelectedSignalName(d.signal.coreSignals[0].name);
      }
    } catch (err) {
      console.error('Data load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadUnified = async () => {
    setFetchingUnified(true);
    try {
      const res = await fetchMarketUnifiedOpinion();
      if (res) setUnifiedAnalysis(res.analysis);
    } catch (err) {
      console.error('Unified analysis error:', err);
    } finally {
      setFetchingUnified(false);
    }
  };

  useEffect(() => { 
    loadData();
    loadUnified();
  }, []);

  useEffect(() => {
    if (!selectedSignalName) return;
    
    if (analysisCache[selectedSignalName]) {
      setAiAnalysis(analysisCache[selectedSignalName]);
      return;
    }

    const getAnalysis = async () => {
      setFetchingAnalysis(true);
      setAiAnalysis(null);
      try {
        const cleanName = selectedSignalName.split(' ')[0];
        const res = await fetchIndicatorAnalysis(cleanName);
        if (res && res.analysis) {
          setAiAnalysis(res.analysis);
          setAnalysisCache(prev => ({ ...prev, [selectedSignalName]: res.analysis }));
        }
      } catch (err) {
        console.error('AI Analysis fetch error:', err);
      } finally {
        setFetchingAnalysis(false);
      }
    };

    getAnalysis();
  }, [selectedSignalName]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await triggerReversalRefresh();
      await Promise.all([loadData(), loadUnified()]);
      setAnalysisCache({});
    } catch (err) {
      console.error('Refresh error:', err);
    } finally {
      setRefreshing(false);
    }
  };

  const handleSignalClick = (name: string) => {
    setSelectedSignalName(name);
    if (window.innerWidth <= 1024) {
      setMobileView('detail');
      // Scroll to top for detail view
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
        <RefreshCw size={24} className="spin" color="var(--text-muted)" />
      </div>
    );
  }

  if (!summary) return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
      <Activity size={48} style={{ opacity: 0.2 }} color="var(--text-muted)" />
      <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>전환 지표 데이터가 없습니다.</p>
      <button onClick={handleRefresh} disabled={refreshing} style={{ background: 'var(--accent-brand)', color: 'var(--bg-dark)', border: 'none', padding: '12px 24px', borderRadius: '8px', fontWeight: 800, cursor: 'pointer' }}>
         <RefreshCw size={14} className={refreshing ? 'spin' : ''} /> 시장 데이터 분석 시작
      </button>
    </div>
  );

  const isTopCandidate = summary.signalType === 'TOP_CANDIDATE';

  const getChartData = (name: string, bars: any[]) => {
    if (!bars || bars.length === 0) return [];
    const n = name.toUpperCase();
    if (n.includes('VXN')) return bars.map(b => b.vxnClose);
    if (n.includes('HY OAS')) return bars.map(b => b.hyOas);
    if (n.includes('DGS2')) return bars.map(b => b.dgs2);
    if (n.includes('YIELD CURVE')) return bars.map(b => b.yieldCurve);
    if (n.includes('SOX')) return bars.map(b => b.soxClose);
    if (n.includes('VIX')) return bars.map(b => b.vixClose);
    if (n.includes('DXY')) return bars.map(b => b.dxyClose);
    if (n.includes('WTI')) return bars.map(b => b.wtiClose);
    if (n.includes('거래량')) return bars.map(b => b.nasdaqVol);
    return [];
  };

  const selectedSignal = [...(details?.signal.coreSignals || []), ...(details?.signal.supportSignals || [])]
    .find(s => s.name === selectedSignalName);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--bg-panel)', position: 'relative' }}>
      
      {(loading || refreshing) && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '0.125rem', background: 'rgba(255,255,255,0.05)', zIndex: 110 }}>
           <motion.div initial={{ width: 0 }} animate={{ width: '100%' }} transition={{ repeat: Infinity, duration: 1.5 }} style={{ height: '100%', background: 'var(--accent-brand)', boxShadow: '0 0 0.75rem var(--accent-brand)' }} />
        </div>
      )}

      {/* Main Content Area - Scrollable Container */}
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: '7.5rem' }}>
        
        <AnimatePresence mode="wait">
          {window.innerWidth > 1024 || mobileView === 'grid' ? (
            <motion.div 
              key="macro-grid-view" 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              style={{ display: 'flex', flexDirection: 'column' }}
            >
              {/* ─── A. Strategic Action Banner (Unpinned for mobile) ─── */}
              <div style={{ 
                padding: window.innerWidth > 1024 ? '1.5rem 2rem' : '1.25rem', 
                background: `linear-gradient(90deg, rgba(0,0,0,0.6) 0%, ${summary.strategicAction.color}15 100%)`,
                borderBottom: `0.0625rem solid ${summary.strategicAction.color}33`,
                display: 'flex',
                flexDirection: window.innerWidth > 1024 ? 'row' : 'column',
                justifyContent: 'space-between',
                alignItems: window.innerWidth > 1024 ? 'center' : 'flex-start',
                gap: '1.5rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: window.innerWidth > 1024 ? '1.75rem' : '1rem' }}>
                  <motion.div
                    animate={{ scale: [1, 1.05, 1], rotate: [0, 2, -2, 0] }} 
                    transition={{ duration: 4, repeat: Infinity }}
                    style={{ 
                      width: window.innerWidth > 1024 ? '5rem' : '4rem', 
                      height: window.innerWidth > 1024 ? '5rem' : '4rem', 
                      borderRadius: '1.5rem', background: `${summary.strategicAction.color}22`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', 
                      border: `0.0625rem solid ${summary.strategicAction.color}66`,
                      flexShrink: 0,
                      boxShadow: `0 0.5rem 2rem ${summary.strategicAction.color}22`
                    }}
                  >
                    {isTopCandidate 
                      ? <ArrowDownCircle size={window.innerWidth > 1024 ? 40 : 32} color={summary.strategicAction.color} />
                      : <ArrowUpCircle size={window.innerWidth > 1024 ? 40 : 32} color={summary.strategicAction.color} />
                    }
                  </motion.div>
                  
                  <div className="stagger-entry">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.375rem' }}>
                      <span style={{ fontSize: window.innerWidth > 1024 ? '2.25rem' : '1.625rem', fontWeight: 900, color: '#fff', letterSpacing: '-0.03em' }}>
                        {summary.strategicAction.short}
                      </span>
                      <StageBadge stage={summary.stage} />
                    </div>
                    <p style={{ fontSize: window.innerWidth > 1024 ? '0.9375rem' : '0.8125rem', fontWeight: 600, color: 'var(--text-muted)', margin: 0, lineHeight: 1.4 }}>
                      {summary.strategicAction.long}
                    </p>
                  </div>
                </div>

                <div style={{ 
                  width: window.innerWidth > 1024 ? 'auto' : '100%', 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  gap: '2rem', 
                  padding: window.innerWidth > 1024 ? '0' : '1rem',
                  background: window.innerWidth > 1024 ? 'transparent' : 'rgba(255,255,255,0.02)',
                  borderRadius: '1rem'
                }}>
                     <div style={{ textAlign: 'left' }}>
                        <div style={{ fontSize: '0.625rem', color: 'var(--text-muted)', fontWeight: 800, letterSpacing: '0.1em' }}>SIGNAL_STRENGTH</div>
                        <div className="nums" style={{ fontSize: window.innerWidth > 1024 ? '2rem' : '1.75rem', fontWeight: 900, color: summary.strategicAction.color }}>
                          {summary.score}<span style={{ fontSize: '0.875rem', opacity: 0.5 }}>/100</span>
                        </div>
                     </div>
                     <div style={{ textAlign: 'left' }}>
                        <div style={{ fontSize: '0.625rem', color: 'var(--text-muted)', fontWeight: 800, letterSpacing: '0.1em' }}>CONFIDENCE</div>
                        <div className="nums" style={{ fontSize: window.innerWidth > 1024 ? '2rem' : '1.75rem', fontWeight: 900, color: '#fff' }}>
                          {summary.confidence.toFixed(0)}<span style={{ fontSize: '0.875rem', opacity: 0.5 }}>%</span>
                        </div>
                     </div>
                     <div style={{ width: '2.5rem', height: '2.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <button onClick={handleRefresh} disabled={refreshing} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                            <RefreshCw size={24} className={refreshing ? 'spin' : ''} />
                        </button>
                     </div>
                </div>
              </div>

              <div style={{ flex: 1, display: 'flex', flexDirection: window.innerWidth > 1024 ? 'row' : 'column', minHeight: 0, overflowY: window.innerWidth > 1024 ? 'auto' : 'visible' }}>
        
                <div style={{ flex: 1.6, overflowY: window.innerWidth > 1024 ? 'auto' : 'visible', padding: window.innerWidth > 1024 ? '2rem' : '1.25rem', display: 'flex', flexDirection: 'column', gap: '2rem', borderRight: window.innerWidth > 1024 ? '0.0625rem solid var(--border-color)' : 'none' }}>
                  {/* 🤖 Unified AI Master Strategy Section (Collapsible) */}
                  <div className="glass-card" style={{
                       padding: '1.5rem',
                       background: 'linear-gradient(135deg, rgba(139,92,246,0.15) 0%, rgba(139,92,246,0.05) 100%)',
                       position: 'relative',
                       overflow: 'hidden'
                     }}>
                       <div 
                         onClick={() => setIsBriefingExpanded(!isBriefingExpanded)}
                         style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                       >
                         <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div className="neon-pulse-brand" style={{ width: '0.5rem', height: '0.5rem', background: '#A78BFA', borderRadius: '50%' }} />
                            <h2 style={{ fontSize: '0.8125rem', fontWeight: 900, color: '#A78BFA', letterSpacing: '0.15em', margin: 0 }}>
                              AI_MASTER_STRATEGY_BRIEFING
                            </h2>
                         </div>
                         <button className="insight-chip active" style={{ fontSize: '0.625rem' }}>
                            {isBriefingExpanded ? 'COLLAPSE' : 'EXPAND'}
                         </button>
                       </div>

                       <motion.div 
                         initial={false}
                         animate={{ 
                           height: isBriefingExpanded ? 'auto' : (window.innerWidth <= 1024 ? '6.25rem' : 'auto'),
                           marginTop: '1.25rem'
                         }}
                         transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
                         style={{ 
                           overflow: 'hidden',
                           position: 'relative'
                         }}
                       >
                         {fetchingUnified ? (
                           <ShimmerLine />
                         ) : unifiedAnalysis ? (
                           <div style={{ color: '#fff', fontSize: '0.9375rem', lineHeight: '1.9', fontWeight: 600, whiteSpace: 'pre-wrap', letterSpacing: '-0.02em', opacity: (window.innerWidth <= 1024 && !isBriefingExpanded) ? 0.7 : 1 }}>
                             {unifiedAnalysis}
                           </div>
                         ) : (
                           <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', fontStyle: 'italic' }}>전략 지침을 도출 중입니다...</div>
                         )}
                         {window.innerWidth <= 1024 && !isBriefingExpanded && (
                            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '3.75rem', background: 'linear-gradient(transparent, #0a0c12)' }} />
                         )}
                       </motion.div>
                  </div>
                  
                  {/* Main Chart */}
                  <section className="stagger-entry">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '1rem' }}>
                       <div className="premium-card-header" style={{ marginBottom: 0, padding: '0.5rem 1rem', marginLeft: '-1.25rem' }}>
                          <h3 style={{ fontSize: '0.8125rem', fontWeight: 900, color: '#fff', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <TrendingUp size={16} color="var(--accent-brand)" /> MARKET_BENCHMARK (QQQ)
                          </h3>
                       </div>
                       <span style={{ fontSize: '0.625rem', color: 'var(--text-muted)', fontWeight: 800 }}>{summary.explanation}</span>
                    </div>
                    <div style={{ height: '22.5rem', background: 'var(--bg-card)', borderRadius: '1.5rem', border: '0.0625rem solid var(--border-color)', overflow: 'hidden', boxShadow: '0 0.5rem 2rem rgba(0,0,0,0.4)' }}>
                      <TradingViewChart ticker="QQQ" companyName="Nasdaq 100" />
                    </div>
                  </section>

                  {/* Indicator Grid (7 indicators in 2-column grid for mobile) */}
                  <section className="stagger-entry">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                       <h3 style={{ fontSize: '14px', fontWeight: 900, color: '#fff', margin: 0 }}>MACRO_SIGNAL_RADAR</h3>
                       {window.innerWidth <= 1024 && <div className="insight-chip active">GRID_MODE <Sparkles size={12} /></div>}
                    </div>
                    <div 
                      style={{ 
                        display: 'grid', 
                        gridTemplateColumns: window.innerWidth <= 1024 ? 'repeat(2, 1fr)' : 'repeat(auto-fill, minmax(200px, 1fr))', 
                        gap: '10px'
                      }}
                    >
                      {[...(details?.signal.coreSignals || []), ...(details?.signal.supportSignals || [])].map((s, i) => (
                        <div key={i}>
                           <SignalCard 
                             signal={s} 
                             chartData={getChartData(s.name, details?.chartData || [])}
                             active={selectedSignalName === s.name}
                             onClick={() => handleSignalClick(s.name)}
                           />
                        </div>
                      ))}
                    </div>
                  </section>
                </div>

                {/* Desktop Right Side Details (Hidden on mobile grid view) */}
                {window.innerWidth > 1024 && (
                  <div style={{ flex: 1, padding: '0 0 0 2rem', borderLeft: '0.0625rem solid var(--border-color)' }}>
                    <ReversalDetailsPanel 
                      selectedSignal={selectedSignal}
                      aiAnalysis={aiAnalysis}
                      fetchingAnalysis={fetchingAnalysis}
                      chartData={getChartData(selectedSignal?.name || '', details?.chartData || [])}
                    />
                  </div>
                )}
              </div>
            </motion.div>
          ) : (
            /* ─── Mobile Detail View Flow ─── */
            <motion.div 
              key="macro-detail-view" 
              initial={{ opacity: 0, x: 50 }} 
              animate={{ opacity: 1, x: 0 }} 
              exit={{ opacity: 0, x: -50 }}
              style={{ padding: '1.25rem' }}
            >
               <ReversalDetailsPanel 
                 selectedSignal={selectedSignal}
                 aiAnalysis={aiAnalysis}
                 fetchingAnalysis={fetchingAnalysis}
                 chartData={getChartData(selectedSignal?.name || '', details?.chartData || [])}
                 onBack={() => setMobileView('grid')}
               />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
