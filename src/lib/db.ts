import mongoose from "mongoose";
import { env } from "./env";

type Cache = { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null };
const g = globalThis as unknown as { __mongoose?: Cache };
const cache: Cache = (g.__mongoose ??= { conn: null, promise: null });

/** Cached connection so hot reloads and serverless invocations reuse one pool. */
export async function connectDB(): Promise<typeof mongoose> {
  if (cache.conn && mongoose.connection.readyState === 1) return cache.conn;
  if (!cache.promise) {
    const { MONGODB_URI, MONGODB_DB_NAME } = env();
    mongoose.set("strictQuery", true);
    cache.promise = mongoose
      .connect(MONGODB_URI, {
        dbName: MONGODB_DB_NAME,
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 8000,
        autoIndex: true,
      })
      .catch((err) => {
        cache.promise = null;
        throw err;
      });
  }
  cache.conn = await cache.promise;
  return cache.conn;
}
