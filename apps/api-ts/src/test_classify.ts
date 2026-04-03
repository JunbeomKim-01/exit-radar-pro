import { classifyPost } from './services/classifier-client';
async function main() {
  console.log("Starting classifyPost test...");
  const res = await classifyPost({
    id: "test1",
    title: "test",
    body: "삼성전자 매수 가자",
    ticker: "005930"
  });
  console.log("Result:", res);
}
main();
