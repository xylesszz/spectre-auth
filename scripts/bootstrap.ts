import { PrismaClient } from '@prisma/client';
import 'dotenv/config';

const prisma = new PrismaClient();

async function main() {
  // 1. Verifica se já existe algum admin
  const existing = await prisma.admin.findFirst();
  if (existing) {
    console.log('✅ Admin already exists. Skipping creation.');
    return;
  }

  // 2. Cria um registro admin (não é usado para autenticação por senha, apenas para associar sessões)
  await prisma.admin.create({
    data: {
      email: 'admin@spectre.local',    // email fictício – não usado para login
      passwordHash: 'unused',           // não usado – o login é via ADMIN_KEY
    },
  });

  console.log('✅ Admin created successfully.');
  console.log('ℹ️  Use ADMIN_KEY from .env to log in.');
}

main()
  .catch((e) => {
    console.error('❌ Bootstrap failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });