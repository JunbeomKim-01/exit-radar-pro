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
  Info, Sparkles, Zap
} from 'lucide-react';
import {
  fetchReversalSummary, fetchReversalDetails,
  triggerReversalRefresh, fetchIndicatorAnalysis,
  fetchMarketUnifiedOpinion
} from '../api';
import { TradingViewChart } from './TradingViewChart';

// ─── Constants ───

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
      display: 'flex', alignItems: 'center', gap: '6px',
      background: c.bg, border: `1px solid ${c.color}33`, borderRadius: '6px',
      padding: '4px 10px', fontSize: '11px', fontWeight: 800, color: c.color,
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
    <svg width="100%" height={height} viewBox="0 -5 100 110" preserveAspectRatio="none" style={{ marginTop: '4px', opacity: 0.8 }}>
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
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.02, background: 'rgba(255,255,255,0.03)' }}
      onClick={onClick}
      style={{
        background: active ? 'rgba(255,255,255,0.05)' : 'var(--bg-card)',
        border: `1px solid ${active ? 'var(--accent-brand)' : (signal.triggered ? barColor + '44' : 'var(--border-color)')}`,
        borderRadius: '8px',
        padding: '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            {signal.name}
          </span>
          <span className="nums" style={{ fontSize: '18px', fontWeight: 900, color: signal.triggered ? barColor : 'var(--text-active)' }}>
            {signal.description?.match(/[-+]?\d*\.?\d+[%x]?/)?.[0] || '--'}
          </span>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '12px', fontWeight: 900, color: barColor }}>
            {signal.score}<span style={{ fontSize: '9px', opacity: 0.6 }}>/{signal.maxScore}</span>
          </div>
          {signal.triggered && <div style={{ fontSize: '8px', fontWeight: 900, color: 'var(--accent-down)', marginTop: '2px' }}>TRIGGERED</div>}
        </div>
      </div>
      
      {/* Score bar */}
      <div style={{ height: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', overflow: 'hidden' }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${fillPercent}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          style={{ height: '100%', background: barColor, borderRadius: '2px' }}
        />
      </div>

      {chartData && chartData.length > 0 && (
        <Sparkline data={chartData} color={barColor} />
      )}
    </motion.div>
  );
}

// ─── Main Component ───

