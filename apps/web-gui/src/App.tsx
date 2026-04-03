import { Activity } from 'lucide-react';
import { RadarDashboard } from './components/RadarDashboard';

function App() {
  return (
    <div className="app-container">
      <nav className="top-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Activity size={16} color="var(--accent-brand)" />
          <h1 style={{ fontSize: '14px', color: 'var(--text-active)', fontWeight: 700, letterSpacing: '1px' }}>
            EXIT RADAR PRO
          </h1>
        </div>
      </nav>

      {/* Main Terminal Area */}
      <RadarDashboard />
    </div>
  );
}

export default App;
