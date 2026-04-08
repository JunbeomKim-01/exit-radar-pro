import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  TrendingUp, TrendingDown, Wallet, 
  Search, AlertCircle
} from 'lucide-react';
import { type PortfolioData, type PortfolioItem, fetchMyPortfolio } from '../api';

interface PortfolioTabProps {
  onSelectTicker: (ticker: string) => void;
}

type SortKey = 'profit' | 'value' | 'name';
type SortOrder = 'asc' | 'desc';

export function PortfolioTab({ onSelectTicker }: PortfolioTabProps) {
  const [data, setData] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>('value');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [searchQuery, setSearchQuery] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetchMyPortfolio();
      setData(res);
    } catch (err) {
      console.error('Portfolio load error:', err);
      setError('포트폴리오 데이터를 불러올 수 없습니다. 토스 연동 상태를 확인하세요.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const sortedItems = useMemo(() => {
    if (!data?.items) return [];
    
    let items = [...data.items];

    // Filter
    if (searchQuery) {
      items = items.filter(item => 
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        item.ticker.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Sort
    items.sort((a, b) => {
      let valA = 0;
      let valB = 0;

      if (sortBy === 'profit') {
        valA = a.returnRate;
        valB = b.returnRate;
      } else if (sortBy === 'value') {
        valA = a.currentPrice * a.quantity;
        valB = b.currentPrice * b.quantity;
      } else if (sortBy === 'name') {
        return sortOrder === 'asc' 
          ? a.name.localeCompare(b.name) 
          : b.name.localeCompare(a.name);
      }

      return sortOrder === 'asc' ? valA - valB : valB - valA;
    });

    return items;
  }, [data, sortBy, sortOrder, searchQuery]);

  const toggleSort = (key: SortKey) => {
    if (sortBy === key) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(key);
      setSortOrder('desc');
    }
  };

  if (loading) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px', background: 'var(--bg-dark)' }}>
        <div style={{ width: '100%', maxWidth: '280px', textAlign: 'center' }}>
          <motion.div 
            animate={{ scale: [1, 1.05, 1] }} 
            transition={{ duration: 2, repeat: Infinity }}
            style={{ marginBottom: '24px', display: 'inline-block' }}
          >
            <Wallet size={48} color="var(--accent-brand)" style={{ opacity: 0.8 }} />
          </motion.div>
          <div style={{ fontSize: '14px', fontWeight: 900, color: '#fff', marginBottom: '12px', letterSpacing: '0.05em' }}>
            SYNCHRONIZING_ASSETS_FROM_TOSS...
          </div>
          <div style={{ height: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', overflow: 'hidden', marginBottom: '8px' }}>
            <motion.div 
              initial={{ width: 0 }} 
              animate={{ width: '100%' }} 
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }} 
              style={{ height: '100%', background: 'var(--accent-brand)', boxShadow: '0 0 10px var(--accent-brand)' }} 
            />
          </div>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 800 }}>
            ESTABLISHING_SECURE_CONNECTION...
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px', textAlign: 'center' }}>
        <AlertCircle size={48} color="var(--accent-down)" style={{ marginBottom: '16px', opacity: 0.5 }} />
        <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '24px' }}>{error}</p>
        <button 
          onClick={loadData}
          style={{ background: 'var(--accent-brand)', color: '#000', border: 'none', padding: '12px 24px', borderRadius: '12px', fontWeight: 900 }}
        >
          재시도
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-dark)' }}>
      
      {/* ─── Portfolio Header (Total Assets) ─── */}
      <header style={{ padding: '24px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <Wallet size={16} color="var(--accent-brand)" />
          <span style={{ fontSize: '12px', fontWeight: 900, color: 'var(--text-muted)' }}>TOTAL_ASSETS</span>
        </div>
        <h1 style={{ fontSize: '28px', fontWeight: 900, color: '#fff', margin: 0, letterSpacing: '-0.02em' }}>
          {data?.totalAssetValue.toLocaleString()} <span style={{ fontSize: '16px', opacity: 0.5 }}>{data?.currency}</span>
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
           <span style={{ 
             fontSize: '14px', fontWeight: 700, 
             color: (data?.totalReturnAmount || 0) >= 0 ? 'var(--accent-up)' : 'var(--accent-down)' 
           }}>
             {(data?.totalReturnAmount || 0) >= 0 ? '+' : ''}{data?.totalReturnAmount.toLocaleString()} ({data?.totalReturnRate.toFixed(2)}%)
           </span>
        </div>
      </header>

      {/* ─── Filter & Search ─── */}
      <div style={{ padding: '16px 20px', display: 'flex', gap: '12px', alignItems: 'center' }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
          <input 
            type="text" 
            placeholder="종목명 또는 심볼"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ 
              width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '12px', padding: '10px 10px 10px 36px', color: '#fff', fontSize: '13px'
            }}
          />
        </div>
      </div>

      {/* ─── Sort Chips ─── */}
      <div style={{ padding: '0 20px 16px', display: 'flex', gap: '8px', overflowX: 'auto' }}>
        <SortChip label="자산순" active={sortBy === 'value'} order={sortOrder} onClick={() => toggleSort('value')} />
        <SortChip label="수익률순" active={sortBy === 'profit'} order={sortOrder} onClick={() => toggleSort('profit')} />
        <SortChip label="이름순" active={sortBy === 'name'} order={sortOrder} onClick={() => toggleSort('name')} />
      </div>

      {/* ─── Inventory List ─── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 100px' }}>
        <AnimatePresence>
          {sortedItems.map((item, idx) => (
            <PortfolioRow key={item.ticker} item={item} idx={idx} onClick={() => onSelectTicker(item.ticker)} />
          ))}
        </AnimatePresence>
        {sortedItems.length === 0 && (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
            검색 결과가 없습니다.
          </div>
        )}
      </div>
    </div>
  );
}

function SortChip({ label, active, order, onClick }: { label: string, active: boolean, order: SortOrder, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      style={{ 
        padding: '6px 12px', borderRadius: '20px', border: '1px solid',
        borderColor: active ? 'var(--accent-brand)' : 'rgba(255,255,255,0.1)',
        background: active ? 'rgba(252, 213, 53, 0.1)' : 'transparent',
        color: active ? 'var(--accent-brand)' : 'var(--text-muted)',
        fontSize: '12px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px',
        whiteSpace: 'nowrap', cursor: 'pointer'
      }}
    >
      {label}
      {active && (order === 'asc' ? <TrendingUp size={12} /> : <TrendingDown size={12} />)}
    </button>
  );
}

function PortfolioRow({ item, idx, onClick }: { item: PortfolioItem, idx: number, onClick: () => void }) {
  const valuation = item.currentPrice * item.quantity;
  const isPositive = item.returnRate >= 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: idx * 0.03 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      style={{ 
        padding: '16px', borderRadius: '16px', marginBottom: '8px',
        background: 'rgba(255,255,255,0.02)', display: 'flex', alignItems: 'center',
        cursor: 'pointer', border: '1px solid transparent'
      }}
      className="portfolio-item-hover"
    >
      {/* Ticker & Name */}
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '15px', fontWeight: 900, color: '#fff', marginBottom: '2px' }}>{item.name}</div>
        <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>{item.ticker}</div>
      </div>

      {/* Valuation & Profit */}
      <div style={{ textAlign: 'right', marginRight: '16px' }}>
        <div style={{ fontSize: '14px', fontWeight: 900, color: '#fff', marginBottom: '2px' }}>
          {valuation.toLocaleString()} <span style={{ fontSize: '10px', opacity: 0.4 }}>{item.currency}</span>
        </div>
        <div style={{ fontSize: '11px', fontWeight: 800, color: isPositive ? 'var(--accent-up)' : 'var(--accent-down)' }}>
          {isPositive ? '+' : ''}{item.returnAmount.toLocaleString()}
        </div>
      </div>

      {/* Return Rate % */}
      <div style={{ 
        width: '64px', height: '32px', borderRadius: '8px',
        background: isPositive ? 'var(--accent-up-soft)' : 'var(--accent-down-soft)',
        color: isPositive ? 'var(--accent-up)' : 'var(--accent-down)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '12px', fontWeight: 900
      }}>
        {isPositive ? '+' : ''}{item.returnRate.toFixed(1)}%
      </div>
    </motion.div>
  );
}
