/**
 * TrendReversalTab — 전환 지표 탭
 * 
 * 시장 전환 위험/기회를 정량적으로 보여주는 대시보드.
 * VXN, HY OAS, DGS2, SOX 핵심 4개 + VIX, DXY, WTI, Volume 보조 4개 지표
 */

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  RefreshCw, AlertTriangle, TrendingUp, TrendingDown,
  Activity, Shield, Zap, BarChart2, DollarSign, Droplets,
  Cpu, ArrowUpCircle, ArrowDownCircle, Eye, AlertCircle, CheckCircle2
} from 'lucide-react';
import {
  fetchReversalSummary, fetchReversalDetails,
  fetchReversalCases, triggerReversalRefresh
} from '../api';
import { TradingViewChart } from './TradingViewChart';

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

interface ReversalCase {
  date: string;
  signalType: string;
  score: number;
  stage: string;
  return5d: number;
  return10d: number;
  return20d: number;
  explanation: string;
}

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

function Sparkline({ data, color }: { data: number[], color: string }) {
  if (!data || data.length === 0) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data.map((val, i) => {
    const x = (i / (data.length - 1)) * 100;
    const y = 100 - ((val - min) / range) * 100;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width="100%" height="24" viewBox="0 -5 100 110" preserveAspectRatio="none" style={{ marginTop: '4px', opacity: 0.8 }}>
       <polyline
         fill="none"
         stroke={color}
         strokeWidth="4"
         strokeLinecap="round"
         strokeLinejoin="round"
         points={points}
       />
    </svg>
  );
}

// ─── Signal Card ───

function SignalCard({ signal, isCore, chartData }: { signal: SignalBreakdown; isCore: boolean; chartData?: number[] }) {
  const fillPercent = signal.maxScore > 0 ? (signal.score / signal.maxScore) * 100 : 0;
  const barColor = signal.triggered 
    ? (fillPercent > 70 ? 'var(--accent-down)' : fillPercent > 40 ? '#fbbf24' : 'var(--accent-brand)')
    : 'var(--text-muted)';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        background: 'var(--bg-card)',
        border: `1px solid ${signal.triggered ? barColor + '44' : 'var(--border-color)'}`,
        borderRadius: '8px',
        padding: '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '11px', fontWeight: 800, color: signal.triggered ? 'var(--text-active)' : 'var(--text-muted)', textTransform: 'uppercase' }}>
          {signal.name}
        </span>
        <span className="nums" style={{ fontSize: '14px', fontWeight: 900, color: barColor }}>
          {signal.score}/{signal.maxScore}
        </span>
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

      <p style={{ fontSize: '10px', color: 'var(--text-muted)', lineHeight: 1.4, margin: 0 }}>
        {signal.description}
      </p>

      {chartData && chartData.length > 0 && (
        <Sparkline data={chartData} color={barColor} />
      )}
    </motion.div>
  );
}

// ─── Main Component ───

