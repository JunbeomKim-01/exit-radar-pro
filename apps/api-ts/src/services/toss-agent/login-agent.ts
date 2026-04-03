import { chromium, type Page } from "playwright";
import { SessionManager, TossSession } from "./session-manager";
import { createLogger } from "../../logger";

const logger = createLogger("login-agent");

const TOSS_LOGIN_URL = "https://www.tossinvest.com/signin";

export interface LoginAgentOptions {
  accountName?: string;
  onScreenshot?: (base64: string) => void;
  onStatus?: (status: string) => void;
  headless?: boolean;
}

export interface PhoneLoginOptions extends LoginAgentOptions {
  name: string;
  birthday: string;
  phone: string;
}

// 외부에서 접근 가능한 페이지 참조 맵
const activePages = new Map<string, Page>();

export function getActivePage(accountName: string): Page | undefined {
  return activePages.get(accountName);
}

export async function runLoginAgent(options: LoginAgentOptions = {}): Promise<void> {
  const { accountName = "default", headless = false, onScreenshot, onStatus } = options;
  const sessionManager = new SessionManager();

  const updateStatus = (msg: string) => {
    logger.info(`[${accountName}] ${msg}`);
    if (onStatus) onStatus(msg);
  };

  updateStatus("브라우저 시작 중...");
  const browser = await chromium.launch({
    headless: headless,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    });

    const page = await context.newPage();
    activePages.set(accountName, page);
    
    // 스크린샷 루프 시작
    let screenshotInterval: any = null;
    if (onScreenshot) {
      screenshotInterval = setInterval(async () => {
        try {
          if (!page.isClosed()) {
            const buffer = await page.screenshot({ type: "jpeg", quality: 50 });
            onScreenshot(buffer.toString("base64"));
          }
        } catch (e) {}
      }, 1000);
    }

    updateStatus("토스 로그인 페이지 접속 중...");
    try {
      await page.goto(TOSS_LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
      // 폼 요소가 나타날 때까지 명시적으로 대기
      await page.waitForSelector('button:has-text("QR코드로 로그인"), button:has-text("휴대폰 번호로 로그인")', { timeout: 15000 });
    } catch (e: any) {
      updateStatus(`페이지 로드 지연/실패: ${e.message}`);
      // 실패해도 계속 진행 시도 (요소가 있을 수 있음)
    }
    
    // QR 로그인 탭으로 전환 시도 (초강력 방식)
    await trySwitchToQR(page, updateStatus, accountName);

    updateStatus("인증 대기 중 (QR 코드를 스캔하세요)");

    // 로그인 완료 감지
    await page.waitForURL(
      (url) => {
        const path = url.pathname;
        return path === "/" || path === "/home" || path === "/portfolio" || (url.hostname === "tossinvest.com" && path === "/");
      },
      { timeout: 300000 } // 5분
    );

    updateStatus("로그인 성공! 세션 저장 중...");
    
    // 쿠키 및 로컬스토리지 추출
    const cookies = await context.cookies();
    const localStorage = await page.evaluate(() => {
      const items: Record<string, string> = {};
      const win = window as any;
      for (let i = 0; i < win.localStorage.length; i++) {
        const key = win.localStorage.key(i);
        if (key) items[key] = win.localStorage.getItem(key) || "";
      }
      return items;
    });

    const session: TossSession = {
      accountName,
      cookies,
      localStorage,
      savedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };

    await sessionManager.saveSession(session);
    updateStatus("세션 저장 완료.");

    if (screenshotInterval) clearInterval(screenshotInterval);
  } catch (error: any) {
    updateStatus(`오류 발생: ${error.message}`);
    throw error;
  } finally {
    activePages.delete(accountName);
    await browser.close();
  }
}

/**
 * 휴대폰 번호 입력을 통한 로그인 자동화 에이전트
 */
