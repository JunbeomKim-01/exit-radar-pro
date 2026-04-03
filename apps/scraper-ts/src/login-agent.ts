/**
 * Login Agent — Playwright로 토스증권 로그인 페이지를 열고
 * 사용자가 수동으로 인증을 완료하면 세션을 저장합니다.
 *
 * 사용법: npx tsx src/login-agent.ts
 */

import { chromium, type BrowserContext } from "playwright";
import { SessionManager } from "./session-manager";
import { createLogger } from "./logger";

const logger = createLogger("login-agent");

const TOSS_LOGIN_URL =
  process.env.TOSS_LOGIN_URL || "https://www.tossinvest.com/signin";
const ACCOUNT_NAME = process.env.ACCOUNT_NAME || "default";

export interface LoginAgentOptions {
  accountName?: string;
  onScreenshot?: (base64: string) => void;
  headless?: boolean;
}

async function waitForLogin(context: BrowserContext, options: LoginAgentOptions): Promise<boolean> {
  const page = context.pages()[0] || (await context.newPage());
  const { onScreenshot } = options;

  logger.info(`토스증권 로그인 페이지로 이동합니다: ${TOSS_LOGIN_URL}`);
  
  // 스크린샷 캡처 루프를 이동(goto) 전으로 옮겨서 로딩 중에도 화면을 볼 수 있게 합니다.
  let screenshotInterval: NodeJS.Timeout | null = null;
  if (onScreenshot) {
    screenshotInterval = setInterval(async () => {
      try {
        if (!page.isClosed()) {
          const buffer = await page.screenshot({ type: 'jpeg', quality: 50 });
          onScreenshot(buffer.toString('base64'));
        }
      } catch (e) {
        // 내비게이션 중이거나 닫힐 때 에러 무시
      }
    }, 1000);
  }

  try {
    await page.goto(TOSS_LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
//...
    // 로그인 완료를 감지: URL 변경 또는 특정 요소 출현 대기
    await page.waitForURL(
      (url) => {
        const path = url.pathname;
        return (
          !path.includes("/signin") &&
          !path.includes("/login") &&
          !path.includes("/auth")
        );
      },
      { timeout: 300_000 } // 5분 대기
    );
    logger.info("✅ 로그인 성공이 감지되었습니다.");
    return true;
  } catch {
    // URL 패턴 감지 실패 시, 쿠키 기반으로 체크
    const cookies = await context.cookies();
    const hasAuthCookie = cookies.some(
      (c) =>
        c.name.includes("token") ||
        c.name.includes("session") ||
        c.name.includes("auth")
    );

    if (hasAuthCookie) {
      logger.info("✅ 인증 쿠키가 감지되었습니다.");
      return true;
    }

    logger.warn("⏰ 로그인 대기 시간(5분)이 초과되었습니다.");
    return false;
  } finally {
    if (screenshotInterval) clearInterval(screenshotInterval);
  }
}

export async function runLoginAgent(options: LoginAgentOptions = {}): Promise<void> {
  const { accountName = "default", headless = false } = options;
  const sessionManager = new SessionManager();
  
  const browser = await chromium.launch({
    headless: headless,
    slowMo: 100,
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      locale: "ko-KR",
    });

    const success = await waitForLogin(context, options);

    if (success) {
      // 세션 저장
      const cookies = await context.cookies();
      const pages = context.pages();
      let localStorage: Record<string, string> = {};

      if (pages.length > 0) {
        try {
          localStorage = await pages[0].evaluate(() => {
            const items: Record<string, string> = {};
            const win = window as any;
            for (let i = 0; i < win.localStorage.length; i++) {
              const key = win.localStorage.key(i);
              if (key) {
                items[key] = win.localStorage.getItem(key) || "";
              }
            }
            return items;
          });
        } catch {
          logger.warn("localStorage 읽기 실패 (교차 출처 제한 가능)");
        }
      }

      await sessionManager.saveSession({
        accountName: accountName,
        cookies: cookies.map((c) => ({
          name: c.name,
          value: c.value,
          domain: c.domain,
          path: c.path,
          expires: c.expires,
          httpOnly: c.httpOnly,
          secure: c.secure,
          sameSite: c.sameSite as "Strict" | "Lax" | "None",
        })),
        localStorage,
        savedAt: new Date().toISOString(),
        expiresAt: new Date(
          Date.now() + 24 * 60 * 60 * 1000
        ).toISOString(), // 24시간 후 만료
      });

      logger.info("💾 세션이 성공적으로 저장되었습니다.");
    } else {
      logger.error("❌ 로그인에 실패했습니다. 다시 시도해 주세요.");
      throw new Error("Login failed or timed out");
    }
  } finally {
    await browser.close();
  }
}

// 직접 실행 시
if (require.main === module) {
  require("dotenv").config({ path: "../../.env" });
  runLoginAgent({ headless: false }).catch((err) => {
    logger.error("Login agent 오류:", err);
    process.exit(1);
  });
}
