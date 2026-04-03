/**
 * Classifier Client — Python 분류 서비스와 통신합니다.
 */

import { createLogger } from "../logger";
import axios from "axios";

const logger = createLogger("classifier-client");

const CLASSIFIER_URL =
  (process.env.CLASSIFIER_API_URL || "http://127.0.0.1:8001").replace("localhost", "127.0.0.1");

interface ClassifyRequest {
  id: string;
  title: string;
  body: string;
  ticker?: string;
}

interface ClassifyResponse {
  id: string;
  label: "support" | "criticize" | "neutral";
  confidence: number;
  rationale: string;
}

export interface SummarizeResponse {
  summary: string;
  alert_level: "info" | "warning" | "danger";
  key_points: string[];
}

/**
 * 단건 분류 요청
 */
export async function classifyPost(
  post: ClassifyRequest
): Promise<ClassifyResponse | null> {
  try {
    logger.info(`Sending fetch to ${CLASSIFIER_URL}/classify/post`);
    const response = await axios.post<ClassifyResponse>(
      `${CLASSIFIER_URL}/classify/post`,
      post,
      { headers: { "Content-Type": "application/json" }, timeout: 15000 }
    );
    logger.info(`Fetch resolved: ${response.status}`);

    const result = response.data;

    // 분류 결과를 DB에 저장
    const { prisma } = await import("../server");
    await prisma.sentimentResult.create({
      data: {
        targetType: "post",
        targetId: result.id,
        label: result.label,
        confidence: result.confidence,
        rationale: result.rationale,
        modelVersion: "llm-v1",
        postId: result.id,
      },
    });

    logger.info(
      `분류 완료: ${result.id} → ${result.label} (${(result.confidence * 100).toFixed(1)}%)`
    );
    return result;
  } catch (err) {
    logger.error(`분류 서비스 연결 실패:`, err);
    return null;
  }
}

/**
 * 배치 분류 요청
 */
export async function classifyBatch(
  posts: ClassifyRequest[]
): Promise<ClassifyResponse[]> {
  try {
    const response = await axios.post<{ results: ClassifyResponse[] }>(
      `${CLASSIFIER_URL}/classify/batch`,
      { items: posts },
      { headers: { "Content-Type": "application/json" }, timeout: 30000 }
    );

    const results = response.data;

    // 각 결과를 DB에 저장
    const { prisma } = await import("../server");
    for (const result of results.results) {
      await prisma.sentimentResult.create({
        data: {
          targetType: "post",
          targetId: result.id,
          label: result.label,
          confidence: result.confidence,
          rationale: result.rationale,
          modelVersion: "llm-v1",
          postId: result.id,
        },
      });
    }

    logger.info(`배치 분류 완료: ${results.results.length}건`);
    return results.results;
  } catch (err) {
    return [];
  }
}

/**
 * 게시글 요약 요청
 */
export async function summarizePosts(
  ticker: string,
  posts: Array<{ title: string; body: string }>
): Promise<SummarizeResponse | null> {
  try {
    const response = await axios.post<SummarizeResponse>(
      `${CLASSIFIER_URL}/summarize`,
      { ticker, posts },
      { headers: { "Content-Type": "application/json" }, timeout: 30000 }
    );

    return response.data;
  } catch (err) {
    logger.error(`요약 서비스 요청 실패 (ticker: ${ticker}):`, err);
    return null;
  }
}
