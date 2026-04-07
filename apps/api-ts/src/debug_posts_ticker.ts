
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("--- Post Table Ticker Distribution ---");
  const distribution = await prisma.post.groupBy({
    by: ['ticker'],
    _count: {
      id: true
    }
  });
  console.log(JSON.stringify(distribution, null, 2));

  console.log("\n--- Sample Posts ---");
  const samples = await prisma.post.findMany({
    take: 5,
    select: {
      ticker: true,
      title: true,
      authorName: true
    }
  });
  console.log(JSON.stringify(samples, null, 2));
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
