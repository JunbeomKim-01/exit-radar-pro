import { useEffect, useRef } from 'react';

interface TradingViewChartProps {
  ticker: string;
  companyName?: string;
}

function getTradingViewSymbol(ticker: string, companyName?: string): string {
  // 한국 주식 (A005930 또는 005930)
  const krStockMatch = ticker.match(/^A?(\d{6})$/);
  if (krStockMatch) {
    return `KRX:${krStockMatch[1]}`;
  }
  
  // 미국 주식 (US...) -> 종목명 기반 주요 티커 매핑
  if (ticker.startsWith('US')) {
    const name = (companyName || '').toLowerCase();
    if (name.includes('에이디')) return 'NASDAQ:AMD'; // AMD
    if (name.includes('애플') || name.includes('apple')) return 'NASDAQ:AAPL';
    if (name.includes('엔비디아') || name.includes('nvidia')) return 'NASDAQ:NVDA';
    if (name.includes('테슬라') || name.includes('tesla')) return 'NASDAQ:TSLA';
    if (name.includes('마이크로소프트') || name.includes('microsoft')) return 'NASDAQ:MSFT';
    if (name.includes('아마존') || name.includes('amazon')) return 'NASDAQ:AMZN';
    if (name.includes('알파벳') || name.includes('구글') || name.includes('google')) return 'NASDAQ:GOOGL';
    if (name.includes('메타') || name.includes('meta')) return 'NASDAQ:META';
    if (name.includes('마이크로스트레티지')) return 'NASDAQ:MSTR';
    if (name.includes('코인베이스')) return 'NASDAQ:COIN';
    if (name.includes('넷플릭스') || name.includes('netflix')) return 'NASDAQ:NFLX';
    if (name.includes('스타벅스') || name.includes('starbucks')) return 'NASDAQ:SBUX';
    if (name.includes('인텔') || name.includes('intel')) return 'NASDAQ:INTC';
    if (name.includes('퀄컴') || name.includes('qualcomm')) return 'NASDAQ:QCOM';
    if (name.includes('팔란티어') || name.includes('palantir')) return 'NYSE:PLTR';
    if (name.includes('아이온큐') || name.includes('ionq')) return 'NYSE:IONQ';
    if (name.includes('티브이씨') || name.includes('tqqq')) return 'NASDAQ:TQQQ';
    if (name.includes('에스오엑스엘') || name.includes('soxl')) return 'NYSE:SOXL';

    // 매크로 지표 — 금리 커브 등
    if (name.includes('금리 커브') || name.includes('yield curve')) return 'FRED:T10Y2Y';

    if (companyName && /^[A-Z]+$/.test(companyName)) return companyName; // 이름이 원래 심볼일 경우
  }

  // 매핑 실패 시 그대로 반환 (사용자가 'AAPL'을 직접 워치리스트에 추가했을 경우 등)
  return ticker;
}

/**
 * TradingView Advanced Chart Widget
 * 무료 위젯 — API 키 불필요
 */
export function TradingViewChart({ ticker, companyName }: TradingViewChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // 이전 차트 제거
    containerRef.current.innerHTML = '';

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.type = 'text/javascript';
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: getTradingViewSymbol(ticker, companyName),
      interval: "D",
      timezone: "Asia/Seoul",
      theme: "dark",
      style: "1",
      locale: "kr",
      backgroundColor: "rgba(10, 15, 28, 0)",
      gridColor: "rgba(255, 255, 255, 0.03)",
      hide_top_toolbar: false,
      hide_legend: false,
      allow_symbol_change: true,
      save_image: false,
      calendar: false,
      hide_volume: false,
      support_host: "https://www.tradingview.com",
      toolbar_bg: "rgba(10, 15, 28, 0)",
      enable_publishing: false,
      withdateranges: true,
      details: false,
      studies: ["STD;SMA", "STD;Bollinger_Bands"],
    });

    const widgetContainer = document.createElement('div');
    widgetContainer.className = 'tradingview-widget-container__widget';
    widgetContainer.style.height = '100%';
    widgetContainer.style.width = '100%';

    containerRef.current.appendChild(widgetContainer);
    containerRef.current.appendChild(script);
  }, [ticker]);

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="terminal-header" style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent-brand)" strokeWidth="2">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
          <h3 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-active)' }}>차트 분석</h3>
        </div>
        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Powered by TradingView</span>
      </div>
      <div
        ref={containerRef}
        className="tradingview-widget-container"
        style={{ flex: 1, width: '100%', minHeight: 0 }}
      />
    </div>
  );
}
