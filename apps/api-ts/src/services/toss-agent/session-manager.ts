import fs from "fs";
import path from "path";
import crypto from "crypto";
import { createLogger } from "../../logger";

const logger = createLogger("session-manager");

export interface TossSession {
  accountName: string;
  cookies: any[];
  localStorage: any;
  savedAt: string;
  expiresAt: string;
}

export class SessionManager {
  private sessionDir: string;
  private encryptionKey: string | null;

  constructor() {
    // __dirname 기준으로 프로젝트 루트의 sessions 폴더를 가리키거나 env 사용
    this.sessionDir = process.env.SESSION_DIR || path.resolve(__dirname, "../../../../../sessions");
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
    if (!this.encryptionKey || !data.includes(":")) return data;

    try {
      const [ivHex, encrypted] = data.split(":");
      const iv = Buffer.from(ivHex, "hex");
      const key = Buffer.from(this.encryptionKey.padEnd(32, "0").slice(0, 32));
      const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
      let decrypted = decipher.update(encrypted, "hex", "utf8");
      decrypted += decipher.final("utf8");
      return decrypted;
    } catch (e) {
      logger.error("Decryption failed (Check if encryption key is correct)", e);
      return data;
    }
  }

  async saveSession(session: TossSession): Promise<void> {
    const filePath = this.getSessionPath(session.accountName);
    const raw = JSON.stringify(session, null, 2);
    const content = this.encrypt(raw);
    fs.writeFileSync(filePath, content, "utf8");
    logger.info(`Session saved for ${session.accountName} at ${filePath} (Encrypted: ${!!this.encryptionKey})`);
  }

  async loadSession(accountName: string): Promise<TossSession | null> {
    const filePath = this.getSessionPath(accountName);

    if (!fs.existsSync(filePath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(filePath, "utf8");
      const raw = this.decrypt(content);
      const session: TossSession = JSON.parse(raw);

      // 만료 체크
      if (session.expiresAt && new Date(session.expiresAt) < new Date()) {
        logger.warn(`Session expired for ${accountName}`);
        return null;
      }

      return session;
    } catch (err) {
      logger.error(`Failed to load session for ${accountName}`, err);
      return null;
    }
  }

  async deleteSession(accountName: string): Promise<void> {
    const filePath = this.getSessionPath(accountName);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      logger.info(`Session deleted for ${accountName}`);
    }
  }
}