export function TrendReversalTab() {
  const [summary, setSummary] = useState<ReversalSummary | null>(null);
  const [details, setDetails] = useState<ReversalDetails | null>(null);
  const [cases, setCases] = useState<ReversalCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    try {
      const [s, d, c] = await Promise.all([
        fetchReversalSummary().catch(() => null),
        fetchReversalDetails().catch(() => null),
        fetchReversalCases(undefined, 10).catch(() => []),
      ]);
      setSummary(s);
      setDetails(d);
      setCases(c || []);
    } catch (err) {
      console.error('Reversal data load error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await triggerReversalRefresh();
      await loadData();
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
  if (!summary) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
        <Activity size={48} style={{ opacity: 0.2 }} color="var(--text-muted)" />
        <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>전환 지표 데이터가 없습니다.</p>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={handleRefresh}
          disabled={refreshing}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            background: 'var(--accent-brand)', color: 'var(--bg-dark)',
            border: 'none', borderRadius: '8px', padding: '10px 20px',
            fontSize: '13px', fontWeight: 800, cursor: 'pointer',
          }}
        >
          <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
          {refreshing ? '분석 중...' : '시장 데이터 수집 & 분석'}
        </motion.button>
      </div>
    );
  }

  const isTopCandidate = summary.signalType === 'TOP_CANDIDATE';
  const stageColor = summary.stage === 'CONFIRMED' ? '#ef4444' : summary.stage === 'WARN' ? '#fbbf24' : '#60a5fa';

  const getChartData = (name: string, bars: any[]) => {
    if (!bars || bars.length === 0) return [];
    if (name.includes('VXN')) return bars.map(b => b.vxnClose);
    if (name.includes('HY OAS')) return bars.map(b => b.hyOas);
    if (name.includes('DGS2')) return bars.map(b => b.dgs2);
    if (name.includes('SOX')) return bars.map(b => b.soxClose);
    if (name.includes('VIX')) return bars.map(b => b.vixClose);
    if (name.includes('DXY')) return bars.map(b => b.dxyClose);
    if (name.includes('WTI')) return bars.map(b => b.wtiClose);
    if (name.includes('거래량')) return bars.map(b => b.nasdaqVol);
    return [];
  };

  // ─── Render ───
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      
      {/* ─── A. Header Summary Card ─── */}
      <div className="terminal-header" style={{ 
        padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        borderBottom: `2px solid ${stageColor}33`,
        background: `linear-gradient(135deg, rgba(0,0,0,0.3), ${stageColor}08)`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <motion.div
            animate={{ rotate: isTopCandidate ? [0, -5, 5, 0] : [0, 5, -5, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            {isTopCandidate 
              ? <ArrowDownCircle size={32} color="#ef4444" />
              : <ArrowUpCircle size={32} color="var(--accent-up)" />
            }
          </motion.div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '16px', fontWeight: 900, color: '#fff' }}>
                {isTopCandidate ? '하락 전환 위험' : '상승 전환 기회'}
              </span>
              <StageBadge stage={summary.stage} />
            </div>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', maxWidth: '500px' }}>
              {summary.explanation}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          {/* Score */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: 800 }}>SCORE</span>
            <span className="nums" style={{ fontSize: '28px', fontWeight: 900, color: stageColor, lineHeight: 1 }}>
              {summary.score}
            </span>
            <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>/100</span>
          </div>

          {/* Confidence */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: 800 }}>CONFIDENCE</span>
            <span className="nums" style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-active)', lineHeight: 1.2 }}>
              {summary.confidence.toFixed(0)}%
            </span>
          </div>

          {/* Refresh */}
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={handleRefresh}
            disabled={refreshing}
            style={{
              background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)',
              borderRadius: '6px', padding: '8px', cursor: 'pointer', color: 'var(--text-muted)',
            }}
          >
            <RefreshCw size={16} className={refreshing ? 'spin' : ''} />
          </motion.button>
        </div>
      </div>

      {/* ─── Content Area ─── */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

        {/* Core + Support Score Summary */}
        <div style={{ display: 'flex', gap: '12px' }}>
          <div style={{ 
            flex: 1, background: 'var(--bg-card)', borderRadius: '8px', padding: '12px',
            border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '12px',
          }}>
            <Shield size={18} color={stageColor} />
            <div>
              <div style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: 800 }}>핵심 신호 점수</div>
              <span className="nums" style={{ fontSize: '20px', fontWeight: 900, color: stageColor }}>{summary.coreSignalScore}</span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>/75</span>
            </div>
          </div>
          <div style={{ 
            flex: 1, background: 'var(--bg-card)', borderRadius: '8px', padding: '12px',
            border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '12px',
          }}>
            <Zap size={18} color="var(--text-muted)" />
            <div>
              <div style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: 800 }}>보조 신호 점수</div>
              <span className="nums" style={{ fontSize: '20px', fontWeight: 900, color: 'var(--text-active)' }}>{summary.supportSignalScore}</span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>/25</span>
            </div>
          </div>
          <div style={{ 
            flex: 1, background: 'var(--bg-card)', borderRadius: '8px', padding: '12px',
            border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '12px',
          }}>
            <BarChart2 size={18} color="var(--text-muted)" />
            <div>
              <div style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: 800 }}>주요 테마</div>
              <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-active)', textTransform: 'uppercase' }}>
                {summary.riskTheme === 'volatility' ? '🔥 변동성' :
                 summary.riskTheme === 'credit' ? '💳 신용' :
                 summary.riskTheme === 'rate' ? '📈 금리' :
                 summary.riskTheme === 'leadership' ? '🏭 리더십' : '📊 복합'}
              </span>
            </div>
          </div>
        </div>

        {/* ─── A.5 TradingView Chart ─── */}
        <div style={{ height: '360px', minHeight: '360px', flexShrink: 0, background: 'var(--bg-card)', borderRadius: '8px', border: '1px solid var(--border-color)', position: 'relative', overflow: 'hidden' }}>
          <TradingViewChart ticker="QQQ" companyName="Invesco QQQ (Nasdaq 100)" />
        </div>

        {/* ─── B. Core Signal Cards ─── */}
        {details && (
          <>
            <div>
              <h3 style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <AlertTriangle size={14} color={stageColor} /> 핵심 전환 신호
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                {details.signal.coreSignals.map((s, i) => (
                  <SignalCard 
                    key={i} 
                    signal={s} 
                    isCore={true} 
                    chartData={getChartData(s.name, details.chartData)}
                  />
                ))}
              </div>
            </div>

            {/* ─── C. Support Signal Cards ─── */}
            <div>
              <h3 style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Activity size={14} /> 보조 컨텍스트 신호
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                {details.signal.supportSignals.map((s, i) => (
                  <SignalCard 
                    key={i} 
                    signal={s} 
                    isCore={false} 
                    chartData={getChartData(s.name, details.chartData)}
                  />
                ))}
              </div>
            </div>
          </>
        )}

        {/* ─── E/F. Cases Table + Action Guide ─── */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
          
          {/* Cases Table */}
          <div style={{ background: 'var(--bg-card)', borderRadius: '8px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', background: 'rgba(0,0,0,0.2)', fontSize: '12px', fontWeight: 800, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <TrendingUp size={14} /> 분석 이력
            </div>
            <div style={{ overflowY: 'auto', maxHeight: '240px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '6px 10px', fontWeight: 800 }}>DATE</th>
                    <th style={{ padding: '6px 4px', fontWeight: 800 }}>SIGNAL</th>
                    <th style={{ padding: '6px 4px', fontWeight: 800 }}>STAGE</th>
                    <th style={{ padding: '6px 4px', fontWeight: 800, textAlign: 'right' }}>SCORE</th>
                    <th style={{ padding: '6px 4px', fontWeight: 800, textAlign: 'right' }}>5D</th>
                    <th style={{ padding: '6px 4px', fontWeight: 800, textAlign: 'right' }}>10D</th>
                    <th style={{ padding: '6px 4px', fontWeight: 800, textAlign: 'right' }}>20D</th>
                  </tr>
                </thead>
                <tbody>
                  {cases.length === 0 ? (
                    <tr><td colSpan={7} style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>아직 분석 이력이 없습니다</td></tr>
                  ) : cases.map((c, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                      <td className="nums" style={{ padding: '6px 10px', color: 'var(--text-muted)' }}>
                        {new Date(c.date).toLocaleDateString(undefined, { year: '2-digit', month: '2-digit', day: '2-digit' })}
                      </td>
                      <td style={{ padding: '6px 4px' }}>
                        <span style={{ 
                          fontSize: '9px', fontWeight: 800, padding: '2px 6px', borderRadius: '3px',
                          background: c.signalType === 'TOP_CANDIDATE' ? 'rgba(239,68,68,0.1)' : 'rgba(14,203,129,0.1)',
                          color: c.signalType === 'TOP_CANDIDATE' ? '#ef4444' : 'var(--accent-up)',
                        }}>
                          {c.signalType === 'TOP_CANDIDATE' ? 'TOP' : 'BTM'}
                        </span>
                      </td>
                      <td style={{ padding: '6px 4px', fontSize: '9px', fontWeight: 700, color: 'var(--text-muted)' }}>{c.stage}</td>
                      <td className="nums" style={{ padding: '6px 4px', textAlign: 'right', fontWeight: 800, color: 'var(--text-active)' }}>{c.score}</td>
                      <td className="nums" style={{ padding: '6px 4px', textAlign: 'right', color: c.return5d >= 0 ? 'var(--accent-up)' : 'var(--accent-down)' }}>{c.return5d.toFixed(1)}%</td>
                      <td className="nums" style={{ padding: '6px 4px', textAlign: 'right', color: c.return10d >= 0 ? 'var(--accent-up)' : 'var(--accent-down)' }}>{c.return10d.toFixed(1)}%</td>
                      <td className="nums" style={{ padding: '6px 4px', textAlign: 'right', color: c.return20d >= 0 ? 'var(--accent-up)' : 'var(--accent-down)' }}>{c.return20d.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Action Guide */}
          <div style={{ background: 'var(--bg-card)', borderRadius: '8px', border: `1px solid ${stageColor}33`, overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', background: `${stageColor}11`, fontSize: '12px', fontWeight: 800, color: stageColor, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Shield size={14} /> 행동 가이드
            </div>
            <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {isTopCandidate ? (
                <>
                  <ActionItem level={summary.stage} text="공격적 신규 진입보다 익절/현금 비중 관리 우선" />
                  <ActionItem level="INFO" text="개별 종목 EXIT 신호와 함께 교차 확인 필요" />
                  {summary.stage === 'CONFIRMED' && (
                    <ActionItem level="DANGER" text="확인된 전환 단계: 비중 축소를 적극 검토하세요" />
                  )}
                  {summary.stage === 'WARN' && (
                    <ActionItem level="WARN" text="경고 단계: 신규 매수를 자제하고 기존 포지션 점검" />
                  )}
                </>
              ) : (
                <>
                  <ActionItem level={summary.stage} text="바닥 확인 후 점진적 비중 확대 검토" />
                  <ActionItem level="INFO" text="섹터별 선도 종목 우선 검토" />
                  {summary.stage === 'CONFIRMED' && (
                    <ActionItem level="OK" text="전환 확인: 분할 매수를 적극 검토하세요" />
                  )}
                </>
              )}
              
              {/* Dominant Drivers */}
              <div style={{ marginTop: '8px', padding: '10px', background: 'rgba(0,0,0,0.2)', borderRadius: '6px' }}>
                <div style={{ fontSize: '9px', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '6px' }}>주요 원인</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                  {summary.dominantDrivers.map((d, i) => (
                    <span key={i} style={{
                      fontSize: '10px', fontWeight: 700, padding: '3px 8px', borderRadius: '4px',
                      background: `${stageColor}15`, color: stageColor, border: `1px solid ${stageColor}33`,
                    }}>
                      {d}
                    </span>
                  ))}
                </div>
              </div>

              {/* Last Updated */}
              <div style={{ fontSize: '9px', color: 'var(--text-muted)', textAlign: 'right', marginTop: '4px' }}>
                Last: {new Date(summary.updatedAt).toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      </div>
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
