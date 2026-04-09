import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  User, Activity, RefreshCw, Globe, Briefcase, X
} from 'lucide-react';
import { MarketTab } from './MarketTab';
import { PortfolioTab } from './PortfolioTab';
import { TickerHub } from './TickerHub';
import { 
  fetchSystemStatus,
  getTossLoginStatus,
  startTossPhoneLogin,
  confirmTossLogin,
  type SystemStatusResponse
} from '../api';

export function RadarDashboard() {
  const [activeTab, setActiveTab] = useState<'market' | 'portfolio'>('market');
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [status, setStatus] = useState<SystemStatusResponse | null>(null);
  const [isTossLoggedIn, setIsTossLoggedIn] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      try {
        const [sys, login] = await Promise.all([
          fetchSystemStatus(),
          getTossLoginStatus()
        ]);
        setStatus(sys);
        setIsTossLoggedIn(login.loggedIn);
      } catch (err) {
        console.error('Init error:', err);
      } finally {
        setLoading(false);
      }
    };
    init();
    const timer = setInterval(async () => {
      try {
        const sys = await fetchSystemStatus();
        setStatus(sys);
      } catch {}
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  const handleSelectTicker = (ticker: string) => {
    setSelectedTicker(ticker);
  };

  const [authStep, setAuthStep] = useState<'idle' | 'waiting' | 'success'>('idle');
  const [formData, setFormData] = useState({ name: '', birthday: '', phone: '' });

  const handlePhoneAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthStep('waiting');
    try {
      await startTossPhoneLogin(formData);
      // High-precision polling for login status
      const poll = setInterval(async () => {
        const status = await getTossLoginStatus();
        
        // Critical Fix: Backend returns status.status, not status.loggedIn
        if (status.status === 'success') {
          clearInterval(poll);
          
          // Explicitly confirm the session to lock in the synced state
          try {
            await confirmTossLogin();
          } catch (e) {
            console.warn('Confirm login failed, proceeding anyway:', e);
          }

          setAuthStep('success');
          setIsTossLoggedIn(true);
          setTimeout(() => {
            setShowLoginModal(false);
            setAuthStep('idle');
          }, 1500);
        } else if (status.status === 'failed') {
          clearInterval(poll);
          setAuthStep('idle');
          console.error('Toss auth failed:', status.error);
        }
      }, 2000); // 2s frequency for faster response
    } catch (err) {
      console.error('Auth error:', err);
      setAuthStep('idle');
    }
  };

  return (
    <div className="terminal-container" style={{ background: 'var(--bg-dark)', color: '#fff', height: '100vh', width: '100vw', overflow: 'hidden', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-sans)', position: 'relative' }}>
      
      {/* Top Header */}
      <header style={{ 
        padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.2)', zIndex: 100
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div className="whale-logo" style={{ width: '32px', height: '32px', background: 'var(--accent-brand)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Activity size={20} color="#000" />
          </div>
          <div>
            <h1 style={{ fontSize: '15px', fontWeight: 900, margin: 0, letterSpacing: '0.05em' }}>EXIT_RADAR_PRO</h1>
            <div style={{ fontSize: '9px', fontWeight: 800, color: status?.api.status === 'online' ? 'var(--accent-up)' : 'var(--accent-down)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'currentColor' }} />
              {status?.api.status?.toUpperCase() || 'OFFLINE'} • NODE_{status?.api.ping}MS
            </div>
          </div>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
           <button 
             onClick={() => setShowLoginModal(true)}
             style={{ 
               background: isTossLoggedIn ? 'rgba(14,203,129,0.1)' : 'rgba(252, 213, 53, 0.1)', 
               border: '1px solid', borderColor: isTossLoggedIn ? 'var(--accent-up)' : 'var(--accent-brand)',
               padding: '6px 12px', borderRadius: '8px', color: isTossLoggedIn ? 'var(--accent-up)' : 'var(--accent-brand)',
               fontSize: '11px', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer'
             }}
           >
             <User size={14} /> {isTossLoggedIn ? 'SYNCED' : 'CONNECT_TOSS'}
           </button>
        </div>
      </header>

      {/* Main Viewport */}
      <main style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        <AnimatePresence mode="wait">
          {activeTab === 'market' && (
            <motion.div key="market" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ height: '100%' }}>
              <MarketTab onSelectTicker={handleSelectTicker} />
            </motion.div>
          )}
          {activeTab === 'portfolio' && (
            <motion.div key="portfolio" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ height: '100%' }}>
              <PortfolioTab onSelectTicker={handleSelectTicker} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Ticker Hub Overlay */}
        <AnimatePresence>
          {selectedTicker && (
            <TickerHub ticker={selectedTicker} onClose={() => setSelectedTicker(null)} />
          )}
        </AnimatePresence>
      </main>

      {/* TOSS Login Modal */}
      <AnimatePresence>
        {showLoginModal && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'absolute', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
          >
            <div className="glass-card" style={{ width: '100%', maxWidth: '400px', padding: '32px', position: 'relative', border: '1px solid var(--accent-brand)33' }}>
              <button 
                onClick={() => setShowLoginModal(false)}
                style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>

              {authStep === 'idle' && (
                <>
                  <h2 style={{ fontSize: '20px', fontWeight: 900, marginBottom: '8px' }}>TOSS_SECURITIES_SYNC</h2>
                  <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '24px' }}>
                    토스증권 포트폴리오 동기화를 위해 본인인증이 필요합니다.
                  </p>
                  
                  <form onSubmit={handlePhoneAuthSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '10px', fontWeight: 900, color: 'var(--text-muted)' }}>NAME</label>
                      <input 
                        required type="text" placeholder="홍길동"
                        value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})}
                        style={{ width: '100%', padding: '12px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '14px' }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '10px', fontWeight: 900, color: 'var(--text-muted)' }}>BIRTHDAY (6 DIGITS)</label>
                      <input 
                        required type="text" placeholder="900101" maxLength={8}
                        value={formData.birthday} onChange={e => setFormData({...formData, birthday: e.target.value})}
                        style={{ width: '100%', padding: '12px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '14px' }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '10px', fontWeight: 900, color: 'var(--text-muted)' }}>PHONE_NUMBER</label>
                      <input 
                        required type="tel" placeholder="01012345678"
                        value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})}
                        style={{ width: '100%', padding: '12px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '14px' }}
                      />
                    </div>
                    
                    <button 
                      type="submit" className="btn-primary" 
                      style={{ width: '100%', padding: '16px', fontSize: '14px', marginTop: '12px' }}
                    >
                      토스 인증 요청 송출
                    </button>
                  </form>
                </>
              )}

              {authStep === 'waiting' && (
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                  <RefreshCw size={48} className="spin" color="var(--accent-brand)" style={{ margin: '0 auto 20px' }} />
                  <h2 style={{ fontSize: '18px', fontWeight: 900, marginBottom: '8px' }}>AUTHENTICATING...</h2>
                  <p style={{ color: 'var(--text-muted)', fontSize: '13px', lineHeight: 1.6 }}>
                    사용자의 토스 앱으로 인증 요청이 발송되었습니다.<br />
                    앱에서 인증을 승인하시면 자동으로 동기화됩니다.
                  </p>
                </div>
              )}

              {authStep === 'success' && (
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                  <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'var(--accent-up)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                    <Activity size={24} color="#000" />
                  </div>
                  <h2 style={{ fontSize: '18px', fontWeight: 900, marginBottom: '8px', color: 'var(--accent-up)' }}>SYNC_SUCCESSFUL</h2>
                  <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                    토스증권 자산 동기화가 완료되었습니다.
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Global Bottom Navigation */}
      <nav style={{ 
        padding: '12px 20px', display: 'flex', justifyContent: 'center', gap: '48px',
        borderTop: '1px solid rgba(255,255,255,0.05)', background: 'rgba(10,12,18,0.9)', 
        backdropFilter: 'blur(16px)', position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 500
      }}>
        <NavButton 
          active={activeTab === 'market'} 
          onClick={() => setActiveTab('market')} 
          icon={<Globe size={20} />} 
          label="시장" 
        />
        <NavButton 
          active={activeTab === 'portfolio'} 
          onClick={() => setActiveTab('portfolio')} 
          icon={<Briefcase size={20} />} 
          label="내 자산" 
        />
      </nav>

      {loading && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 2000, background: 'var(--bg-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <RefreshCw size={32} className="spin" color="var(--accent-brand)" />
        </div>
      )}
    </div>
  );
}

function NavButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: any, label: string }) {
  return (
    <button 
      onClick={onClick}
      style={{ 
        background: 'none', border: 'none', color: active ? 'var(--accent-brand)' : 'var(--text-muted)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', cursor: 'pointer', transition: 'all 0.2s'
      }}
    >
      {icon}
      <span style={{ fontSize: '11px', fontWeight: 900 }}>{label}</span>
    </button>
  );
}
