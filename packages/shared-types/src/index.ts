// ─── Post ───
export interface Post {
  id: string;
  source: string;
  ticker: string | null;
  title: string;
  body: string;
  authorHash: string;
  createdAt: Date;
  url: string;
  rawJson?: string;
  insertedAt: Date;
}

// ─── Comment ───
export interface Comment {
  id: string;
  postId: string;
  body: string;
  authorHash: string;
  createdAt: Date;
  insertedAt: Date;
}

// ─── Sentiment ───
export type SentimentLabel = "support" | "criticize" | "neutral";

export interface SentimentResult {
  id: string;
  targetType: "post" | "comment";
  targetId: string;
  label: SentimentLabel;
  confidence: number;
  rationale: string;
  modelVersion: string;
  createdAt: Date;
}

export type WindowType = "1h" | "24h" | "7d";

export interface SentimentAggregate {
  id: string;
  ticker: string;
  windowType: WindowType;
  supportRatio: number;
  criticizeRatio: number;
  neutralRatio: number;
  postCount: number;
  computedAt: Date;
}

// ─── Classifier API ───
export interface ClassifyRequest {
  id: string;
  title: string;
  body: string;
  ticker?: string;
}

export interface ClassifyResponse {
  id: string;
  label: SentimentLabel;
  confidence: number;
  rationale: string;
}

// ─── Session ───
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

// ─── API Responses ───
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface CrawlJob {
  id: string;
  status: "pending" | "running" | "completed" | "failed";
  ticker?: string;
  postCount: number;
  startedAt: Date;
  completedAt?: Date;
  error?: string;
}
