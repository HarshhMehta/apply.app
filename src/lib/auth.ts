import bcrypt from "bcryptjs";
import { User } from "@/models/User";
import { connectDB } from "./db";
import { getSessionUserId } from "./session";

const BCRYPT_COST = 12;
// Compared against when the email doesn't exist, so response time doesn't reveal valid accounts.
let dummyHash: string | null = null;
const getDummyHash = async () => (dummyHash ??= await bcrypt.hash("not-a-real-password", BCRYPT_COST));

export const hashPassword = (plain: string) => bcrypt.hash(plain, BCRYPT_COST);

export async function verifyCredentials(email: string, password: string) {
  await connectDB();
  const user = await User.findOne({ email: email.toLowerCase() }).select("+passwordHash");
  const ok = await bcrypt.compare(password, user?.passwordHash ?? (await getDummyHash()));
  if (!user || !ok) return null;
  user.lastLoginAt = new Date();
  await user.save();
  return user;
}

/** For server components/layouts: resolves the signed-in user or null. */
export async function getCurrentUser() {
  const id = await getSessionUserId();
  if (!id) return null;
  await connectDB();
  return User.findById(id).select("email name").lean();
}
