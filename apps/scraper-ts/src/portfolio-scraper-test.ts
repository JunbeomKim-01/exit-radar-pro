import { chromium } from "playwright";
import * as fs from "fs";
import * as crypto from "crypto";

async function testPortfolioScrape() {
  const sessionPath = "/Users/kimjunbeom/Documents/FM/sessions/default.session.json";
  let sessionRaw = fs.readFileSync(sessionPath, "utf8");
  
  const encryptionKey = process.env.SESSION_ENCRYPTION_KEY || null;
  let raw = sessionRaw;
  
  if (sessionRaw.includes(":") && encryptionKey) {
    const [ivHex, encrypted] = sessionRaw.split(":");
    const iv = Buffer.from(ivHex, "hex");
    const key = Buffer.from(encryptionKey.padEnd(32, "0").slice(0, 32));
    const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    raw = decrypted;
  }
  
  let session = JSON.parse(raw);
  console.log("Loaded Session. Starting browser...");

  const browser = await chromium.launch({ headless: false }); 
  const context = await browser.newContext();

  if (session.cookies) await context.addCookies(session.cookies);
  if (session.localStorage) {
    await context.addInitScript((storage: any) => {
      for (const [key, value] of Object.entries(storage)) {
        try { (window as any).localStorage.setItem(key, value as string); } catch {}
      }
    }, session.localStorage);
  }

  const page = await context.newPage();
  
  const interceptedData: any[] = [];

  page.on('response', async (response) => {
    const url = response.url();
    // 토스증권 API 중에서 자산/보유종목과 다소 연관있어보이는 URL 키워드 수집
    if (url.includes('/api/') && (url.includes('asset') || url.includes('portfolio') || url.includes('holding') || url.includes('balance') || url.includes('home'))) {
       try {
          const contentType = response.headers()['content-type'];
          if (contentType && contentType.includes('application/json')) {
            const body = await response.json();
            interceptedData.push({ url, status: response.status(), data: body });
          }
       } catch (e) {
          // ignore parsing errors
       }
    }
  });

  console.log("Navigating to https://www.tossinvest.com/ ...");
  await page.goto("https://www.tossinvest.com/", { waitUntil: "domcontentloaded", timeout: 20_000 }).catch(e => console.log("Timeout"));
  
  console.log("Waiting 15s to capture all API calls.");
  await page.waitForTimeout(15000);

  // '내 자산' 탭을 강제로 누르는 시도 (혹시 탭 메뉴가 DOM에 있다면)
  try {
     const myAssetTab = await page.$('text=내 자산');
     if (myAssetTab) {
        console.log("Found '내 자산' tab, clicking...");
        await myAssetTab.click();
        await page.waitForTimeout(10000); // 탭 누르고 10초 대기
     } else {
        const assetTab2 = await page.$('text=자산');
        if (assetTab2) {
           console.log("Found '자산' tab, clicking...");
           await assetTab2.click();
           await page.waitForTimeout(10000);
        }
     }
  } catch(e) { console.log(e); }

  fs.writeFileSync("api-intercept-dump.json", JSON.stringify(interceptedData, null, 2), "utf8");
  console.log("Dumped API responses to api-intercept-dump.json");
  await browser.close();
}

require("dotenv").config({ path: "../../.env" });
testPortfolioScrape().catch(console.error);
