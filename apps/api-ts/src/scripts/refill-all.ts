import { analyzeRisk } from '../services/risk-engine';
import { analyzeReversal } from '../services/reversal-engine';
import { prisma } from '../server';
import { spawn } from 'child_process';
import * as path from 'path';

const TICKERS = ['MSFT', 'AAPL', 'NVDA', 'TSLA', 'GOOGL'];
const PROJECT_ROOT = path.resolve(__dirname, '../../../../'); 
// src/scripts/refill-all.ts 에서 root까지는:
// .. (scripts) -> .. (src) -> .. (api-ts) -> .. (apps) -> .. (root) -> 5 levels?
// Wait: apps/api-ts/src/scripts/refill-all.ts
// 1. .. -> src/scripts
// 2. .. -> src
// 3. .. -> apps/api-ts
// 4. .. -> apps
// 5. .. -> root (D:\code\exit-radar-pro)
// Correct. In my previous attempt at apps/api-ts/scripts/refill-all.ts it was 3 levels.
// Now it's 4 levels to get to apps/api-ts root, and 5 to get to D:\code\exit-radar-pro.
// Let's use absolute resolution to be safe.

async function runScraper(ticker: string): Promise<void> {
  console.log(`--- [Community Scrape] ${ticker} 시작...`);
  return new Promise((resolve, reject) => {
    const child = spawn('npx', [
      '-y',
      'tsx',
      'apps/scraper-ts/src/index.ts',
      'scrape',
      ticker,
      '30',
      'batch-refill-job',
      'default'
    ], {
      cwd: PROJECT_ROOT,
      shell: true,
      stdio: 'inherit'
    });

    child.on('close', (code) => {
      if (code === 0) {
        console.log(`✅ [Community Scrape] ${ticker} 완료.`);
        resolve();
      } else {
        console.error(`❌ [Community Scrape] ${ticker} 실패 (Code: ${code})`);
        resolve();
      }
    });
  });
}

async function main() {
  console.log('🚀 [Data Refill Operation] 시작합니다 (TS Internal)...');

  try {
     for (const ticker of TICKERS) {
      console.log(`\n📦 [${ticker}] 정밀 정화 및 데이터 충전 중...`);
      
      // 1. 투심 데이터 수집
      await runScraper(ticker);

      // 2. 리스크 분석 및 내부자 거래 수집
      console.log(`--- [Risk & Insider Sync] ${ticker} 분석 중...`);
      await analyzeRisk(ticker, ticker);
      console.log(`✅ [Risk & Insider Sync] ${ticker} 완료.`);
    }

    // 3. 시장 전체 판세 재분석
    console.log('\n🌍 [Market Reversal] 전체 시장 신호 갱신 중...');
    try {
      const reversal = await analyzeReversal();
      console.log(`✅ [Market Reversal] 완료: Score=${reversal.score}, Signal=${reversal.signalType}`);
    } catch (revErr) {
      console.warn(`⚠️ [Market Reversal] 갱신 건너뜐 (시장 데이터 부족):`, revErr instanceof Error ? revErr.message : revErr);
    }
    
  } catch (err) {
    console.error('💥 작전 중 오류 발생:', err);
  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
}

main();