export function ReversalDetailsPanel({ selectedSignal, aiAnalysis, fetchingAnalysis, chartData }: { selectedSignal: any, aiAnalysis: string | null, fetchingAnalysis: boolean, chartData: any[] }) {
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
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}
    >
      <header>
        <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 800, marginBottom: '4px' }}>DEEP_DIVE_ANALYTICS</div>
        <h2 style={{ fontSize: '28px', fontWeight: 900, color: '#fff', margin: 0, display: 'flex', alignItems: 'center', gap: '12px' }}>
          {selectedSignal.name}
          {selectedSignal.triggered && <AlertTriangle size={24} color="var(--accent-down)" />}
        </h2>
        <div style={{ marginTop: '16px', padding: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontSize: '13px', lineHeight: 1.6, display: 'flex', gap: '12px' }}>
          <Info size={16} style={{ flexShrink: 0, marginTop: '2px' }} color="var(--accent-brand)" />
          {INDICATOR_EXPLANATIONS[selectedSignal.name.split(' ')[0]] || INDICATOR_EXPLANATIONS[selectedSignal.name] || '지표 상세 설명이 준비 중입니다.'}
        </div>
      </header>

      {/* 🤖 AI Analyst Insight Section */}
      <div style={{
        marginTop: '8px',
        padding: '24px',
        background: 'linear-gradient(135deg, rgba(93,92,222,0.1) 0%, rgba(0,0,0,0.1) 100%)',
        borderRadius: '16px',
        border: '1px solid rgba(93,92,222,0.3)',
        boxShadow: '0 8px 32px 0 rgba(0,0,0,0.2)',
        position: 'relative',
        overflow: 'hidden'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <Sparkles size={18} color="#A78BFA" />
          <span style={{ fontSize: '13px', fontWeight: 900, color: '#A78BFA', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            AI Macro Analyst Briefing
          </span>
        </div>

        {fetchingAnalysis ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div className="shimmer" style={{ height: '14px', width: '100%', borderRadius: '4px' }} />
            <div className="shimmer" style={{ height: '14px', width: '85%', borderRadius: '4px' }} />
            <div className="shimmer" style={{ height: '14px', width: '92%', borderRadius: '4px' }} />
          </div>
        ) : aiAnalysis ? (
          <div style={{ 
            color: '#E5E7EB', 
            fontSize: '14px', 
            lineHeight: '1.8', 
            fontWeight: 500,
            whiteSpace: 'pre-wrap',
            letterSpacing: '-0.01em'
          }}>
            {aiAnalysis}
          </div>
        ) : (
          <div style={{ color: 'var(--text-muted)', fontSize: '13px', fontStyle: 'italic' }}>
            이 지표에 대한 새로운 분석을 생성하는 중입니다...
          </div>
        )}
      </div>

      <div style={{ padding: '20px', background: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border-color)', height: selectedSignal.name.toUpperCase().includes('YIELD CURVE') ? '400px' : 'auto' }}>
        <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 800, marginBottom: '12px' }}>{selectedSignal.name.toUpperCase().includes('YIELD CURVE') ? 'REALTIME_MACRO_FLOW' : '60D_TREND_VISUALIZATION'}</div>
        {selectedSignal.name.toUpperCase().includes('YIELD CURVE') || selectedSignal.name.includes('금리 커브') ? (
          <TradingViewChart ticker="YIELD CURVE" companyName="Yield Curve" />
        ) : (
          <Sparkline data={chartData} color="var(--accent-brand)" height={100} />
        )}
      </div>

      <div style={{ padding: '20px', background: selectedSignal.triggered ? 'rgba(239,68,68,0.05)' : 'rgba(14,203,129,0.05)', borderRadius: '12px', border: `1px solid ${selectedSignal.triggered ? 'var(--accent-down)44' : 'var(--accent-up)44'}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <span style={{ fontSize: '12px', fontWeight: 800 }}>CURRENT_SIGNAL_STATUS</span>
          <span style={{ fontSize: '10px', fontWeight: 900, padding: '4px 8px', background: selectedSignal.triggered ? 'var(--accent-down)' : 'var(--accent-up)', color: '#000', borderRadius: '4px' }}>
            {selectedSignal.triggered ? 'CRITICAL_BREACH' : 'RANGE_STABLE'}
          </span>
        </div>
        <p className="nums" style={{ fontSize: '24px', fontWeight: 900, color: '#fff', margin: '8px 0' }}>{selectedSignal.description}</p>
        
        <div style={{ marginTop: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '8px' }}>
            <span style={{ color: 'var(--text-muted)' }}>SCORE_CONTRIBUTION</span>
            <span style={{ color: '#fff', fontWeight: 900 }}>{selectedSignal.score} / {selectedSignal.maxScore}</span>
          </div>
          <div style={{ height: '6px', background: 'rgba(0,0,0,0.2)', borderRadius: '3px', overflow: 'hidden' }}>
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
  
  // AI Analyst States
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [fetchingAnalysis, setFetchingAnalysis] = useState(false);
  const [analysisCache, setAnalysisCache] = useState<Record<string, string>>({});

  // Unified AI States
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
      
      // Default selection
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

  // Fetch AI Analysis when signal selection changes
  useEffect(() => {
    if (!selectedSignalName) return;
    
    // Check cache first
    if (analysisCache[selectedSignalName]) {
      setAiAnalysis(analysisCache[selectedSignalName]);
      return;
    }

    const getAnalysis = async () => {
      setFetchingAnalysis(true);
      setAiAnalysis(null);
      try {
        // Strip out emojis or extra text for the API search
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
      setAnalysisCache({}); // Clear cache on refresh
    } catch (err) {
      console.error('Refresh error:', err);
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
        <RefreshCw size={24} className="spin" color="var(--text-muted)" />
      </div>
    );
  }

  // ─── No Data State ───
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
      
      {/* 🔄 Local Progress Bar */}
      {(loading || refreshing) && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: 'rgba(255,255,255,0.05)', zIndex: 110 }}>
           <motion.div initial={{ width: 0 }} animate={{ width: '100%' }} transition={{ repeat: Infinity, duration: 1.5 }} style={{ height: '100%', background: 'var(--accent-brand)', boxShadow: '0 0 12px var(--accent-brand)' }} />
        </div>
      )}

      {/* 🔄 Refreshing Overlay */}
      <AnimatePresence>
        {refreshing && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ 
              position: 'absolute', 
              inset: 0, 
              background: 'rgba(10,12,18,0.4)', 
              backdropFilter: 'blur(4px)', 
              zIndex: 100, 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              flexDirection: 'column',
              gap: '16px'
            }}
          >
            <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}>
              <RefreshCw size={32} color="var(--accent-brand)" />
            </motion.div>
            <div style={{ color: 'var(--accent-brand)', fontSize: '13px', fontWeight: 900, letterSpacing: '0.1em' }}>REFRESHING_MARKET_SIGNALS...</div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── A. Strategic Action Banner (Responsive) ─── */}
      <div style={{ 
        padding: window.innerWidth > 1024 ? '24px 32px' : '20px', 
        background: `linear-gradient(90deg, rgba(0,0,0,0.4) 0%, ${summary.strategicAction.color}15 100%)`,
        borderBottom: `1px solid ${summary.strategicAction.color}33`,
        display: 'flex',
        flexDirection: window.innerWidth > 1024 ? 'row' : 'column',
        justifyContent: 'space-between',
        alignItems: window.innerWidth > 1024 ? 'center' : 'flex-start',
        gap: '20px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: window.innerWidth > 1024 ? '24px' : '16px' }}>
          <motion.div
            animate={{ scale: [1, 1.05, 1] }} 
            transition={{ duration: 3, repeat: Infinity }}
            style={{ 
              width: window.innerWidth > 1024 ? '64px' : '48px', 
              height: window.innerWidth > 1024 ? '64px' : '48px', 
              borderRadius: '50%', background: `${summary.strategicAction.color}22`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', border: `2px solid ${summary.strategicAction.color}44`,
              flexShrink: 0
            }}
          >
            {isTopCandidate 
              ? <ArrowDownCircle size={window.innerWidth > 1024 ? 32 : 24} color={summary.strategicAction.color} />
              : <ArrowUpCircle size={window.innerWidth > 1024 ? 32 : 24} color={summary.strategicAction.color} />
            }
          </motion.div>
          
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
              <span style={{ fontSize: window.innerWidth > 1024 ? '32px' : '24px', fontWeight: 900, color: '#fff', letterSpacing: '-0.02em' }}>
                {summary.strategicAction.short}
              </span>
              <StageBadge stage={summary.stage} />
            </div>
            <p style={{ fontSize: window.innerWidth > 1024 ? '15px' : '12px', fontWeight: 600, color: 'var(--text-secondary)', margin: 0 }}>
              {summary.strategicAction.long}
            </p>
          </div>
        </div>

        <div style={{ width: window.innerWidth > 1024 ? 'auto' : '100%', textAlign: 'right', display: 'flex', justifyContent: 'space-between', gap: '32px', borderTop: window.innerWidth > 1024 ? 'none' : '1px solid rgba(255,255,255,0.05)', paddingTop: window.innerWidth > 1024 ? '0' : '12px' }}>
             <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 800 }}>SIGNAL_STRENGTH</div>
                <div className="nums" style={{ fontSize: window.innerWidth > 1024 ? '32px' : '24px', fontWeight: 900, color: summary.strategicAction.color }}>
                  {summary.score}<span style={{ fontSize: '14px', opacity: 0.5 }}>/100</span>
                </div>
             </div>
             <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 800 }}>CONFIDENCE</div>
                <div className="nums" style={{ fontSize: window.innerWidth > 1024 ? '32px' : '24px', fontWeight: 900, color: '#fff' }}>
                  {summary.confidence.toFixed(0)}<span style={{ fontSize: '14px', opacity: 0.5 }}>%</span>
                </div>
             </div>
             <button onClick={handleRefresh} disabled={refreshing} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <RefreshCw size={20} className={refreshing ? 'spin' : ''} />
             </button>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: window.innerWidth > 1024 ? 'row' : 'column', minHeight: 0, overflowY: window.innerWidth > 1024 ? 'hidden' : 'auto' }}>
        
        {/* LEFT: MAIN CONTENT */}
        <div style={{ flex: 1.6, overflowY: window.innerWidth > 1024 ? 'auto' : 'visible', padding: window.innerWidth > 1024 ? '24px' : '16px', display: 'flex', flexDirection: 'column', gap: '24px', borderRight: window.innerWidth > 1024 ? '1px solid var(--border-color)' : 'none' }}>
          
          {/* 🤖 Unified AI Master Strategy Section - MOVED INSIDE SCROLLABLE AREA */}
          <div style={{
               padding: '24px',
               background: 'linear-gradient(135deg, rgba(93,92,222,0.18) 0%, rgba(139,92,246,0.05) 100%)',
               borderRadius: '24px',
               border: '1px solid rgba(139,92,246,0.3)',
               boxShadow: '0 12px 40px rgba(0,0,0,0.3)',
               position: 'relative',
               overflow: 'hidden'
             }}>
               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                 <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                   <div style={{ padding: '8px', background: 'rgba(139,92,246,0.2)', borderRadius: '12px' }}>
                     <Zap size={20} color="#A78BFA" />
                   </div>
                   <div>
                     <h2 style={{ fontSize: '15px', fontWeight: 900, color: '#A78BFA', letterSpacing: '0.05em', margin: 0 }}>
                       AI MASTER STRATEGY BRIEFING
                     </h2>
                   </div>
                 </div>
                 {window.innerWidth <= 1024 && (
                   <button onClick={() => setIsBriefingExpanded(!isBriefingExpanded)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', fontSize: '10px', fontWeight: 900, padding: '6px 12px', borderRadius: '8px' }}>
                     {isBriefingExpanded ? 'COLLAPSE' : 'EXPAND'}
                   </button>
                 )}
               </div>

               <div style={{ 
                 maxHeight: (window.innerWidth <= 1024 && !isBriefingExpanded) ? '80px' : 'none',
                 overflow: 'hidden',
                 position: 'relative'
               }}>
                 {fetchingUnified ? (
                   <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                     <div className="shimmer" style={{ height: '16px', width: '100%', borderRadius: '4px' }} />
                     <div className="shimmer" style={{ height: '16px', width: '92%', borderRadius: '4px' }} />
                   </div>
                 ) : unifiedAnalysis ? (
                   <div style={{ color: '#fff', fontSize: '15px', lineHeight: '1.8', fontWeight: 600, whiteSpace: 'pre-wrap', letterSpacing: '-0.01em' }}>
                     {unifiedAnalysis}
                   </div>
                 ) : (
                   <div style={{ color: 'var(--text-muted)', fontSize: '14px', fontStyle: 'italic' }}>분석 지침을 생성 중...</div>
                 )}
                 {window.innerWidth <= 1024 && !isBriefingExpanded && (
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '40px', background: 'linear-gradient(transparent, rgba(20,20,30,0.8))' }} />
                 )}
               </div>
           </div>
          
          {/* Main Chart */}
          <section>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '16px' }}>
               <h3 style={{ fontSize: '14px', fontWeight: 900, color: '#fff', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                 <TrendingUp size={16} color="var(--accent-brand)" /> MARKET_BENCHMARK (QQQ)
               </h3>
               <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{summary.explanation}</span>
            </div>
            <div style={{ height: '360px', background: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
              <TradingViewChart ticker="QQQ" companyName="Nasdaq 100" />
            </div>
          </section>

          {/* Indicator Grid */}
          <section>
            <h3 style={{ fontSize: '14px', fontWeight: 900, color: '#fff', marginBottom: '16px', display: 'flex', justifyContent: 'space-between' }}>
              MACRO_SIGNAL_RADAR
              {window.innerWidth <= 1024 && <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>SWIPE_TO_EXPLORE →</span>}
            </h3>
            <div 
              className={window.innerWidth <= 1024 ? "mobile-scroll-container" : ""}
              style={{ 
                display: window.innerWidth <= 1024 ? 'flex' : 'grid', 
                gridTemplateColumns: window.innerWidth <= 1024 ? 'none' : 'repeat(auto-fill, minmax(180px, 1fr))', 
                gap: '12px',
                overflowX: window.innerWidth <= 1024 ? 'auto' : 'visible',
                paddingBottom: window.innerWidth <= 1024 ? '12px' : '0'
              }}
            >
              {[...(details?.signal.coreSignals || []), ...(details?.signal.supportSignals || [])].map((s, i) => (
                <motion.div 
                  key={i} 
                  animate={refreshing ? { opacity: 0.3 } : { opacity: 1 }}
                  style={{ minWidth: window.innerWidth <= 1024 ? '180px' : 'auto', flexShrink: 0 }}
                >
                   <SignalCard 
                     signal={s} 
                     chartData={getChartData(s.name, details?.chartData || [])}
                     active={selectedSignalName === s.name}
                     onClick={() => setSelectedSignalName(s.name)}
                   />
                </motion.div>
              ))}
            </div>
          </section>
        </div>

        {/* RIGHT: DEEP ANALYSIS PANEL */}
        <div style={{ flex: 1, padding: window.innerWidth > 1024 ? '24px' : '16px', overflowY: window.innerWidth > 1024 ? 'auto' : 'visible', background: 'rgba(0,0,0,0.1)', borderTop: window.innerWidth > 1024 ? 'none' : '1px solid var(--border-color)', paddingBottom: '100px' }}>
           <ReversalDetailsPanel 
             selectedSignal={selectedSignal}
             aiAnalysis={aiAnalysis}
             fetchingAnalysis={fetchingAnalysis}
             chartData={getChartData(selectedSignal?.name || '', details?.chartData || [])}
           />
        </div>
      </div>
    </div>
  );
}