export async function runPhoneLoginAgent(options: PhoneLoginOptions): Promise<void> {
  const { accountName = "default", name, birthday, phone, headless = false, onScreenshot, onStatus } = options;
  const sessionManager = new SessionManager();

  const updateStatus = (msg: string) => {
    logger.info(`[${accountName}:Phone] ${msg}`);
    if (onStatus) onStatus(msg);
  };

  updateStatus("브라우저 시작 중...");
  const browser = await chromium.launch({
    headless: headless,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    });

    const page = await context.newPage();
    activePages.set(accountName, page);
    
    // 스크린샷 루프
    let screenshotInterval: any = null;
    if (onScreenshot) {
      screenshotInterval = setInterval(async () => {
        try {
          if (!page.isClosed()) {
            const buffer = await page.screenshot({ type: "jpeg", quality: 50 });
            onScreenshot(buffer.toString("base64"));
          }
        } catch (e) {}
      }, 1000);
    }

    updateStatus("로그인 페이지 접속 중...");
    try {
      await page.goto(TOSS_LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForSelector('button:has-text("QR코드로 로그인"), button:has-text("휴대폰 번호로 로그인")', { timeout: 15000 });
    } catch (e: any) {
      updateStatus(`페이지 로드 지연/실패: ${e.message}`);
    }
    
    // 휴대폰 번호 로그인 탭으로 전환
    await trySwitchToPhoneLogin(page, updateStatus);

    // 정보 입력 및 버튼 클릭 (성공할 때까지 최대 1회 새로고침 시도)
    try {
      await fillPhoneLoginDetails(page, { name, birthday, phone }, updateStatus);
    } catch (e: any) {
      updateStatus("자동 입력 도중 오류 발생. 페이지 새로고침 후 재시도 합니다.");
      try {
        await page.reload();
        await page.waitForTimeout(2000);
        await trySwitchToPhoneLogin(page, updateStatus);
        await fillPhoneLoginDetails(page, { name, birthday, phone }, updateStatus);
      } catch (e2: any) {
        updateStatus("자동 입력/클릭에 최종 실패했습니다. [로그인 버튼 직접 누르기] 버튼을 이용해 주세요.");
        logger.warn(`[${accountName}] 자동 입력 최종 실패: ${e2.message}. 수동 입력을 위해 브라우저를 유지합니다.`);
        // 여기서 에러를 던지지 않고 아래 waitForURL 단계로 넘어가서 사용자의 수동 조작을 기다립니다.
      }
    }

    updateStatus("인증 요청 전송 시도됨. 휴대폰 앱에서 승인해 주세요.");

    // 로그인 완료 감지 (URL 변화 감지)
    await page.waitForURL(
      (url) => {
        const path = url.pathname;
        return path === "/" || path === "/home" || path === "/portfolio" || (url.hostname === "tossinvest.com" && path === "/");
      },
      { timeout: 300000 } // 5분
    );

    updateStatus("로그인 성공! 세션 저장 중...");
    
    const cookies = await context.cookies();
    const localStorage = await page.evaluate(() => {
      const items: Record<string, string> = {};
      const win = window as any;
      for (let i = 0; i < win.localStorage.length; i++) {
        const key = win.localStorage.key(i);
        if (key) items[key] = win.localStorage.getItem(key) || "";
      }
      return items;
    });

    const session: TossSession = {
      accountName,
      cookies,
      localStorage,
      savedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };

    await sessionManager.saveSession(session);
    updateStatus("세션 저장 완료.");

    if (screenshotInterval) clearInterval(screenshotInterval);
  } catch (error: any) {
    updateStatus(`오류 발생: ${error.message}`);
    throw error;
  } finally {
    activePages.delete(accountName);
    await browser.close();
  }
}

/**
 * 전역적으로 QR 탭으로의 전환을 시도하는 함수 (외부 노출용)
 */
export async function manualSwitchToQR(accountName: string, updateStatus?: Function): Promise<boolean> {
  const page = activePages.get(accountName);
  if (!page) return false;
  
  const statusFunc = updateStatus || ((msg: string) => logger.info(`[Manual:QR] ${msg}`));
  try {
    await trySwitchToQR(page, statusFunc, accountName);
    return true;
  } catch (e) {
    logger.error(`[Manual:QR] Error: ${e}`);
    return false;
  }
}

/**
 * 전역적으로 휴대폰 번호 로그인 탭으로의 전환을 시도하는 함수 (외부 노출용)
 */
export async function manualSwitchToPhoneLogin(accountName: string, updateStatus?: Function): Promise<boolean> {
  const page = activePages.get(accountName);
  if (!page) return false;
  
  const statusFunc = updateStatus || ((msg: string) => logger.info(`[Manual:Phone] ${msg}`));
  try {
    await trySwitchToPhoneLogin(page, statusFunc);
    return true;
  } catch (e) {
    logger.error(`[Manual:Phone] Error: ${e}`);
    return false;
  }
}

