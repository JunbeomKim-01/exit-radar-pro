/**
 * SEC Insider Trading Service — Form 4 내부자 거래 데이터 수집
 * 
 * 1차: SEC Submissions API (CIK 기반) → Form 4 XML 파싱
 * 2차: SEC EFTS 전문 검색 API
 * 3차: 데모 데이터 폴백
 */

import axios from "axios";
import { createLogger } from "../logger";

const logger = createLogger("sec-insider");

const SEC_HEADERS = {
  "User-Agent": "FMApp/1.0 (research@fmproject.dev)",
  Accept: "application/json",
};

export interface RawInsiderTrade {
  insiderName: string;
  role: string;
  side: "BUY" | "SELL";
  shares: number;
  pricePerShare: number;
  transactionDate: string;
  filingDate: string;
}

// ─── CIK 캐시 ───
const cikCache = new Map<string, string>();

/**
 * Ticker → CIK(10자리) 매핑
 */
async function tickerToCik(ticker: string): Promise<string | null> {
  if (cikCache.has(ticker)) return cikCache.get(ticker)!;

  try {
    const res = await axios.get("https://www.sec.gov/files/company_tickers.json", {
      headers: SEC_HEADERS,
      timeout: 8000,
    });

    for (const entry of Object.values(res.data) as any[]) {
      const t = (entry.ticker || "").toUpperCase();
      const cik = String(entry.cik_str).padStart(10, "0");
      cikCache.set(t, cik);
    }

    const result = cikCache.get(ticker.toUpperCase()) || null;
    if (result) logger.info(`${ticker} → CIK ${result}`);
    return result;
  } catch (err) {
    logger.warn(`CIK 매핑 실패: ${err}`);
    return null;
  }
}

/**
 * SEC Submissions API로 Form 4 파일링 목록 조회
 */
async function fetchForm4Filings(cik: string, ticker: string): Promise<RawInsiderTrade[]> {
  const url = `https://data.sec.gov/submissions/CIK${cik}.json`;
  logger.info(`SEC Submissions API 조회: ${url}`);

  const res = await axios.get(url, {
    headers: SEC_HEADERS,
    timeout: 10000,
  });

  const recentFilings = res.data?.filings?.recent || {};
  const forms: string[] = recentFilings.form || [];
  const filingDates: string[] = recentFilings.filingDate || [];
  const accessionNumbers: string[] = recentFilings.accessionNumber || [];
  const primaryDocuments: string[] = recentFilings.primaryDocument || [];

  const trades: RawInsiderTrade[] = [];

  // Form 4 (및 4/A 정정공시) 필터링 (최근 20건)
  const form4Indices = forms
    .map((f: string, i: number) => (f === "4" || f === "4/A" ? i : -1))
    .filter((i: number) => i >= 0)
    .slice(0, 20);

  logger.info(`${ticker}: Form 4 ${form4Indices.length}건 발견`);

  // 각 Form 4의 XML 파싱 (최대 10건만 상세 파싱)
  for (const idx of form4Indices.slice(0, 10)) {
    try {
      const accession = accessionNumbers[idx].replace(/-/g, "");
      const doc = primaryDocuments[idx];
      const xmlUrl = `https://www.sec.gov/Archives/edgar/data/${parseInt(cik)}/${accession}/${doc}`;

      const xmlRes = await axios.get(xmlUrl, {
        headers: SEC_HEADERS,
        timeout: 8000,
        responseType: "text",
      });

      const parsed = parseForm4Xml(xmlRes.data, filingDates[idx]);
      trades.push(...parsed);
    } catch (err) {
      // XML 파싱 실패 시 기본 정보만 추가
      trades.push({
        insiderName: "Insider",
        role: "Officer/Director",
        side: "SELL",
        shares: 0,
        pricePerShare: 0,
        transactionDate: filingDates[idx] || today(),
        filingDate: filingDates[idx] || today(),
      });
    }

    // SEC rate limit 대응 (10 req/sec)
    await sleep(120);
  }

  return trades;
}

/**
 * Form 4 XML에서 거래 정보 파싱
 */
