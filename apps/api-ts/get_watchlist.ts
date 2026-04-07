import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const watchlist = await prisma.watchlist.findMany({
    select: { ticker: true }
  });
  console.log("Watchlist Tickers:", watchlist.map(w => w.ticker).join(", "));
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