async function trySwitchToQR(page: Page, updateStatus: Function, accountName: string) {
  updateStatus("QR 로그인 탭으로 전환 중...");
  const qrTabSelector = 'button:has-text("QR코드로 로그인")';
  
  try {
    // 1. 텍스트 기반 대기 및 클릭
    await page.waitForSelector(qrTabSelector, { timeout: 15000 });
    await page.click(qrTabSelector, { clickCount: 2 }); // 더블클릭 시도
    
    // 2. 좌표 기반 백업 클릭 (X=571, Y=289)
    await page.mouse.click(571, 289);
    
    // 3. 검증
    const qrExists = await page.evaluate(() => {
      return (document as any).body.innerText.includes('휴대폰 카메라로');
    });
    
    if (qrExists) {
      updateStatus("QR 인증 화면 전환 완료");
    } else {
    }
    
    // 최종 확인
    const qrVisible = await page.evaluate(() => {
      const texts = (document as any).body.innerText;
      return texts.includes('카메라로') || texts.includes('스캔');
    });
    if (qrVisible) {
      updateStatus("QR 인증 화면 전환 완료");
    } else {
      updateStatus("QR 전환 시도됨 (수동 확인 필요)");
    }
  } catch (e) {
    logger.warn(`[${accountName}] QR 탭 전환 시도 중 오류: ${e}`);
    // 자바스크립트로 강제 클릭 시도
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
      const btn = buttons.find(b => (b as any).innerText?.includes('QR코드'));
      if (btn) (btn as any).click();
    });
    updateStatus("QR 전환 명령 전송됨");
  }
}

async function trySwitchToPhoneLogin(page: Page, updateStatus: Function) {
  updateStatus("휴대폰 번호 로그인 탭으로 전환 중...");
  const phoneTabSelector = 'button:has-text("휴대폰 번호로 로그인")';
  
  const switchViaJS = async () => {
    return await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button, [role="button"]'));
      const phoneBtn = btns.find(b => (b as any).innerText?.includes('휴대폰 번호')) as HTMLElement;
      if (phoneBtn) {
        ['mousedown', 'mouseup', 'click'].forEach(evtType => {
          phoneBtn.dispatchEvent(new MouseEvent(evtType, { bubbles: true, cancelable: true, view: window, buttons: 1 }));
        });
        return true;
      }
      return false;
    });
  };

  try {
    // 1. Playwright 클릭 시도
    await page.waitForSelector(phoneTabSelector, { timeout: 5000 });
    await page.click(phoneTabSelector, { force: true });
    
    // 2. JS 기반 Triple-Strike 백업
    await switchViaJS();
    
    updateStatus("휴대폰 번호 로그인 탭 전환 완료");
  } catch (e: any) {
    // 3. 최종 JS 강제 시도
    const success = await switchViaJS();
    if (success) {
      updateStatus("휴대폰 전환 명령 전송됨 (JS)");
    } else {
      updateStatus("탭 전환 실패 (확인 필요)");
    }
  }
}

