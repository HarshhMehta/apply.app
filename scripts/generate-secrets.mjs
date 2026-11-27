// Prints fresh secrets for .env. Nothing is written to disk.
import { randomBytes } from "node:crypto";

console.log("# Paste these into your .env file\n");
console.log(`TOKEN_ENCRYPTION_KEY=${randomBytes(32).toString("base64")}`);
console.log(`SESSION_SECRET=${randomBytes(48).toString("base64url")}`);
