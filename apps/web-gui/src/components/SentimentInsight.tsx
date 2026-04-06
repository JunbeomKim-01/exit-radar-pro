import { Sparkles, AlertCircle, AlertTriangle, Info, CheckCircle2 } from 'lucide-react';
import type { SentimentInsight as SentimentInsightType } from '../api';

interface SentimentInsightProps {
  insight: SentimentInsightType | null;
  loading: boolean;
}

export function SentimentInsight({ insight, loading }: SentimentInsightProps) {
  if (loading) {
    return (
      <div style={{ 
        display: 'flex', flexDirection: 'column', gap: '16px', minHeight: '120px',
        justifyContent: 'center', alignItems: 'center'
      }}>
        <div className="loading-container" style={{ position: 'relative' }}>
          <Sparkles size={32} className="spin" color="var(--neon-blue)" />
          <div style={{ 
            position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', 
            filter: 'blur(15px)', background: 'var(--neon-blue)', opacity: 0.3 
          }} className="pulse" />
        </div>
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--neon-blue)', letterSpacing: '0.1em' }}>
          AI ANALYZING DATA...
        </div>
      </div>
    );
  }

  if (!insight) {
    return (
      <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
        <Info size={20} style={{ marginBottom: '8px', opacity: 0.5 }} />
        <p>현재 분석된 데이터가 없습니다.<br/>[START SYNC] 버튼을 눌러 분석을 시작하세요.</p>
      </div>
    );
  }

  const getAlertConfig = (level: string) => {
    switch (level) {
      case 'danger':
        return { 
          icon: AlertCircle, 
          color: 'var(--accent-down)',
          label: 'CRITICAL ALERT'
        };
      case 'warning':
        return { 
          icon: AlertTriangle, 
          color: 'var(--text-muted)',
          label: 'MARKET WARNING'
        };
      default:
        return { 
          icon: CheckCircle2, 
          color: 'var(--accent-up)',
          label: 'STABLE TREND'
        };
    }
  };

  const config = getAlertConfig(insight.alert_level);
  const StatusIcon = config.icon;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div className="terminal-header" style={{ padding: '6px 12px', fontSize: '13px', background: 'rgba(0,0,0,0.2)', borderBottom: `1px solid ${config.color}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <StatusIcon size={14} color={config.color} />
          <span style={{ fontWeight: 700, color: 'var(--text-active)' }}>AI Intelligence Report</span>
        </div>
        <span style={{ fontSize: '10px', fontWeight: 700, color: config.color }}>{config.label}</span>
      </div>

      <div style={{ padding: '0 8px' }}>
         <p style={{ 
           fontSize: '13px', 
           lineHeight: 1.6, 
           color: 'var(--text-primary)', 
           margin: 0,
           letterSpacing: '-0.01em'
         }}>
          {insight.summary}
        </p>
      </div>

      <div style={{ 
        display: 'flex', 
        flexDirection: 'column',
        gap: '6px',
        padding: '8px',
        borderTop: '1px solid var(--border-color)',
        marginTop: '4px'
       }}>
        {insight.key_points.map((point, i) => (
          <div key={i} style={{ 
            display: 'flex', alignItems: 'flex-start', gap: '8px', 
            fontSize: '12px', color: 'var(--text-secondary)',
            background: 'rgba(0, 0, 0, 0.1)',
            padding: '6px 8px',
            borderLeft: `2px solid ${config.color}`
          }}>
            <Info size={12} color="var(--text-muted)" style={{ flexShrink: 0, marginTop: '2px' }} />
            <span style={{ lineHeight: 1.4 }}>{point}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