function parseForm4Xml(xml: string, fallbackDate: string): RawInsiderTrade[] {
  const trades: RawInsiderTrade[] = [];

  // Reporting person 이름 추출
  const nameMatch = xml.match(/<rptOwnerName>(.*?)<\/rptOwnerName>/i);
  const insiderName = nameMatch?.[1] || "Unknown";

  // 직책 추출
  const titleMatch = xml.match(/<officerTitle>(.*?)<\/officerTitle>/i);
  const isDirector = /<isDirector>true<\/isDirector>/i.test(xml);
  const isOfficer = /<isOfficer>true<\/isOfficer>/i.test(xml);
  const role = titleMatch?.[1] || (isDirector ? "Director" : isOfficer ? "Officer" : "Insider");

  // 거래 블록 파싱 (nonDerivativeTransaction)
  const txBlocks = xml.match(/<nonDerivativeTransaction>[\s\S]*?<\/nonDerivativeTransaction>/gi) || [];

  for (const block of txBlocks) {
    // 거래 코드: P=Purchase, S=Sale, A=Award, M=Exercise
    const codeMatch = block.match(/<transactionCode>(.*?)<\/transactionCode>/i);
    const code = codeMatch?.[1]?.toUpperCase() || "";

    // A(Acquire), D(Dispose)
    const adMatch = block.match(/<transactionAcquiredDisposedCode>[\s\S]*?<value>(.*?)<\/value>/i);
    const ad = adMatch?.[1]?.toUpperCase() || "";

    const side: "BUY" | "SELL" = (code === "P" || ad === "A") ? "BUY" : "SELL";

    // 수량
    const sharesMatch = block.match(/<transactionShares>[\s\S]*?<value>([\d.]+)<\/value>/i);
    const shares = Math.round(parseFloat(sharesMatch?.[1] || "0"));

    // 가격
    const priceMatch = block.match(/<transactionPricePerShare>[\s\S]*?<value>([\d.]+)<\/value>/i);
    const pricePerShare = parseFloat(priceMatch?.[1] || "0");

    // 거래일
    const dateMatch = block.match(/<transactionDate>[\s\S]*?<value>([\d-]+)<\/value>/i);
    const transactionDate = dateMatch?.[1] || fallbackDate;

    if (shares > 0) {
      trades.push({
        insiderName,
        role,
        side,
        shares,
        pricePerShare: Math.round(pricePerShare * 100) / 100,
        transactionDate,
        filingDate: fallbackDate,
      });
    }
  }

  // 거래 블록이 없으면 기본 정보만
  if (trades.length === 0 && txBlocks.length === 0) {
    // derivativeTransaction 확인
    const derivBlocks = xml.match(/<derivativeTransaction>[\s\S]*?<\/derivativeTransaction>/gi) || [];
    if (derivBlocks.length > 0) {
      trades.push({
        insiderName,
        role,
        side: "SELL",
        shares: 0,
        pricePerShare: 0,
        transactionDate: fallbackDate,
        filingDate: fallbackDate,
      });
    }
  }

  return trades;
}

/**
 * SEC EFTS 전문 검색 API (폴백)
 */
async function fetchViaEfts(ticker: string): Promise<RawInsiderTrade[]> {
  const res = await axios.get("https://efts.sec.gov/LATEST/search-index", {
    params: {
      q: `"${ticker}"`,
      dateRange: "custom",
      startdt: getDateMonthsAgo(6),
      enddt: today(),
      forms: "4",
    },
    headers: SEC_HEADERS,
    timeout: 10000,
  });

  const filings = res.data?.hits?.hits || [];
  const trades: RawInsiderTrade[] = filings.map((filing: any) => {
    const src = filing._source || {};
    return {
      insiderName: src.display_names?.[0] || "Unknown",
      role: src.file_description || "Officer",
      side: detectSide(src),
      shares: parseInt(src.file_num || "0", 10) || 0,
      pricePerShare: 0, // EFTS search summary doesn't have price
      transactionDate: src.file_date || today(),
      filingDate: src.file_date || today(),
    };
  });

  // 1주 이하의 단순 서류 제출용 데이터 필터링
  return trades.filter(t => t.shares > 1);
}

/**
 * 기초 자산 매핑을 지원하는 티커 리스트 (레버리지/인버스 ETF 대응)
 */
export function resolveUnderlyingTicker(ticker: string): string {
  const t = ticker.toUpperCase();
  const mapping: Record<string, string> = {
    // Microsoft
    "MSFU": "MSFT", "MSFQ": "MSFT", "MSFX": "MSFT",
    // Tesla
    "TSLL": "TSLA", "TSLQ": "TSLA", "TSLI": "TSLA", "TSLS": "TSLA", "TSLX": "TSLA",
    // Nvidia
    "NVDU": "NVDA", "NVDS": "NVDA", "NVDL": "NVDA", "NVDX": "NVDA",
    // Apple
    "AAPU": "AAPL", "AAPD": "AAPL", "AAPX": "AAPL",
    // Alphabet
    "GOOL": "GOOGL", "GOOGD": "GOOGL",
    // Amazon
    "AMZU": "AMZN", "AMZD": "AMZN",
    // Meta
    "METU": "META", "METD": "META",
    // Coinbase
    "CONL": "COIN",
  };
  return mapping[t] || t;
}

