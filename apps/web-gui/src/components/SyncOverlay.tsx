import { motion, AnimatePresence } from 'framer-motion';
import { Database, CheckCircle2, AlertCircle } from 'lucide-react';

interface SyncOverlayProps {
  isVisible: boolean;
  ticker: string;
  progress: string;
  postCount: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  error?: string;
  onClose?: () => void;
}

export function SyncOverlay({ isVisible, ticker, progress, postCount, status, error, onClose }: SyncOverlayProps) {
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.85)',
            backdropFilter: 'blur(10px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px'
          }}
        >
          <motion.div
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 20 }}
            style={{
              width: '100%',
              maxWidth: '440px',
              background: 'var(--bg-panel)',
              borderRadius: '24px',
              border: '1px solid var(--border-color)',
              padding: '40px',
              textAlign: 'center',
              boxShadow: '0 24px 48px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)'
            }}
          >
            <div style={{ marginBottom: '32px', position: 'relative', display: 'inline-block' }}>
              <motion.div
                animate={{ rotate: status === 'running' ? 360 : 0 }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                style={{
                  width: '80px',
                  height: '80px',
                  borderRadius: '50%',
                  border: `3px solid ${status === 'failed' ? 'var(--accent-down)' : 'var(--accent-brand)'}22`,
                  borderTopColor: status === 'failed' ? 'var(--accent-down)' : 'var(--accent-brand)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                {status === 'completed' ? (
                  <CheckCircle2 size={32} color="var(--accent-up)" />
                ) : status === 'failed' ? (
                  <AlertCircle size={32} color="var(--accent-down)" />
                ) : (
                  <Database size={32} color="var(--accent-brand)" />
                )}
              </motion.div>
              {status === 'running' && (
                <motion.div
                  animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.6, 0.3] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  style={{
                    position: 'absolute',
                    top: -4,
                    left: -4,
                    right: -4,
                    bottom: -4,
                    borderRadius: '50%',
                    background: 'var(--accent-brand)',
                    zIndex: -1
                  }}
                />
              )}
            </div>

            <div style={{ marginBottom: '24px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 800, letterSpacing: '0.1em', marginBottom: '8px' }}>
                {status === 'completed' ? 'SYNC COMPLETED' : status === 'failed' ? 'SYNC FAILED' : 'SYNCHRONIZING_DATA'}
              </div>
              <div style={{ fontSize: '32px', fontWeight: 900, color: '#fff', marginBottom: '8px' }}>
                {ticker}
              </div>
              <div style={{ fontSize: '14px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                Toss Community Intelligence Feed
              </div>
            </div>

            <div style={{ 
              background: 'rgba(255,255,255,0.03)', 
              borderRadius: '16px', 
              padding: '20px',
              marginBottom: '32px',
              border: '1px solid var(--border-color)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 800 }}>CURRENT_STATUS</span>
                <span style={{ fontSize: '11px', color: status === 'failed' ? 'var(--accent-down)' : 'var(--accent-brand)', fontWeight: 900 }}>
                  {status.toUpperCase()}
                </span>
              </div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#fff', textAlign: 'left', marginBottom: '16px' }}>
                {progress || 'Initializing...'}
              </div>
              
              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1, background: 'var(--bg-dark)', borderRadius: '12px', padding: '12px', textAlign: 'left' }}>
                  <div style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: 800, marginBottom: '4px' }}>POSTS_COLLECTED</div>
                  <div style={{ fontSize: '18px', fontWeight: 900, color: 'var(--accent-brand)' }}>{postCount}</div>
                </div>
                <div style={{ flex: 1, background: 'var(--bg-dark)', borderRadius: '12px', padding: '12px', textAlign: 'left' }}>
                  <div style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: 800, marginBottom: '4px' }}>AI_ANALYSIS</div>
                  <div style={{ fontSize: '18px', fontWeight: 900, color: '#fff' }}>{status === 'completed' ? 'READY' : 'PENDING'}</div>
                </div>
              </div>
            </div>

            {error && (
              <div style={{ color: 'var(--accent-down)', fontSize: '12px', fontWeight: 600, marginBottom: '24px', background: 'rgba(239,68,68,0.1)', padding: '12px', borderRadius: '8px' }}>
                {error}
              </div>
            )}

            {(status === 'completed' || status === 'failed') && onClose && (
              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                onClick={onClose}
                style={{
                  width: '100%',
                  padding: '16px',
                  background: status === 'failed' ? 'transparent' : 'var(--accent-brand)',
                  color: status === 'failed' ? 'var(--text-muted)' : '#000',
                  border: status === 'failed' ? '1px solid var(--border-color)' : 'none',
                  borderRadius: '12px',
                  fontSize: '14px',
                  fontWeight: 900,
                  cursor: 'pointer'
                }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {status === 'completed' ? 'CONFIRM & RELOAD' : 'CLOSE'}
              </motion.button>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
