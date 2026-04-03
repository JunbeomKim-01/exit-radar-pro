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
        '[data-section-name="커뮤니티__게시글"][data-post-anchor-id]',
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

          const cards = Array.from(
            document.querySelectorAll(
              '[data-section-name="커뮤니티__게시글"][data-post-anchor-id]'
            )
          );

          const results = [];

          for (const card of cards) {
            const postId = card.getAttribute("data-post-anchor-id")?.trim() ?? "";
            if (!postId) continue;

            const isRepost =
              text(card.querySelector(".tw4l-1e8fj1a2 .tw4l-1e8fj1a9")).includes("님이 리포스트함");

            const headerLabel = card.querySelector('label[for^="header::image::"]');
            const author = text(headerLabel?.querySelector(".j7y7c72"));

            const spans = headerLabel ? headerLabel.querySelectorAll("span") : [];
            const headerMeta = text(spans[1] || spans[0]);

            const cleanMeta = headerMeta.replace(/\s*\(수정됨\)/, "").trim();
            const timeMatch = cleanMeta.match(/^(방금|\d+\s*(?:분|시간|시|일)|(?:\d{4}년\s*)?\d+월\s*\d+일)/);
            const time = timeMatch ? timeMatch[1].trim() : "방금";

            const boardMatch = headerMeta.match(/・\s*([^\s]+?)에 남긴 글/);
            const boardName = boardMatch ? boardMatch[1].trim() : "toss_" + (location.pathname.split("/")[2] || "");

            let body = "";
            const bodyEl =
              card.querySelector(".tc3tm85 ._1xixuox1") ||
              card.querySelector(".tc3tm85") ||
              card.querySelector('[class*="_1xixuox"]');

            if (bodyEl) {
              body = text(bodyEl);
            }

            body = body.replace(/\\.\\.\\.\\s*더 보기/g, "").trim();

            let title = ""; // 토스 커뮤니티는 타이틀이 따로 없으므로 비워둠

            if (!body || body.length < 3) continue;

            const likeCount = extractCountFromButton(card, "좋아요 버튼");
            const commentCount = extractCountFromButton(card, "댓글 펼치기 버튼");

            results.push({
              postId,
              author,
              time,
              boardName,
              title,
              body,
              likeCount,
              commentCount,
              url: location.origin + location.pathname + "#" + postId,
              isRepost,
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
      // "최신순" 버튼/탭 찾기
      const latestTab = await page.$('button:has-text("최신순"), [role="tab"]:has-text("최신순"), a:has-text("최신순")');
      if (latestTab) {
        await latestTab.click();
        logger.info("✅ '최신순' 정렬 탭 클릭 완료");
        await page.waitForTimeout(2000);
      } else {
        // 텍스트 기반 폴백
        const buttons = await page.$$('button, [role="tab"]');
        for (const btn of buttons) {
          const text = await btn.textContent();
          if (text?.includes("최신순") || text?.includes("최신")) {
            await btn.click();
            logger.info("✅ '최신순' 정렬 탭 클릭 완료 (폴백)");
            await page.waitForTimeout(2000);
            return;
          }
        }
        logger.info("ℹ️ '최신순' 탭을 찾지 못함 - 기본 피드 순서 사용");
      }
    } catch (err) {
      logger.warn("최신순 탭 클릭 실패 (무시하고 계속 수집):", err);
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
