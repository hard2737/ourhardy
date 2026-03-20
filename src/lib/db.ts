import postgres from "postgres"

// Single shared connection — postgres.js handles serverless pooling
const sql = postgres(process.env.POSTGRES_URL!, {
  ssl: "require",
  max: 1,
})

export default sql