/**
 * 메인 함수: 내부자 거래 데이터 수집
 * 1차: SECForm4 Scraper (Web) → 2차: SEC Submissions API → 3차: EFTS
 */
export async function fetchInsiderTrades(ticker: string): Promise<RawInsiderTrade[]> {
  const actualTicker = resolveUnderlyingTicker(ticker);
  
  if (actualTicker !== ticker) {
    logger.info(`${ticker} (ETF) -> ${actualTicker} (Underlying) 데이터 조회 시도`);
  }

  // 국내 주식(숫자 티커 또는 A로 시작)은 SEC 조회 건너뜀
  if (/^[A-Z]?\d{6}$/.test(actualTicker)) {
    logger.info(`${actualTicker}: 국내 주식은 SEC 공시 대상이 아님 — 건너뜀`);
    return [];
  }

  // 1차: SECForm4 Scraper (사용자의 요청에 따라 최우선)
  try {
    const { SECForm4Scraper } = await import("./scrapers/secform4-scraper");
    const scraper = new SECForm4Scraper();
    const scraped = await scraper.fetchTrades(actualTicker);
    
    if (scraped.length > 0) {
      logger.info(`${actualTicker}: SECForm4 스크레이퍼로 ${scraped.length}건 데이터 수집 완료`);
      
      return scraped.map((t: any) => {
        // Remove commas and currency signs before parsing
        const shares = parseInt(t.sharesTraded.replace(/,/g, "") || "0");
        const price = parseFloat(t.averagePrice.replace(/[$,]/g, "") || "0");
        
        return {
          insiderName: t.insiderName,
          role: t.insiderTitle,
          side: t.side,
          shares: isNaN(shares) ? 0 : shares,
          pricePerShare: isNaN(price) ? 0 : price,
          transactionDate: t.transactionDate,
          filingDate: t.transactionDate, // Detailed filing date fallback
        };
      });
    }
  } catch (err) {
    logger.warn(`SECForm4 스크레이퍼 실패 (${actualTicker}): ${err}`);
  }

  // 2차: SEC Submissions API (기존 방식)
  try {
    const cik = await tickerToCik(actualTicker);
    if (cik) {
      const trades = await fetchForm4Filings(cik, actualTicker);
      if (trades.length > 0) {
        logger.info(`${actualTicker}: SEC Submissions API로 ${trades.length}건 내부자 거래 조회 완료`);
        return trades;
      }
    }
  } catch (err) {
    logger.warn(`SEC Submissions API 실패 (${actualTicker}): ${err}`);
  }

  // 3차: EFTS 전문 검색
  try {
    const trades = await fetchViaEfts(actualTicker);
    if (trades.length > 0) {
      logger.info(`${actualTicker}: SEC EFTS로 ${trades.length}건 내부자 거래 조회 완료`);
      return trades;
    }
  } catch (err) {
    logger.warn(`SEC EFTS 실패 (${actualTicker}): ${err}`);
  }

  logger.info(`${actualTicker}: 모든 수집 경로 실패 — 리턴 빈 배열`);
  return [];
}

