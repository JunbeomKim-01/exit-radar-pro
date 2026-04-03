import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { format } from 'date-fns';

interface SentimentTimelineProps {
  timeline: Array<{
    computedAt: string;
    supportRatio: number;
    criticizeRatio: number;
    neutralRatio: number;
  }>;
}

const COLORS = {
  support: 'var(--accent-up)',
  criticize: 'var(--accent-down)',
  neutral: 'var(--text-muted)'
};

export function SentimentTimeline({ timeline }: SentimentTimelineProps) {
  if (!timeline || timeline.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '240px' }}>
        <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>시계열 데이터가 없습니다.</p>
      </div>
    );
  }

  const data = timeline.map(point => ({
    ...point,
    timeLabel: format(new Date(point.computedAt), 'HH:mm')
  }));

  return (
    <div style={{ height: '260px', display: 'flex', flexDirection: 'column', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-active)' }}>Sentiment Trends</h3>
        <div style={{ display: 'flex', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: 'var(--text-muted)' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: COLORS.support }} /> 긍정
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: 'var(--text-muted)' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: COLORS.criticize }} /> 부정
          </div>
        </div>
      </div>

      <div style={{ flex: 1, position: 'relative' }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
            <defs>
              <linearGradient id="colorSupport" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={COLORS.support} stopOpacity={0.3}/>
                <stop offset="95%" stopColor={COLORS.support} stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="colorCriticize" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={COLORS.criticize} stopOpacity={0.3}/>
                <stop offset="95%" stopColor={COLORS.criticize} stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="colorNeutral" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={COLORS.neutral} stopOpacity={0.2}/>
                <stop offset="95%" stopColor={COLORS.neutral} stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
            <XAxis 
              dataKey="timeLabel" 
              stroke="var(--text-dim)" 
              fontSize={10} 
              tickLine={false} 
              axisLine={false}
              tick={{ fill: 'var(--text-muted)', fontWeight: 600 }}
              dy={10}
            />
            <YAxis 
              stroke="var(--text-dim)" 
              fontSize={10} 
              tickLine={false} 
              axisLine={false} 
              tick={{ fill: 'var(--text-muted)', fontWeight: 600 }}
            />
            <Tooltip 
              contentStyle={{ 
                background: 'rgba(15, 23, 42, 0.95)', 
                backdropFilter: 'blur(10px)',
                border: '1px solid var(--glass-border-bright)', 
                borderRadius: '12px',
                padding: '12px',
                boxShadow: 'var(--glass-shadow)',
                color: '#fff'
              }}
              itemStyle={{ fontSize: '11px', fontWeight: 600, padding: '2px 0' }}
            />
            <Area 
              type="monotone" 
              dataKey="supportRatio" 
              name="긍정" 
              stroke={COLORS.support} 
              strokeWidth={3}
              fillOpacity={1} 
              fill="url(#colorSupport)" 
              animationDuration={1500}
            />
            <Area 
              type="monotone" 
              dataKey="criticizeRatio" 
              name="부정" 
              stroke={COLORS.criticize} 
              strokeWidth={3}
              fillOpacity={1} 
              fill="url(#colorCriticize)" 
              animationDuration={1500}
            />
            <Area 
              type="monotone" 
              dataKey="neutralRatio" 
              name="중립" 
              stroke={COLORS.neutral} 
              strokeWidth={2}
              strokeDasharray="4 4"
              fillOpacity={1} 
              fill="url(#colorNeutral)" 
              animationDuration={1500}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

