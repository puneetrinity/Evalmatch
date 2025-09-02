import { defineConfig } from "drizzle-kit";

// In CI/test environments, we might not have DATABASE_URL at config parsing time
// but it will be provided at runtime. Only throw in production if missing.
const databaseUrl = process.env.DATABASE_URL || "postgresql://test_user:test_password@localhost:5432/evalmatch_test";

if (!process.env.DATABASE_URL && process.env.NODE_ENV === "production") {
  throw new Error("DATABASE_URL is required in production");
}

export default defineConfig({
  out: "./server/migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
});
