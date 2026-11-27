import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 30000,
    env: {
      SESSION_SECRET: "test-session-secret-test-session-secret-0123456789",
      TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
      APP_URL: "http://localhost:3000",
      GOOGLE_CLIENT_ID: "test-client-id.apps.googleusercontent.com",
      GOOGLE_CLIENT_SECRET: "test-client-secret",
      GOOGLE_REDIRECT_URI: "http://localhost:3000/api/gmail/callback",
      MONGODB_URI: "mongodb://127.0.0.1:27017",
      MONGODB_DB_NAME: "jaa_test",
    },
  },
});
