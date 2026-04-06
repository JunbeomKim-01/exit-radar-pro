import { runLoginAgent, type LoginAgentOptions, getActivePage, fillPhoneLoginDetails } from './toss-agent/login-agent';
import { createLogger } from '../logger';

const logger = createLogger("toss-login-service");

export interface LoginSession {
  visitorId: string;
  status: string; // 'pending' | 'success' | 'failed' | 'timeout' and other granular messages
  screenshot: string | null;
  lastUpdated: number;
  error?: string;
}

class TossLoginService {
  private sessions = new Map<string, LoginSession>();

  async startLogin(visitorId: string) {
    // 이미 진행 중인 세션이 있다면 무시 (5분 내)
    const existing = this.sessions.get(visitorId);
    if (existing && (existing.status === 'pending' || existing.status === 'launching_browser') && Date.now() - existing.lastUpdated < 600000) {
       return;
    }

    this.sessions.set(visitorId, { 
      visitorId, 
      status: '브라우저 초기화 중...', 
      screenshot: null, 
      lastUpdated: Date.now() 
    });

    // 백그라운드에서 실행
    runLoginAgent({
      accountName: visitorId,
      headless: true,
      onScreenshot: (base64: string) => {
        const session = this.sessions.get(visitorId);
        if (session) {
          session.screenshot = base64;
          session.lastUpdated = Date.now();
        }
      },
      onStatus: (msg: string) => {
        const session = this.sessions.get(visitorId);
        if (session) {
          session.status = msg;
          session.lastUpdated = Date.now();
        }
      }
    }).then(() => {
      const session = this.sessions.get(visitorId);
      if (session) {
        session.status = 'success';
        session.screenshot = null;
        session.lastUpdated = Date.now();
      }
    }).catch((err: any) => {
      logger.error(`[TossLoginService] Login failed for ${visitorId}:`, err);
      const session = this.sessions.get(visitorId);
      if (session) {
        session.status = 'failed';
        session.error = String(err);
        session.lastUpdated = Date.now();
      }
    });
  }

  async startPhoneLogin(visitorId: string, details: { name: string, birthday: string, phone: string }) {
    const { runPhoneLoginAgent } = await import('./toss-agent/login-agent');
    
    // 1. 활성 페이지가 있는지 확인
    const activePage = getActivePage(visitorId);
    if (activePage) {
      logger.info(`[TossLoginService] Active page found for ${visitorId}. Reusing it for phone login.`);
      const session = this.sessions.get(visitorId);
      const updateStatus = (msg: string) => {
        if (session) {
          session.status = msg;
          session.lastUpdated = Date.now();
        }
      };

      // 백그라운드에서 정보 입력 수행 (API 응답 지연 방지)
      fillPhoneLoginDetails(activePage, details, updateStatus)
        .then(() => {
          updateStatus("확인 버튼 클릭됨. 휴대폰 앱에서 승인해 주세요.");
        })
        .catch((err: any) => {
          logger.error(`[TossLoginService] Failed to fill details on active page:`, err);
          updateStatus(`정보 입력 실패: ${err.message}`);
        });
      
      return; // 즉시 반환하여 프론트엔드 타임아웃 방지
    }

    // 2. 이미 진행 중인 세션이 있다면 무시 (5분 내)
    const existing = this.sessions.get(visitorId);
    if (existing && (existing.status.includes('중') || existing.status === 'launching_browser') && Date.now() - existing.lastUpdated < 600000) {
       return;
    }

    this.sessions.set(visitorId, { 
      visitorId, 
      status: '휴대폰 로그인 초기화 중...', 
      screenshot: null, 
      lastUpdated: Date.now() 
    });

    // 백그라운드에서 실행
    runPhoneLoginAgent({
      accountName: visitorId,
      name: details.name,
      birthday: details.birthday,
      phone: details.phone,
      headless: true,
      onScreenshot: (base64: string) => {
        const session = this.sessions.get(visitorId);
        if (session) {
          session.screenshot = base64;
          session.lastUpdated = Date.now();
        }
      },
      onStatus: (msg: string) => {
        const session = this.sessions.get(visitorId);
        if (session) {
          session.status = msg;
          session.lastUpdated = Date.now();
        }
      }
    }).then(() => {
      const session = this.sessions.get(visitorId);
      if (session) {
        session.status = 'success';
        session.screenshot = null;
        session.lastUpdated = Date.now();
      }
    }).catch((err: any) => {
      logger.error(`[TossLoginService] Phone Login failed for ${visitorId}:`, err);
      const session = this.sessions.get(visitorId);
      if (session) {
        session.status = 'failed';
        session.error = String(err);
        session.lastUpdated = Date.now();
      }
    });
  }

  getSession(visitorId: string): LoginSession | null {
    return this.sessions.get(visitorId) || null;
  }

  async triggerQRSwitch(visitorId: string): Promise<boolean> {
    const { manualSwitchToQR } = await import('./toss-agent/login-agent');
    const session = this.sessions.get(visitorId);
    const updateStatus = (msg: string) => {
      if (session) {
        session.status = msg;
        session.lastUpdated = Date.now();
      }
    };
    return manualSwitchToQR(visitorId, updateStatus);
  }

  async triggerPhoneSwitch(visitorId: string): Promise<boolean> {
    const { manualSwitchToPhoneLogin } = await import('./toss-agent/login-agent');
    const session = this.sessions.get(visitorId);
    const updateStatus = (msg: string) => {
      if (session) {
        session.status = msg;
        session.lastUpdated = Date.now();
      }
    };
    return manualSwitchToPhoneLogin(visitorId, updateStatus);
  }

  clearSession(visitorId: string) {
    this.sessions.delete(visitorId);
  }
}

export const tossLoginService = new TossLoginService();
