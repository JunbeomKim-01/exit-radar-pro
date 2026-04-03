import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const posts = await prisma.post.findMany();
  console.log('Posts:', posts.length);
  const sentiments = await prisma.sentimentResult.findMany();
  console.log('Sentiments:', sentiments.length);
}
main().finally(() => prisma.$disconnect());
