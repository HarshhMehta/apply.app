import mongoose from "mongoose";
import { json } from "@/lib/http";
import { connectDB } from "@/lib/db";

export async function GET() {
  try {
    await connectDB();
    return json({ ok: true, db: mongoose.connection.readyState === 1 });
  } catch {
    return json({ ok: false, db: false }, { status: 503 });
  }
}
