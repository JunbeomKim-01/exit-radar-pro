import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

interface SentimentRatioProps {
  supportRatio: number;
  neutralRatio: number;
  criticizeRatio: number;
  postCount: number;
}

const COLORS = {
  support: 'var(--accent-up)',
  criticize: 'var(--accent-down)',
  neutral: 'var(--text-muted)'
};

export function SentimentRatio({ supportRatio, neutralRatio, criticizeRatio, postCount }: SentimentRatioProps) {
  const data = [
    { name: '긍정', value: supportRatio, color: COLORS.support },
    { name: '부정', value: criticizeRatio, color: COLORS.criticize },
    { name: '중립', value: neutralRatio, color: COLORS.neutral },
  ].filter(item => item.value > 0);

  if (postCount === 0 || data.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '240px' }}>
        <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>데이터가 충분하지 않습니다.</p>
      </div>
    );
  }

  return (
    <div style={{ height: '260px', display: 'flex', flexDirection: 'column', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-active)' }}>Sentiment Distribution</h3>
        <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>LAST 24H</span>
      </div>

      <div style={{ flex: 1, position: 'relative' }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              innerRadius={75}
              outerRadius={100}
              paddingAngle={8}
              dataKey="value"
              stroke="none"
              animationBegin={0}
              animationDuration={1200}
            >
              {data.map((entry, index) => (
                <Cell 
                   key={`cell-${index}`} 
                   fill={entry.color} 
                   style={{ 
                     filter: `drop-shadow(0px 0px 8px ${entry.color}44)`,
                     cursor: 'pointer'
                   }} 
                />
              ))}
            </Pie>
            <Tooltip 
              contentStyle={{ 
                background: 'rgba(15, 23, 42, 0.9)', 
                backdropFilter: 'blur(10px)',
                border: '1px solid var(--glass-border-bright)', 
                borderRadius: '12px',
                padding: '12px',
                boxShadow: 'var(--glass-shadow)'
              }}
              itemStyle={{ fontSize: '12px', fontWeight: 600, padding: '2px 0' }}
              cursor={{ fill: 'transparent' }}
            />
          </PieChart>
        </ResponsiveContainer>
        
        {/* Center Infographic */}
        <div style={{ 
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, 
          display: 'flex', flexDirection: 'column', alignItems: 'center', 
          justifyContent: 'center', pointerEvents: 'none' 
        }}>
           <div style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>24H ANALYZED</div>
           <span style={{ fontSize: '36px', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>{postCount}</span>
           <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginTop: '4px' }}>POSTS</div>
        </div>
      </div>
    </div>
  );
}

