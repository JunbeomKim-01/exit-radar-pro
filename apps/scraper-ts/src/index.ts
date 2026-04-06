/**
 * Scraper CLI — 로그인 또는 수집을 선택적으로 실행합니다.
 */

import dotenv from "dotenv";
import * as path from "path";

// 여러 경로의 .env 파일을 순차적으로 시도
dotenv.config(); // 1. 현재 작업 디렉토리 (.)
dotenv.config({ path: path.resolve(process.cwd(), ".env") }); // 2. 프로젝트 루트
dotenv.config({ path: path.resolve(__dirname, "../../.env") }); // 3. apps/scraper-ts/../../ (루트)
dotenv.config({ path: path.resolve(__dirname, "../../../api-ts/.env") }); // 4. 백엔드 .env 참조

const command = process.argv[2];

async function main() {
  switch (command) {
    case "login": {
      const { runLoginAgent } = await import("./login-agent");
      await runLoginAgent();
      break;
    }
    case "scrape": {
      const { CommunityScraper } = await import("./scraper");
      const { SessionManager } = await import("./session-manager");

      const ticker = process.argv[3] || "005930";
      const maxCount = parseInt(process.argv[4] || "20", 10);
      const jobId = process.argv[5] || null;
      const sessionName = process.argv[6] || "default";

      const sessionManager = new SessionManager();
      const session = await sessionManager.loadSession(sessionName);

      if (!session) {
        console.error("❌ 세션이 없습니다. 먼저 로그인하세요: npm run login");
        process.exit(1);
      }

      const scraper = new CommunityScraper();

      // 기존 게시글 ID 가져오기 (중복 제외용)
      let knownPostIds = new Set<string>();
      try {
        const res = await fetch(`http://localhost:3000/posts?ticker=${ticker}&limit=500`);
        if (res.ok) {
          const json: any = await res.json();
          const existingPosts = json?.data?.posts || [];
          for (const p of existingPosts) {
            // URL에서 postId 추출 (URL 형식: ...#postId)
            const hash = (p.url || "").split("#").pop();
            if (hash) knownPostIds.add(hash);
          }
          console.log(`📋 기존 게시글 ${knownPostIds.size}건 확인 (중복 제외 대상)`);
        }
      } catch {
        console.log("ℹ️ 기존 게시글 조회 실패 - 중복 포함하여 수집합니다");
      }

      const posts = await scraper.scrapeViaDom(session, ticker, maxCount, knownPostIds);
      console.log(`✅ ${posts.length}건 신규 수집 완료`);

      // 최신순 정렬 (createdAt 내림차순)
      posts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      // 날짜별 분류 요약
      const dateGroups: Record<string, number> = {};
      for (const p of posts) {
        const day = new Date(p.createdAt).toISOString().slice(0, 10);
        dateGroups[day] = (dateGroups[day] || 0) + 1;
      }
      console.log(`📊 날짜별 분류:`);
      Object.keys(dateGroups).sort().reverse().forEach(d => {
        console.log(`  ${d}: ${dateGroups[d]}건`);
      });
      if (posts.length > 0) {
        console.log(`📅 수집 범위: ${new Date(posts[posts.length-1].createdAt).toISOString().slice(0,10)} ~ ${new Date(posts[0].createdAt).toISOString().slice(0,10)}`);
      }

      try {
        console.log("🚀 API 서버로 데이터 전송 중...");
        
        if (posts.length === 0) {
          // 수집된 게시글이 없어도 작업 완료 처리를 위해 빈 데이터 전송
          await fetch("http://localhost:3000/crawl/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jobId, posts: [], isLastChunk: true }),
          });
          console.log("ℹ️ 신규 게시글이 없어 빈 결과로 작업을 종료합니다.");
        } else {
          // 일괄 처리 효율성 극대화: 25개씩 끊어서 전송 (사용자 요청에 따라 한 번에 대량 처리)
          const chunkSize = 25;
          for (let i = 0; i < posts.length; i += chunkSize) {
            const chunk = posts.slice(i, i + chunkSize);
            const isLastChunk = (i + chunkSize >= posts.length);
            
            const response = await fetch("http://localhost:3000/crawl/save", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ 
                jobId, 
                posts: chunk,
                isLastChunk 
              }),
            });
            
            if (!response.ok) {
              throw new Error(`API response error: ${response.status}`);
            }
            
            console.log(`✅ Chunk (${i + 1}~${Math.min(i + chunkSize, posts.length)}) 전송 완료 (마지막: ${isLastChunk})`);
          }
        }
        
        console.log("✨ 모든 데이터 통합 및 전송 프로세스 완료");
      } catch (err) {
        console.error("❌ API 전송 실패:", err);
      }
      
      break;
    }
    default:
      console.log("사용법:");
      console.log("  npm run dev -- login        로그인 및 세션 저장");
      console.log("  npm run dev -- scrape [종목코드] [최대건수]  게시글 수집");
      break;
  }
}

main().catch((err) => {
  console.error("오류 발생:", err);
  process.exit(1);
});
