import { defineConfig } from "prisma/config";

try {
  process.loadEnvFile();
} catch {
  // .env is optional: DATABASE_URL may come from the environment.
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
