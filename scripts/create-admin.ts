/**
 * Creates (or resets the password of) the single administrator account.
 *
 *   npm run create-admin                      -> prompts for email + password (input hidden)
 *   ADMIN_EMAIL=me@x.com ADMIN_PASSWORD=... npm run create-admin   -> non-interactive (CI / first deploy)
 *
 * The password is hashed with bcrypt (cost 12). It is never written to disk or logged.
 */
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { createInterface } from "node:readline";
import { z } from "zod";

function loadEnv() {
  try {
    process.loadEnvFile(".env.local");
  } catch {}
  try {
    process.loadEnvFile(".env");
  } catch {}
}

function ask(question: string, hidden = false): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      const w = (rl as unknown as { _writeToOutput: (s: string) => void });
      w._writeToOutput = (s: string) => {
        if (s.includes(question)) process.stdout.write(s);
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(answer);
    });
  });
}

async function main() {
  loadEnv();
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set. Copy .env.example to .env and fill it in.");

  const email = z.string().trim().email().parse((process.env.ADMIN_EMAIL ?? (await ask("Admin email: "))).toLowerCase());
  const name = process.env.ADMIN_NAME ?? "";
  const password = process.env.ADMIN_PASSWORD ?? (await ask("Password (min 12 characters): ", true));
  if (password.length < 12) throw new Error("Password must be at least 12 characters.");
  if (!process.env.ADMIN_PASSWORD) {
    const again = await ask("Repeat password: ", true);
    if (again !== password) throw new Error("Passwords do not match.");
  }

  await mongoose.connect(uri, { dbName: process.env.MONGODB_DB_NAME || "job_application_automation", serverSelectionTimeoutMS: 8000 });
  const users = mongoose.connection.collection("users");
  const existingCount = await users.countDocuments();
  const existing = await users.findOne({ email });
  if (!existing && existingCount > 0 && process.env.ALLOW_SECOND_USER !== "1") {
    throw new Error("An administrator already exists. This app is single-user. Use that email to reset its password, or set ALLOW_SECOND_USER=1.");
  }
  const passwordHash = await bcrypt.hash(password, 12);
  const now = new Date();
  await users.updateOne({ email }, { $set: { passwordHash, ...(name ? { name } : {}), updatedAt: now }, $setOnInsert: { email, createdAt: now, __v: 0 } }, { upsert: true });
  console.log(existing ? `Password updated for ${email}.` : `Administrator ${email} created.`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(`\n✖ ${err.message}`);
  process.exit(1);
});
