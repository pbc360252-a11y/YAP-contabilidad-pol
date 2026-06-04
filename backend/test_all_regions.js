import { PrismaClient } from '@prisma/client'

const regions = [
  "us-east-1",
  "us-east-2",
  "us-west-1",
  "us-west-2",
  "sa-east-1",
  "eu-west-1",
  "eu-west-2",
  "eu-central-1",
  "ap-southeast-1",
  "ap-southeast-2"
]

const projectRef = "wmctlrochqetbdktabkq"
const password = "lrR5xh-McJeWdIo4e2buuw_ubTtSCAn"

async function testRegion(region) {
  const host = `aws-0-${region}.pooler.supabase.com`
  const url = `postgresql://postgres.${projectRef}:${password}@${host}:6543/postgres?pgbouncer=true&connection_limit=1`
  
  console.log(`Testing region: ${region} (${host})...`)
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: url
      }
    }
  })
  
  try {
    const start = Date.now()
    const result = await Promise.race([
      prisma.$queryRaw`SELECT 1 as res`,
      new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout after 5s")), 5000))
    ])
    console.log(`  ✅ SUCCESS in ${region}! result:`, result)
    return { region, success: true }
  } catch (err) {
    console.log(`  ❌ FAILED in ${region}: ${err.message}`)
    return { region, success: false, error: err.message }
  } finally {
    await prisma.$disconnect()
  }
}

async function run() {
  console.log("Starting regional connection sweep...")
  for (const r of regions) {
    const res = await testRegion(r)
    if (res.success) {
      console.log(`\n🎉 Found active database connection in region: ${res.region}!`)
      process.exit(0)
    }
  }
  console.log("\n❌ All regions failed. The password might be different, or the project is in a region not listed.")
}

run()
