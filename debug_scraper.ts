import { CommunityScraper } from "./apps/scraper-ts/src/scraper";
import { SessionManager } from "./apps/scraper-ts/src/session-manager";

async function check() {
  const sm = new SessionManager();
  const session = await sm.loadSession("6448208c-0e6b-43a6-8468-e9c4155074e1");
  if (!session) return console.log("No session");

  const scraper = new CommunityScraper();
  const posts = await scraper.scrapeViaDom(session, "005930", 2);
  console.log("PARSED POSTS:");
  posts.forEach(p => {
    console.log(`Author: [${p.author}] | Time: [${p.createdAt}] | Body: [${p.body.slice(0, 30)}...]`);
    if ((p as any).identityTag) {
        console.log(`  Tag: [${(p as any).identityTag}]`);
    }
  });
}

check();
