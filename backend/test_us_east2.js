import { PrismaClient } from '@prisma/client'

// The database is in us-east-2 based on its IPv6 address
// Try different URL formats for the pooler
const projectRef = "wmctlrochqetbdktabkq"
const password = "lrR5xh-McJeWdIo4e2buuw_ubTtSCAn"
const region = "us-east-2"

const urls = [
  // Session mode with project-prefixed user
  `postgresql://postgres.${projectRef}:${password}@aws-0-${region}.pooler.supabase.com:5432/postgres`,
  // Transaction mode with project-prefixed user  
  `postgresql://postgres.${projectRef}:${password}@aws-0-${region}.pooler.supabase.com:6543/postgres`,
  // Session mode without prefix
  `postgresql://postgres:${password}@aws-0-${region}.pooler.supabase.com:5432/postgres`,
  // Direct IPv6 (might work from cloud)
  `postgresql://postgres:${password}@db.${projectRef}.supabase.co:5432/postgres`,
]

async function testUrl(url, label) {
  const masked = url.replace(password, '***')
  console.log(`\nTesting [${label}]: ${masked}`)
  const prisma = new PrismaClient({
    datasources: { db: { url } }
  })
  try {
    const result = await Promise.race([
      prisma.$queryRaw`SELECT 1 as res`,
      new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout 8s")), 8000))
    ])
    console.log(`  ✅ SUCCESS!`)
    return true
  } catch (err) {
    console.log(`  ❌ FAILED: ${err.message.substring(0, 120)}`)
    return false
  } finally {
    await prisma.$disconnect()
  }
}

async function run() {
  const labels = ["Session pooler (prefix)", "Txn pooler (prefix)", "Session (no prefix)", "Direct DB"]
  for (let i = 0; i < urls.length; i++) {
    const ok = await testUrl(urls[i], labels[i])
    if (ok) {
      console.log(`\n🎉 Working URL format: ${labels[i]}`)
      process.exit(0)
    }
  }
  console.log("\n❌ All connection formats failed.")
}

run()
