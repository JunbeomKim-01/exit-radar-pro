import { analyzeRisk } from '../src/services/risk-engine';
import { analyzeReversal } from '../src/services/reversal-engine';
import { prisma } from '../src/server';
import { spawn } from 'child_process';
import * as path from 'path';

const TICKERS = ['MSFT', 'AAPL', 'NVDA', 'TSLA', 'GOOGL'];
const PROJECT_ROOT = path.resolve(__dirname, '../../../');

async function runScraper(ticker: string): Promise<void> {
  console.log(`--- [Community Scrape] ${ticker} 시작...`);
  return new Promise((resolve, reject) => {
    const child = spawn('npx', [
      '-y',
      'tsx',
      'apps/scraper-ts/src/index.ts',
      'scrape',
      ticker,
      '30', // 정화를 위해 최신 30개만 수집
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
        resolve(); // 하나 실패해도 계속 진행
      }
    });
  });
}

async function main() {
  console.log('🚀 [Data Refill Operation] 시작합니다...');

  for (const ticker of TICKERS) {
    console.log(`\n📦 [${ticker}] 정밀 정화 및 데이터 충전 중...`);
    
    // 1. 투심 데이터 수집 (4월 7일 최신순 로직 가동)
    await runScraper(ticker);

    // 2. 리스크 분석 및 내부자 거래 수집 (보통주 전용 필터 적용됨)
    try {
      console.log(`--- [Risk & Insider Sync] ${ticker} 분석 중...`);
      await analyzeRisk(ticker, ticker);
      console.log(`✅ [Risk & Insider Sync] ${ticker} 완료.`);
    } catch (err) {
      console.error(`❌ [Risk & Insider Sync] ${ticker} 오류:`, err);
    }
  }

  // 3. 시장 전체 판세 재분석
  console.log('\n🌍 [Market Reversal] 전체 시장 신호 갱신 중...');
  try {
    const reversal = await analyzeReversal();
    console.log(`✅ [Market Reversal] 완료: Score=${reversal.score}, Signal=${reversal.signalType}`);
  } catch (err) {
    console.error('❌ [Market Reversal] 갱신 오류:', err);
  }

  console.log('\n✨ [Mission Accomplished] 모든 데이터가 정화된 상태로 리필되었습니다.');
  process.exit(0);
}

main().catch(err => {
  console.error('💥 치명적인 오류 발생:', err);
  process.exit(1);
});