export async function fillPhoneLoginDetails(page: Page, details: { name: string, birthday: string, phone: string }, updateStatus: Function) {
  updateStatus("정보 입력 중 (이름, 생년월일, 전화번호)...");
  
  // 1. 이름 입력 (이방식은 IME 입력을 위해 이벤트를 강제로 발생시킵니다)
  const nameSelector = 'input[placeholder="이름"]';
  await page.waitForSelector(nameSelector, { timeout: 10000 });
  await page.fill(nameSelector, details.name);
  await page.dispatchEvent(nameSelector, 'input', { bubbles: true });
  await page.dispatchEvent(nameSelector, 'change', { bubbles: true });
  await page.dispatchEvent(nameSelector, 'blur', { bubbles: true });
  await page.waitForTimeout(500);
  
  // 2. 생년월일 입력
  const birthdaySelector = 'input[placeholder*="생년월일"]';
  await page.fill(birthdaySelector, details.birthday);
  await page.dispatchEvent(birthdaySelector, 'input', { bubbles: true });
  await page.dispatchEvent(birthdaySelector, 'change', { bubbles: true });
  await page.dispatchEvent(birthdaySelector, 'blur', { bubbles: true });
  await page.waitForTimeout(500);
  
  // 3. 전화번호 입력
  const phoneSelector = 'input[placeholder="휴대폰 번호"]';
  await page.fill(phoneSelector, details.phone);
  await page.dispatchEvent(phoneSelector, 'input', { bubbles: true });
  await page.dispatchEvent(phoneSelector, 'change', { bubbles: true });
  await page.dispatchEvent(phoneSelector, 'blur', { bubbles: true });
  await page.waitForTimeout(500);

  // 4. 약관 동의 (필수 약관 모두 동의)
  updateStatus("약관 동의 체크 중...");
  try {
    const agreeAllBtn = 'button[aria-label="동의 체크박스"]';
    await page.waitForSelector(agreeAllBtn, { timeout: 5000 });
    
    // 현재 체크 상태 확인
    const isChecked = await page.evaluate((sel) => {
      const btn = window.document.querySelector(sel);
      return btn?.getAttribute('aria-checked') === 'true';
    }, agreeAllBtn);
    
    if (!isChecked) {
      await page.click(agreeAllBtn);
      await page.waitForTimeout(500);
    }
  } catch(e) {
    // 실패시 텍스트 기반 라벨 클릭 시도
    try {
      await page.evaluate(() => {
        const labels = Array.from(window.document.querySelectorAll('label, span, p'));
        const target = labels.find(l => (l as any).innerText?.includes('모두 동의'));
        if (target) {
          (target as any).click();
          // 부모 노드도 클릭 시도 (버튼인 경우 대비)
          if (target.parentElement && target.parentElement.tagName === 'BUTTON') {
             (target.parentElement as any).click();
          }
        }
      });
    } catch(e2) {
      logger.warn("약관 동의 클릭 실패 - 직접 클릭이 필요할 수 있습니다.");
    }
  }

  // 5. 로그인 버튼 클릭 활성화 대기 및 최종 에러 체크
  updateStatus("로그인 버튼 대기 중...");
  
  // 입력 정보에 따른 에러 메시지 확인
  const errorMsg = await page.evaluate(() => {
    const errorEls = Array.from(window.document.querySelectorAll('p, span, div'))
      .filter(el => {
        const style = window.getComputedStyle(el as HTMLElement);
        const color = style.color;
        // 빨간색 계열의 텍스트가 있는지 확인 (Toss 에러 컬러)
        return (color.includes('240') || color.includes('255, 0, 0')) && (el.textContent?.length || 0) > 2;
      });
    return errorEls.length > 0 ? errorEls[0].textContent : null;
  });

  if (errorMsg) {
    updateStatus(`입력 오류 감지: ${errorMsg}`);
    logger.warn(`폼 입력 오류 감지: ${errorMsg}`);
  }

  // 버튼이 존재하고 활성화(disabled가 아님)될 때까지 대기
  try {
    await page.waitForFunction(() => {
      const btns = Array.from(window.document.querySelectorAll('button'));
      const btn = btns.find(b => {
        const text = (b as HTMLElement).innerText;
        return text.includes('로그인') || text.includes('인증 요청');
      });
      return btn && !(btn as HTMLButtonElement).disabled;
    }, { timeout: 10000 });
  } catch (e) {
    logger.warn("로그인 버튼 활성화 대기 타임아웃 - 폼 입력에 문제가 있거나 약관 동의가 안됨");
    
    // 만약 버튼이 여전히 비활성화라면, 에러 메시지 재확인
    if (errorMsg) {
      updateStatus(`입력 오류로 인해 버튼이 비활성 상태입니다: ${errorMsg}`);
    } else {
      updateStatus("로그인 버튼이 활성화되지 않았습니다. 입력을 다시 확인해주세요.");
    }
  }

  try {
    updateStatus("로그인 버튼 클릭 시도 (Robust Triple-Strike)...");
    
    const pinSelector = 'button[data-contents-label="로그인"], button[data-content-tag="로그인"], [data-parent-name="PhoneNumberContent"] button';
    const textSelector = 'button:has-text("로그인"), button:has-text("인증 요청")';
    
    // 1. JS를 통한 복합 이벤트 주입 및 비활성화 강제 해제
    await page.evaluate(() => {
      const selectors = [
        'button[data-contents-label="로그인"]',
        'button[data-content-tag="로그인"]',
        '[data-parent-name="PhoneNumberContent"] button',
        'button:has-text("로그인")',
        'button:contains("로그인")'
      ];
      
      let btn: HTMLElement | null = null;
      for (const sel of selectors) {
        btn = document.querySelector(sel) as HTMLElement;
        if (btn) break;
      }

      if (btn) {
        // 비활성화 속성 강제 제거
        btn.removeAttribute('disabled');
        btn.removeAttribute('aria-disabled');
        btn.setAttribute('tabindex', '0');
        btn.style.opacity = '1';
        btn.style.pointerEvents = 'auto';

        const events = ['mousedown', 'mouseup', 'click'];
        events.forEach(evtType => {
          btn!.dispatchEvent(new MouseEvent(evtType, {
            bubbles: true,
            cancelable: true,
            view: window,
            buttons: 1
          }));
        });
        return true;
      }
      return false;
    });

    // 2. Playwright 강제 클릭 (포커스 및 가려짐 무시)
    try {
      await page.click(pinSelector, { force: true, timeout: 2000 });
    } catch (e) {
      try {
        await page.click(textSelector, { force: true, timeout: 2000 });
      } catch (e2) {
        logger.warn("Playwright pinpoint click failed/timed out, relying on JS click");
      }
    }
  } catch (e) {
    logger.error("로그인 버튼 클릭 최종 실패", e);
    throw new Error("로그인 버튼을 클릭할 수 없습니다.");
  }
  updateStatus("인증 요청 전송 완료 (휴대폰 확인 필요)");
}

