import { Types } from "mongoose";
import { GmailConnection } from "@/models/GmailConnection";
import { encrypt, decrypt } from "@/lib/crypto";
import { refreshAccessToken, revokeToken, GmailAuthError } from "./oauth";

const EXPIRY_SKEW_MS = 60_000;

export async function getConnectionSummary(userId: Types.ObjectId) {
  const c = await GmailConnection.findOne({ userId }).lean();
  if (!c) return null;
  return {
    email: c.googleEmail,
    status: c.status,
    lastError: c.lastError ?? null,
    connectedAt: c.connectedAt?.toISOString() ?? null,
    scopes: c.scopes,
  };
}

export async function markConnection(userId: Types.ObjectId, status: "connected" | "revoked" | "error", lastError: string | null) {
  await GmailConnection.updateOne({ userId }, { $set: { status, lastError, lastErrorAt: lastError ? new Date() : undefined } });
}

/**
 * Returns a valid access token, refreshing it with the encrypted refresh token when needed.
 * Throws GmailAuthError("revoked") and flags the connection if Google no longer honours the grant.
 */
export async function getAccessToken(userId: Types.ObjectId): Promise<{ token: string; email: string }> {
  const conn = await GmailConnection.findOne({ userId }).select("+encRefreshToken +encAccessToken");
  if (!conn) throw new GmailAuthError("Gmail is not connected. Connect an account first.", "revoked");
  if (conn.status === "revoked") throw new GmailAuthError("Gmail access was revoked. Reconnect your account.", "revoked");

  if (conn.encAccessToken && conn.accessTokenExpiresAt && conn.accessTokenExpiresAt.getTime() - Date.now() > EXPIRY_SKEW_MS) {
    try {
      return { token: decrypt(conn.encAccessToken), email: conn.googleEmail };
    } catch {
      // fall through and refresh
    }
  }

  try {
    const refreshed = await refreshAccessToken(decrypt(conn.encRefreshToken));
    conn.encAccessToken = encrypt(refreshed.accessToken);
    conn.accessTokenExpiresAt = refreshed.expiresAt;
    conn.status = "connected";
    conn.lastError = null;
    await conn.save();
    return { token: refreshed.accessToken, email: conn.googleEmail };
  } catch (err) {
    if (err instanceof GmailAuthError && err.kind === "revoked") {
      await markConnection(userId, "revoked", err.message);
    } else if (err instanceof GmailAuthError) {
      await markConnection(userId, "error", err.message);
    }
    throw err;
  }
}

export async function disconnectGmail(userId: Types.ObjectId): Promise<boolean> {
  const conn = await GmailConnection.findOne({ userId }).select("+encRefreshToken");
  if (!conn) return false;
  try {
    await revokeToken(decrypt(conn.encRefreshToken));
  } catch {
    // ignore: we still delete our copy
  }
  await conn.deleteOne();
  return true;
}
