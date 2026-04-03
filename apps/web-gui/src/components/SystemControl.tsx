import { useState, useRef, useEffect } from 'react';
import { Activity, Cpu, Database, PlayCircle, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import type { SystemStatusResponse, CrawlJob, Stock } from '../api';
import { startProcess, stopProcess, triggerCrawl, fetchCrawlJob } from '../api';

interface SystemControlProps {
  status: SystemStatusResponse | null;
  stock: Stock | null;
  onRefresh: () => void;
  hideStatus?: boolean;
}

export function SystemControl({ status, stock, onRefresh, hideStatus }: SystemControlProps) {
  const [activeJob, setActiveJob] = useState<CrawlJob | null>(null);
  const [maxCount, setMaxCount] = useState(40);
  const pollingRef = useRef<number | null>(null);

  const stopPolling = () => {
    if (pollingRef.current) {
      window.clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  const startPolling = (jobId: string) => {
    stopPolling();
    pollingRef.current = window.setInterval(async () => {
      try {
        const job = await fetchCrawlJob(jobId);
        setActiveJob(job);
        if (job.status === 'completed' || job.status === 'failed') {
          stopPolling();
          setActiveJob({ ...job, status: job.status === 'completed' ? 'completed' : 'failed' });
          setTimeout(() => { setActiveJob(null); onRefresh(); }, 3000);
        }
      } catch (err) { stopPolling(); }
    }, 2500);
  };

  useEffect(() => () => stopPolling(), []);

  const handleToggle = async (name: string, currentStatus: string) => {
    if (currentStatus === 'online') {
      if (confirm(`${name} 셧다운?`)) { await stopProcess(name); setImmediateRefresh(); }
    } else {
      await startProcess(name); setImmediateRefresh();
    }
  };

  const setImmediateRefresh = () => setTimeout(onRefresh, 1500);

  const handleCrawl = async () => {
    if (activeJob || !stock) return;
    try {
      const data = await triggerCrawl(stock.code, maxCount);
      setActiveJob({ id: data.jobId, status: 'pending', ticker: stock.code, postCount: 0, startedAt: '', completedAt: null });
      startPolling(data.jobId);
    } catch (err: any) { alert(err.response?.data?.error || '실패'); }
  };

  const StatusIndic = ({ name, label, icon: Icon, state }: any) => {
    const isOnline = state?.status === 'online';
    return (
      <motion.div 
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => handleToggle(name, state?.status || 'offline')}
        style={{ 
          display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer',
          padding: '4px 10px', borderRadius: '4px', border: '1px solid var(--border-color)',
          background: isOnline ? 'rgba(14, 203, 129, 0.15)' : 'transparent',
          transition: 'background 0.2s ease'
      }}>
        <Icon size={12} color={isOnline ? 'var(--accent-up)' : 'var(--text-muted)'} />
        <span style={{ fontSize: '11px', fontWeight: 700, color: isOnline ? 'var(--text-active)' : 'var(--text-muted)' }}>{label}</span>
      </motion.div>
    );
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', height: '100%' }}>
      {/* Sync Job */}
      {stock && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderRight: '1px solid var(--border-color)', paddingRight: '20px', minWidth: '220px' }}>
          {activeJob ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: activeJob.status === 'completed' ? 'var(--accent-up)' : 'var(--accent-brand)', fontSize: '11px', fontWeight: 800 }}>
                    {activeJob.status === 'completed' ? null : <Loader2 size={12} className="spin" />}
                    <span>
                      {activeJob.status === 'completed' ? `✓ SYNCED ${activeJob.postCount} POSTS` :
                       activeJob.status === 'pending' ? 'INITIALIZING...' : 
                       activeJob.postCount === 0 ? 'SCRAPING COMMUNITY...' : 
                       activeJob.status === 'running' ? 'SAVING & ANALYZING...' : 'SYNC FAILED'}
                    </span>
                  </div>
                <span className="nums" style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{activeJob.postCount}/{maxCount}</span>
              </div>
              
              {/* Progress Bar Container */}
              <div style={{ height: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', overflow: 'hidden', position: 'relative' }}>
                {/* Background Pulse for 0 progress state */}
                {activeJob.postCount === 0 && (
                   <motion.div 
                     animate={{ x: ['-100%', '100%'] }}
                     transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                     style={{ 
                       position: 'absolute', top: 0, left: 0, width: '40%', height: '100%', 
                       background: 'linear-gradient(90deg, transparent, var(--accent-brand), transparent)',
                       opacity: 0.3
                     }}
                   />
                )}
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, (activeJob.postCount / maxCount) * 100)}%` }}
                  transition={{ type: 'spring', stiffness: 50, damping: 20 }}
                  style={{ 
                    height: '100%', 
                    background: activeJob.status === 'completed' ? 'var(--accent-up)' : 'var(--accent-brand)',
                    boxShadow: '0 0 8px var(--accent-brand)'
                  }}
                />
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(0,0,0,0.2)', padding: '2px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', padding: '0 8px', fontWeight: 700 }}>COUNT</span>
                <input 
                  type="number" 
                  value={maxCount} 
                  onChange={(e) => setMaxCount(Math.min(100, Math.max(1, parseInt(e.target.value) || 1)))}
                  style={{ 
                    width: '38px', background: 'var(--bg-card)', border: 'none', 
                    color: '#fff', fontSize: '11px', fontWeight: 800, padding: '4px 0', borderRadius: '4px', textAlign: 'center'
                  }}
                />
              </div>
              <motion.button 
                whileHover={{ scale: 1.02, background: 'var(--accent-brand)', color: 'var(--bg-dark)' }}
                whileTap={{ scale: 0.98 }}
                onClick={handleCrawl} 
                style={{ 
                  display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 800, 
                  color: 'var(--accent-brand)', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid var(--accent-brand)', 
                  cursor: 'pointer', padding: '6px 12px', borderRadius: '6px', transition: 'all 0.2s'
                }}
              >
                <PlayCircle size={14} /> START SYNC
              </motion.button>
            </div>
          )}
        </div>
      )}

      {/* Nodes Status */}
      { !hideStatus && (
        <div style={{ display: 'flex', gap: '8px' }}>
          <StatusIndic name="api" label="API" icon={Activity} state={status?.api} />
          <StatusIndic name="classifier" label="ENGINE" icon={Cpu} state={status?.classifier} />
          <StatusIndic name="database" label="DB" icon={Database} state={status?.database} />
        </div>
      )}
    </div>
  );
}
