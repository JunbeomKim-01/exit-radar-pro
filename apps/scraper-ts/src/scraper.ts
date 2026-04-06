/**
 * Community Scraper — 저장된 세션을 이용해 토스증권 커뮤니티 게시글을 수집합니다.
 *
 * 토스증권 커뮤니티는 무한 스크롤 피드 형식이므로,
 * 스크롤하면서 피드에서 직접 게시글 텍스트를 추출합니다.
 */

import { chromium, type BrowserContext, type Page } from "playwright";
import { SessionManager, type SessionData } from "./session-manager";
import { createLogger } from "./logger";
import * as crypto from "crypto";

const logger = createLogger("scraper");

export interface ScrapedPost {
  postId: string;
  title: string;
  body: string;
  ticker: string | null;
  boardName: string;
  createdAt: string;
  authorHash: string;
  authorName: string;
  url: string;
  comments: ScrapedComment[];
  rawJson?: string;
}

export interface ScrapedComment {
  body: string;
  authorHash: string;
  createdAt: string;
}

export class CommunityScraper {
  private sessionManager: SessionManager;

  constructor() {
    this.sessionManager = new SessionManager();
  }

  /**
   * 세션을 적용한 브라우저 컨텍스트를 생성합니다.
   */
  private async createAuthenticatedContext(
    session: SessionData
  ): Promise<{ context: BrowserContext; close: () => Promise<void> }> {
    const browser = await chromium.launch({
      headless: true,
    });

    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      locale: "ko-KR",
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    });

    // 쿠키 설정
    if (session.cookies && session.cookies.length > 0) {
      await context.addCookies(session.cookies);
    }

    // localStorage 복원
    if (session.localStorage && Object.keys(session.localStorage).length > 0) {
      await context.addInitScript((storage) => {
        for (const [key, value] of Object.entries(storage)) {
          try {
            (window as any).localStorage.setItem(key, value as string);
          } catch { }
        }
      }, session.localStorage);
    }

    return {
      context,
      close: async () => {
        await context.close();
        await browser.close();
      },
    };
  }

  /**
   * 해시 함수로 작성자 정보를 익명화합니다.
   */
  private hashAuthor(author: string): string {
    return crypto
      .createHash("sha256")
      .update(author + (process.env.SESSION_ENCRYPTION_KEY || "salt"))
      .digest("hex")
      .slice(0, 16);
  }

  /**
   * 커뮤니티 피드에서 게시글을 직접 추출합니다.
   * 토스증권 커뮤니티는 무한 스크롤 피드 방식이라
   * 개별 게시글 URL이 아닌 피드 스크롤로 수집합니다.
   */
  async scrapeViaDom(
    session: SessionData,
    ticker: string,
    maxCount: number = 100,
    knownPostIds: Set<string> = new Set()
  ): Promise<ScrapedPost[]> {
    logger.info(`[DOM 모드] 종목 ${ticker} 게시글 수집 시작 (최대 ${maxCount}건 신규, 기존 ${knownPostIds.size}건 제외)`);

    const { context, close } = await this.createAuthenticatedContext(session);

    try {
      const page = await context.newPage();

      const communityUrl = `https://www.tossinvest.com/stocks/${ticker}/community`;
      logger.info(`커뮤니티 페이지 접근: ${communityUrl}`);

      await page.goto(communityUrl, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });

      logger.info("커뮤니티 피드 로딩 대기 중...");
      await page.waitForSelector(
        'button[id^="header::image::"], label.j7y7c73',
        { timeout: 15_000 }
      );

      // 최신순 정렬 탭 클릭 시도
      await this.clickLatestSortTab(page);

      await page.waitForTimeout(2000);

      const posts: ScrapedPost[] = [];
      const seenPostIds = new Set<string>();

      let stagnantCount = 0;
      const maxStagnantCount = 15; // 조금 더 끈기있게 스크롤

      while (posts.length < maxCount && stagnantCount < maxStagnantCount) {
        const feedPosts: any[] = await page.evaluate(`(() => {
          const text = (el) =>
            el?.textContent?.replace(/\\s+/g, " ").trim() ?? "";

          const extractCountFromButton = (card, label) => {
            const btn = Array.from(card.querySelectorAll("button")).find(
              (b) => b.getAttribute("aria-label") === label
            );
            if (!btn) return 0;

            const btnText = text(btn);
            const match = btnText.match(/(\\d[\\d,]*)/);
            return match ? parseInt(match[1].replace(/,/g, ""), 10) : 0;
          };

          // 프로필 이미지 버튼을 베이스로 각 게시글 카드 식별
          const profileBtns = Array.from(document.querySelectorAll('button[id^="header::image::"]'));
          const results = [];

          for (const btn of profileBtns) {
            const postId = btn.id.split("::").pop();
            if (!postId) continue;

            // 게시글 컨테이너 (각 게시글의 최상위 부모 후보)
            // 보통 button -> div -> section 또는 특정 클래스의 div
            const card = btn.closest('div[class*="_1657u9f"]') || btn.parentElement?.parentElement?.parentElement;
            if (!card) continue;

            const headerLabel = card.querySelector('label.j7y7c73') || card.querySelector('label[for^="header::image::"]');
            if (!headerLabel) continue;

            const headerDiv = headerLabel.querySelector("div");
            const spans = headerDiv ? Array.from(headerDiv.querySelectorAll(":scope > span")) : [];
            
            // 1. 이름 및 태그 추출 (첫 번째 span)
            // '차트신공<span...>1억대 자산가</span>' 형태 대응
            const nameSpan = spans[0];
            let author = "";
            let identityTag = "";
            
            if (nameSpan) {
              const badge = nameSpan.querySelector("span");
              if (badge) {
                identityTag = text(badge);
                const clone = nameSpan.cloneNode(true);
                const nestedSpan = clone.querySelector("span");
                if (nestedSpan) nestedSpan.remove();
                author = text(clone);
              } else {
                author = text(nameSpan);
              }
            }
            if (!author) author = "익명";

            // 2. 시간 추출 (마지막 span) 
            const timeSpan = spans[spans.length - 1];
            const time = timeSpan ? text(timeSpan).split("·")[0].trim() : "방금";

            // 3. 본문 추출
            // Header Label 근처의 텍스트 영역 또는 특정 클래스 탐색
            const bodyEl = 
              card.querySelector('div[class*="_1xixuox1"]') || 
              card.querySelector('span[class*="_1xixuox1"]') ||
              headerLabel.nextElementSibling ||
              headerLabel.parentElement?.nextElementSibling;
              
            let body = text(bodyEl);
            body = body.replace(/\\.\\.\\.\\s*더 보기/g, "").trim();

            // 본문이 너무 짧거나 헤더 정보와 중복되는 경우 걸러내기
            if (!body || body.length < 2 || body === author) continue;

            const likeCount = extractCountFromButton(card, "좋아요 버튼");
            const commentCount = extractCountFromButton(card, "댓글 펼치기 버튼");

            results.push({
              postId,
              author,
              time,
              boardName: "toss_" + (location.pathname.split("/")[2] || ""),
              title: "",
              body,
              likeCount,
              commentCount,
              url: location.origin + location.pathname + "#" + postId,
              isRepost: false,
              identityTag, // 메타데이터용 (추후 활용)
            });
          }

          return results;
        })()`);

        let newCount = 0;
        let skippedCount = 0;

        for (const fp of feedPosts) {
          if (seenPostIds.has(fp.postId)) continue;
          seenPostIds.add(fp.postId);

          // DB에 이미 있는 게시글은 카운트하지 않고 스킵
          if (knownPostIds.has(fp.postId)) {
            skippedCount++;
            continue;
          }

          if (posts.length >= maxCount) break;

          posts.push({
            postId: fp.postId,
            title: fp.title,
            body: fp.body,
            ticker,
            boardName: fp.boardName || `toss_${ticker}`,
            createdAt: this.parseRelativeTime(fp.time),
            authorHash: this.hashAuthor(fp.author || `unknown_${fp.postId}`),
            authorName: fp.author || "익명",
            url: fp.url || `${communityUrl}#${fp.postId}`,
            comments: [],
            rawJson: JSON.stringify({
              likeCount: fp.likeCount,
              commentCount: fp.commentCount,
              isRepost: fp.isRepost,
            }),
          });

          newCount++;
        }

        if (newCount > 0 || skippedCount > 0) {
          logger.info(`현재 ${posts.length}건 신규 수집 (이번 스크롤: +${newCount}, 중복 스킵: ${skippedCount})`);
          stagnantCount = 0;
        } else {
          stagnantCount++;
          logger.info(`새 게시글 없음 (정체 ${stagnantCount}/${maxStagnantCount})`);
        }

        await page.evaluate(() => {
          (window as any).scrollBy(0, (window as any).innerHeight * 1.2);
        });

        await page.waitForTimeout(1200 + Math.random() * 800);
      }

      // 최신순(createdAt 내림차순) 정렬
      posts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      // 날짜별 분류 요약 로그
      const dateGroups = this.groupByDate(posts);
      logger.info(`수집 완료: 총 ${posts.length}건`);
      logger.info(`--- 날짜별 분류 ---`);
      for (const [date, count] of Object.entries(dateGroups)) {
        logger.info(`  ${date}: ${count}건`);
      }

      return posts;
    } finally {
      await close();
    }
  }

  /**
   * 상대 시간 문자열을 ISO 날짜로 변환합니다.
   */
  private parseRelativeTime(timeStr: string): string {
    const now = new Date();
    const cleanTime = timeStr.replace(/\s*\(수정됨\)/g, "").trim();

    if (!cleanTime || cleanTime === "방금") {
      return now.toISOString();
    }

    // 1. 상대 시간 처리 (분, 시, 일)
    const relativeMatch = cleanTime.match(/^(\d+)\s*(분|시간|시|일)$/);
    if (relativeMatch) {
      const value = parseInt(relativeMatch[1], 10);
      const unit = relativeMatch[2];
      const d = new Date(now);

      if (unit === "분") d.setMinutes(d.getMinutes() - value);
      else if (unit === "시" || unit === "시간") d.setHours(d.getHours() - value);
      else if (unit === "일") d.setDate(d.getDate() - value);

      return d.toISOString();
    }

    // 2. 절대 날짜 처리 (YYYY년 n월 n일)
    const longDateMatch = cleanTime.match(/(\d{4})년\s*(\d+)월\s*(\d+)일/);
    if (longDateMatch) {
      const yr = parseInt(longDateMatch[1], 10);
      const mo = parseInt(longDateMatch[2], 10) - 1;
      const da = parseInt(longDateMatch[3], 10);
      return new Date(yr, mo, da, 12, 0, 0).toISOString();
    }

    // 3. 절대 날짜 처리 (n월 n일) - 올해 기준
    const shortDateMatch = cleanTime.match(/(\d+)월\s*(\d+)일/);
    if (shortDateMatch) {
      const yr = now.getFullYear();
      const mo = parseInt(shortDateMatch[1], 10) - 1;
      const da = parseInt(shortDateMatch[2], 10);
      
      const d = new Date(yr, mo, da, 12, 0, 0);
      if (d > now) d.setFullYear(yr - 1);
      return d.toISOString();
    }

    return now.toISOString();
  }

  /**
   * 토스 커뮤니티 피드에서 "최신순" 정렬 탭을 클릭합니다.
   */
  private async clickLatestSortTab(page: Page): Promise<void> {
    try {
      // 1. 현재 "인기순" 버튼 찾기 (최신 UI는 토글 버튼 형태)
      const sortBtn = await page.$('button:has-text("인기순"), button:has-text("최신순")');
      
      if (sortBtn) {
        const currentText = await sortBtn.textContent();
        if (currentText?.includes("인기순")) {
          await sortBtn.click();
          logger.info("✅ '인기순' 버튼 클릭하여 정렬 변경 시도");
          await page.waitForTimeout(1000);
          
          // 드롭다운이나 토글 메뉴에서 "최신순" 선택
          const latestOption = await page.$('li:has-text("최신순"), button:has-text("최신순"), [role="option"]:has-text("최신순")');
          if (latestOption) {
            await latestOption.click();
            logger.info("✅ 정렬 메뉴에서 '최신순' 선택 완료");
          } else {
             logger.info("ℹ️ 명시적 '최신순' 옵션 없음 - 토글되었을 가능성 확인");
          }
          await page.waitForTimeout(2000);
        } else {
          logger.info("ℹ️ 이미 '최신순' 정렬 상태입니다.");
        }
      } else {
        logger.info("ℹ️ 정렬 버튼을 찾지 못함 - 기본 피드 사용");
      }
    } catch (err) {
      logger.warn("정렬 탭 변경 실패 (무시하고 계속 수집):", err);
    }
  }

  /**
   * 수집된 게시글을 날짜(YYYY-MM-DD)별로 그룹핑하여 카운트를 반환합니다.
   */
  private groupByDate(posts: ScrapedPost[]): Record<string, number> {
    const groups: Record<string, number> = {};
    for (const post of posts) {
      const dateKey = new Date(post.createdAt).toISOString().slice(0, 10); // YYYY-MM-DD
      groups[dateKey] = (groups[dateKey] || 0) + 1;
    }
    // 날짜 내림차순 정렬
    const sorted: Record<string, number> = {};
    Object.keys(groups).sort().reverse().forEach(k => { sorted[k] = groups[k]; });
    return sorted;
  }

  /**
   * XHR/fetch 기반 내부 API 수집 (선택적 최적화)
   */
  async scrapeViaApi(
    session: SessionData,
    ticker: string,
    maxCount: number = 100
  ): Promise<ScrapedPost[]> {
    logger.info(`[API 모드] 종목 ${ticker} 게시글 수집 시작 (최대 ${maxCount}건)`);
    return this.scrapeViaDom(session, ticker, maxCount);
  }
}

// 직접 실행 시
if (require.main === module) {
  require("dotenv").config({ path: "../../.env" });

  const ticker = process.argv[2] || "005930";
  const maxCount = parseInt(process.argv[3] || "20", 10);

  const scraper = new CommunityScraper();
  const sessionManager = new SessionManager();

  sessionManager.loadSession().then(async (session) => {
    if (!session) {
      logger.error("저장된 세션이 없습니다. 먼저 로그인을 실행해 주세요: npm run login");
      process.exit(1);
    }

    const posts = await scraper.scrapeViaDom(session, ticker, maxCount);
    console.log(JSON.stringify(posts, null, 2));
  });
}