function detectSide(source: any): "BUY" | "SELL" {
  const desc = JSON.stringify(source).toLowerCase();
  if (desc.includes("purchase") || desc.includes("buy") || desc.includes("acquisition")) return "BUY";
  return "SELL";
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function getDateMonthsAgo(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Institution Holdings (13F) ───

export interface RawInstitutionHolding {
  institutionName: string;
  shares: number;
  changeShares: number;
  changePercent: number;
  reportDate: string;
}

/**
 * SEC EDGAR에서 13F 기관 보유 데이터를 조회합니다.
 */
export async function fetchInstitutionHoldings(ticker: string): Promise<RawInstitutionHolding[]> {
  const actualTicker = resolveUnderlyingTicker(ticker);

  try {
    // SEC EDGAR Full-Text Search for 13F
    const res = await axios.get(`https://efts.sec.gov/LATEST/search-index`, {
      params: {
        q: `"${actualTicker}"`,
        dateRange: "custom",
        startdt: getDateMonthsAgo(12),
        enddt: today(),
        forms: "13F-HR",
        hits: { n: 10 },
      },
      headers: {
        "User-Agent": "FMApp research@example.com",
        Accept: "application/json",
      },
      timeout: 10000,
    });

    const filings = res.data?.hits?.hits || [];

    if (filings.length === 0) {
      logger.info(`${actualTicker}: 13F 데이터 없음 — 리턴 빈 배열`);
      return [];
    }

    const holdings: RawInstitutionHolding[] = [];

    // Process top 5 filings to avoid heavy load (SEC rate limit is 10/s)
    for (const filing of filings.slice(0, 5)) {
      const src = filing._source || {};
      const adsh = src.adsh; // Accession number
      const cik = src.cik;
      const institutionName = src.display_names?.[0] || "Unknown Institution";
      const reportDate = src.file_date || today();

      if (!adsh || !cik) continue;

      try {
        const accession = adsh.replace(/-/g, "");
        // 13F-HR folders usually contain an XML table named 'infotable.xml' or similar
        // We first get the file listing or guess the common name
        const folderUrl = `https://www.sec.gov/Archives/edgar/data/${parseInt(cik)}/${accession}/`;
        
        // Search for the specific entry in the information table
        // This is a simplified approach: we look for the ticker string in the XML
        // Ideally we'd parse the full XML, but for performance we'll use a targeted fetch if possible
        // or fetch the full table if it's not too large.
        
        // Let's try to find 'infotable.xml' or 'informationtable.xml'
        const tableUrl = `${folderUrl}informationtable.xml`; 
        const tableRes = await axios.get(tableUrl, {
          headers: SEC_HEADERS,
          timeout: 8000,
          responseType: "text",
        }).catch(() => null);

        if (tableRes && tableRes.data) {
          const shares = parse13FShares(tableRes.data, actualTicker);
          if (shares > 0) {
            holdings.push({
              institutionName,
              shares,
              changeShares: 0, // Need previous quarter for this, defaulting to 0 for now
              changePercent: 0,
              reportDate,
            });
          }
        }
      } catch (err) {
        logger.warn(`13F parse failed for ${institutionName}: ${err}`);
      }
      
      await sleep(150); // SEC Rate limit friendly
    }

    if (holdings.length === 0) {
       // If XML parsing fails, fallback to search result metadata if available, 
       // but don't use random numbers anymore.
       logger.info(`${actualTicker}: 실제 데이터 파싱 결과 합계 0 — 빈 배열 반환`);
    }

    logger.info(`${actualTicker}: ${holdings.length}건 실데이터 추출 완료`);
    return holdings;
  } catch (err) {
    logger.warn(`SEC 기관 보유 조회 실패 (${actualTicker}) — 리턴 빈 배열`);
    return [];
  }
}

/**
 * 13F-HR 정보 테이블 XML에서 특정 티커의 보유 수량을 추출합니다.
 */
function parse13FShares(xml: string, ticker: string): number {
  // 13F XML structure: <infoTable> <nameOfIssuer>APPLE INC</nameOfIssuer> <sshPrnamt>12345</sshPrnamt> ...
  // We use a regex to find the block containing the ticker name
  // Note: 13F uses full names, so we might need fuzzy matching or CUSIP
  // For now, we'll look for blocks that might contain the ticker name
  
  const blocks = xml.match(/<infoTable>[\s\S]*?<\/infoTable>/gi) || [];
  const tickerUpper = ticker.toUpperCase();

  for (const block of blocks) {
    const issuer = (block.match(/<nameOfIssuer>(.*?)<\/nameOfIssuer>/i)?.[1] || "").toUpperCase();
    
    // Heuristic: Check if issuer name contains ticker or is a known match
    // Real-world would use CUSIP, but name matching is a decent fallback
    if (issuer.includes(tickerUpper) || isNameMatch(issuer, tickerUpper)) {
      const sharesMatch = block.match(/<sshPrnamt>(\d+)<\/sshPrnamt>/i);
      if (sharesMatch) {
         return parseInt(sharesMatch[1], 10);
      }
    }
  }
  return 0;
}

function isNameMatch(issuer: string, ticker: string): boolean {
  // Common mappings for major tickers
  const mappings: Record<string, string[]> = {
    "AAPL": ["APPLE"],
    "TSLA": ["TESLA"],
    "NVDA": ["NVIDIA"],
    "MSFT": ["MICROSOFT"],
    "GOOGL": ["ALPHABET", "GOOGLE"],
    "AMZN": ["AMAZON"],
    "META": ["META PLATFORMS", "FACEBOOK"],
  };
  
  const aliases = mappings[ticker] || [];
  return aliases.some(alias => issuer.includes(alias));
}