/**
 * 활성화된 페이지에서 로그인 버튼을 강제로 클릭합니다.
 */
export async function triggerLoginClick(accountName: string): Promise<boolean> {
  const page = activePages.get(accountName);
  if (!page) {
    logger.warn(`[${accountName}] triggerLoginClick 실패: 활성화된 페이지 없음 (세션 종료됨)`);
    return false;
  }

  try {
    const currentUrl = page.url();
    logger.info(`[${accountName}] triggerLoginClick 실행 중 (URL: ${currentUrl})`);

    // 1. 지능형 버튼 찾기 및 로깅
    const buttonDiagnostics = await page.evaluate(() => {
      const allButtons = Array.from(document.querySelectorAll('button, [role="button"], a.button, input[type="button"], input[type="submit"]'));
      
      // 정밀 타겟 검색 (Attributes first)
      const pinpointSelectors = [
        'button[data-contents-label="로그인"]',
        'button[data-content-tag="로그인"]',
        '[data-parent-name="PhoneNumberContent"] button'
      ];
      
      let match: HTMLElement | null = null;
      for (const sel of pinpointSelectors) {
        match = document.querySelector(sel) as HTMLElement;
        if (match) break;
      }

      // Fallback: Text Regex
      if (!match) {
        const targetRegex = /(로그인|인증|요청|확인|시도|시작)/;
        match = allButtons.find(b => {
          const text = (b as HTMLElement).innerText || (b as HTMLInputElement).value || "";
          return targetRegex.test(text);
        }) as HTMLElement;
      }

      if (match) {
        const btn = match as HTMLElement;
        // 비활성화 필터 우회
        btn.removeAttribute('disabled');
        btn.removeAttribute('aria-disabled');
        btn.setAttribute('tabindex', '0');
        
        // Triple-Strike 이벤트 주입
        ['mousedown', 'mouseup', 'click'].forEach(evtType => {
          btn.dispatchEvent(new MouseEvent(evtType, { bubbles: true, cancelable: true, view: window, buttons: 1 }));
        });
        return { found: true, clickedText: btn.innerText || "ATTR_MATCH", method: "pinpoint" };
      }
      
      const info = allButtons.map(b => ({
        tagName: b.tagName,
        text: (b as HTMLElement).innerText?.trim() || (b as HTMLInputElement).value || "NO_TEXT",
        disabled: (b as any).disabled || false,
        visible: (b as HTMLElement).offsetParent !== null
      }));
      return { found: false, allButtons: info };
    });

    if (buttonDiagnostics.found) {
      logger.info(`[${accountName}] 스마트 파인더가 버튼 발견 및 클릭: "${buttonDiagnostics.clickedText}"`);
      // Playwright 레벨에서도 클릭 시도 (강제)
      try {
        await page.click(`button:has-text("${buttonDiagnostics.clickedText}")`, { force: true, timeout: 1000 });
      } catch(e) {}
      return true;
    } else {
      logger.warn(`[${accountName}] 로그인 가능한 버튼을 찾지 못함. 발견된 버튼들: ${JSON.stringify(buttonDiagnostics.allButtons)}`);
      return false;
    }
  } catch (err) {
    logger.error(`[${accountName}] triggerLoginClick 실행 중 심각한 오류`, err);
    return false;
  }
}
