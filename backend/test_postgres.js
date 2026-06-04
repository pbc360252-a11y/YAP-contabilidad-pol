import { PrismaClient } from '@prisma/client'

const connectionString = "postgresql://postgres:lrR5xh-McJeWdIo4e2buuw_ubTtSCAn@db.wmctlrochqetbdktabkq.supabase.co:5432/postgres"

console.log("Testing connection to Supabase PostgreSQL...")
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: connectionString
    }
  }
})

async function run() {
  try {
    const result = await prisma.$queryRaw`SELECT 1 as result`
    console.log("✅ CONNECTION SUCCESSFUL!", result)
  } catch (err) {
    console.error("❌ CONNECTION FAILED:", err.message)
  } finally {
    await prisma.$disconnect()
  }
}

run()
