import { createLogger } from './logger';
const logger = createLogger('test');

async function main() {
  logger.info("Starting fetch...");
  try {
    const res = await fetch("http://127.0.0.1:8001/classify/post", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "test2",
        title: "test",
        body: "삼성 가즈아",
        ticker: "005930"
      })
    });
    logger.info("Fetch status: " + res.status);
    const json = await res.json();
    logger.info("JSON: " + JSON.stringify(json));
  } catch (err) {
    logger.error("Fetch error", err);
  }
}
main();
