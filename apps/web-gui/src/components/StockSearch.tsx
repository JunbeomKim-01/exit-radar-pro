import { useState, useEffect, useRef } from 'react';
import { Search, X, Loader2, Globe } from 'lucide-react';
import { fetchStockSuggestions, type Stock } from '../api';

interface StockSearchProps {
  onSelect: (stock: Stock) => void;
  initialValue?: string;
}

export function StockSearch({ onSelect, initialValue = "" }: StockSearchProps) {
  const [query, setQuery] = useState(initialValue);
  const [suggestions, setSuggestions] = useState<Stock[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (query.trim().length > 0) {
        setLoading(true);
        try {
          const results = await fetchStockSuggestions(query);
          setSuggestions(results);
          setIsOpen(true);
        } catch (err) {
          console.error("Search failed", err);
        } finally {
          setLoading(false);
        }
      } else {
        setSuggestions([]);
        setIsOpen(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  const handleSelect = (stock: Stock) => {
    setQuery(stock.name);
    setIsOpen(false);
    onSelect(stock);
  };

  const getMarketBadgeColor = (market?: string) => {
    if (!market) return 'var(--text-muted)';
    const m = market.toUpperCase();
    if (m.includes('KOSPI') || m.includes('KOSDAQ')) return 'var(--neon-emerald)';
    if (m.includes('NSQ') || m.includes('NASDAQ') || m.includes('NYS') || m.includes('NYSE')) return 'var(--neon-blue)';
    return 'var(--neon-rose)';
  };

  return (
    <div ref={wrapperRef} className="stock-search-wrapper" style={{ position: 'relative', width: '100%', minWidth: '280px' }}>
      <div className="search-input-container" style={{ position: 'relative' }}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => query.length > 0 && setIsOpen(true)}
          placeholder="Search KR/US Stocks..."
          autoComplete="off"
          className="glass-card search-input"
          style={{
            width: '100%',
            padding: '12px 16px 12px 42px',
            fontSize: '14px',
            fontWeight: 600,
            background: 'rgba(255, 255, 255, 0.03)',
            color: 'var(--text-primary)',
            outline: 'none',
            borderRadius: '14px',
            border: '1px solid var(--glass-border)',
            transition: 'var(--transition)',
            letterSpacing: '-0.01em'
          }}
        />
        <Search size={18} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--neon-blue)', opacity: 0.9 }} />
        <div style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            {loading && <Loader2 size={16} className="spin" style={{ color: 'var(--neon-blue)' }} />}
            {query && !loading && <X size={16} onClick={() => { setQuery(""); setSuggestions([]); }} style={{ color: 'var(--text-muted)', cursor: 'pointer' }} />}
        </div>
      </div>

      {isOpen && suggestions.length > 0 && (
        <div className="glass-card search-dropdown" style={{
          position: 'absolute',
          top: 'calc(100% + 12px)',
          left: 0,
          right: 0,
          zIndex: 1000,
          maxHeight: '380px',
          overflowY: 'auto',
          padding: '8px',
          background: 'rgba(10, 15, 25, 0.98)',
          backdropFilter: 'blur(24px)',
          border: '1px solid var(--glass-border-bright)',
          boxShadow: 'var(--glass-shadow)',
          borderRadius: '18px',
        }}>
          {suggestions.map((stock) => (
            <div
              key={stock.code}
              onClick={() => handleSelect(stock)}
              className="dropdown-item"
              style={{
                padding: '14px 16px',
                borderRadius: '12px',
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                transition: 'var(--transition)',
                marginBottom: '4px'
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>{stock.name}</span>
                  <div style={{ 
                    fontSize: '10px', 
                    color: getMarketBadgeColor(stock.market), 
                    fontWeight: 900, 
                    backgroundColor: `${getMarketBadgeColor(stock.market)}15`,
                    padding: '2px 6px',
                    borderRadius: '4px',
                    border: `1px solid ${getMarketBadgeColor(stock.market)}30`,
                    textTransform: 'uppercase'
                  }}>
                    {stock.market || 'Unknown'}
                  </div>
                </div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {stock.code.startsWith('US') ? <Globe size={10} /> : null}
                  {stock.code}
                </span>
              </div>
              <div className="arrow-icon" style={{ opacity: 0, transition: 'var(--transition)', color: 'var(--neon-blue)' }}>
                <Search size={14} />
              </div>
            </div>
          ))}
        </div>
      )}

      <style>{`
        .search-input:focus {
          border-color: var(--neon-blue) !important;
          box-shadow: 0 0 25px var(--neon-blue-glow) !important;
          background: rgba(59, 130, 246, 0.08) !important;
        }
        .dropdown-item {
          border: 1px solid transparent;
        }
        .dropdown-item:hover {
          background: rgba(255, 255, 255, 0.05) !important;
          border-color: var(--glass-border-bright) !important;
          transform: translateY(-1px);
        }
        .dropdown-item:hover .arrow-icon {
          opacity: 1;
        }
        .search-dropdown::-webkit-scrollbar { width: 5px; }
        .search-dropdown::-webkit-scrollbar-thumb { background: var(--glass-border-bright); border-radius: 10px; }
      `}</style>
    </div>
  );
}


