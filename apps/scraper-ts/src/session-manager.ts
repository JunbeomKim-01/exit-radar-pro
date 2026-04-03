/**
 * Session Manager — 세션 파일의 저장, 로드, 유효성 검증을 담당합니다.
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { createLogger } from "./logger";

const logger = createLogger("session-manager");

export interface SessionData {
  accountName: string;
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    expires?: number;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: "Strict" | "Lax" | "None";
  }>;
  localStorage?: Record<string, string>;
  savedAt: string;
  expiresAt?: string;
}

export class SessionManager {
  private sessionDir: string;
  private encryptionKey: string | null;

  constructor() {
    // __dirname 기준으로 프로젝트 루트의 sessions 폴더를 항상 가리키도록 설정
    this.sessionDir = process.env.SESSION_DIR || path.resolve(__dirname, "../../../sessions");
    this.encryptionKey = process.env.SESSION_ENCRYPTION_KEY || null;

    if (!fs.existsSync(this.sessionDir)) {
      fs.mkdirSync(this.sessionDir, { recursive: true });
      logger.info(`세션 디렉터리 생성: ${this.sessionDir}`);
    }
  }

  private getSessionPath(accountName: string): string {
    return path.join(this.sessionDir, `${accountName}.session.json`);
  }

  private encrypt(data: string): string {
    if (!this.encryptionKey) return data;

    const iv = crypto.randomBytes(16);
    const key = Buffer.from(this.encryptionKey.padEnd(32, "0").slice(0, 32));
    const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
    let encrypted = cipher.update(data, "utf8", "hex");
    encrypted += cipher.final("hex");
    return iv.toString("hex") + ":" + encrypted;
  }

  private decrypt(data: string): string {
    if (!this.encryptionKey) return data;

    const [ivHex, encrypted] = data.split(":");
    const iv = Buffer.from(ivHex, "hex");
    const key = Buffer.from(this.encryptionKey.padEnd(32, "0").slice(0, 32));
    const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  }

  async saveSession(session: SessionData): Promise<void> {
    const filePath = this.getSessionPath(session.accountName);
    const raw = JSON.stringify(session, null, 2);
    const content = this.encrypt(raw);
    fs.writeFileSync(filePath, content, "utf8");
    logger.info(`세션 저장 완료: ${session.accountName}`);
  }

  async loadSession(accountName: string = "default"): Promise<SessionData | null> {
    const filePath = this.getSessionPath(accountName);

    if (!fs.existsSync(filePath)) {
      logger.warn(`세션 파일 없음: ${accountName}`);
      return null;
    }

    try {
      const content = fs.readFileSync(filePath, "utf8");
      const raw = this.decrypt(content);
      const session: SessionData = JSON.parse(raw);

      // 만료 체크
      if (session.expiresAt && new Date(session.expiresAt) < new Date()) {
        logger.warn(`세션 만료됨: ${accountName} (만료 시각: ${session.expiresAt})`);
        return null;
      }

      logger.info(`세션 로드 완료: ${accountName}`);
      return session;
    } catch (err) {
      logger.error(`세션 로드 실패: ${accountName}`, err);
      return null;
    }
  }

  async isSessionValid(accountName: string = "default"): Promise<boolean> {
    const session = await this.loadSession(accountName);
    if (!session) return false;

    // 쿠키 존재 여부 확인
    if (!session.cookies || session.cookies.length === 0) {
      logger.warn(`세션에 쿠키가 없음: ${accountName}`);
      return false;
    }

    return true;
  }

  async deleteSession(accountName: string = "default"): Promise<void> {
    const filePath = this.getSessionPath(accountName);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      logger.info(`세션 삭제: ${accountName}`);
    }
  }

  listSessions(): string[] {
    const files = fs.readdirSync(this.sessionDir);
    return files
      .filter((f) => f.endsWith(".session.json"))
      .map((f) => f.replace(".session.json", ""));
  }
}
