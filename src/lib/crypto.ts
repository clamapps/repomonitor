import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import { config } from "@/lib/config";

function encryptionKey(): Buffer {
  const raw = config().ENCRYPTION_KEY;
  const decoded = Buffer.from(raw, "base64");
  if (decoded.length === 32) return decoded;

  if (/^[a-f0-9]{64}$/i.test(raw)) {
    return Buffer.from(raw, "hex");
  }

  throw new Error("ENCRYPTION_KEY must be 32 bytes encoded as base64 or hex");
}

export function encryptSecret(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted]
    .map((part) => part.toString("base64url"))
    .join(".");
}

export function decryptSecret(value: string): string {
  const [ivEncoded, tagEncoded, dataEncoded] = value.split(".");
  if (!ivEncoded || !tagEncoded || !dataEncoded) {
    throw new Error("Encrypted value has an invalid format");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivEncoded, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagEncoded, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataEncoded, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function hashToken(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function signState(payload: Record<string, unknown>): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", config().SESSION_SECRET)
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifyState<T>(value: string): T | null {
  const [encoded, signature] = value.split(".");
  if (!encoded || !signature) return null;

  const expected = createHmac("sha256", config().SESSION_SECRET)
    .update(encoded)
    .digest();
  const received = Buffer.from(signature, "base64url");
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}
