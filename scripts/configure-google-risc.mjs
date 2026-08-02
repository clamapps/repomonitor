import "dotenv/config";

import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

import { importPKCS8, SignJWT } from "jose";

const MANAGEMENT_AUDIENCE =
  "https://risc.googleapis.com/google.identity.risc.v1beta.RiscManagementService";
const MANAGEMENT_ORIGIN = "https://risc.googleapis.com";
const PUSH_DELIVERY_METHOD =
  "https://schemas.openid.net/secevent/risc/delivery-method/push";
const EVENTS_REQUESTED = [
  "https://schemas.openid.net/secevent/oauth/event-type/token-revoked",
  "https://schemas.openid.net/secevent/oauth/event-type/tokens-revoked",
  "https://schemas.openid.net/secevent/risc/event-type/account-disabled",
  "https://schemas.openid.net/secevent/risc/event-type/account-credential-change-required",
  "https://schemas.openid.net/secevent/risc/event-type/verification",
];

function usage() {
  throw new Error(
    "Usage: pnpm google:risc:configure <service-account-key.json>",
  );
}

async function serviceAccountToken(credentialsPath) {
  const credentials = JSON.parse(await readFile(credentialsPath, "utf8"));
  if (
    typeof credentials.client_email !== "string" ||
    typeof credentials.private_key !== "string" ||
    typeof credentials.private_key_id !== "string"
  ) {
    throw new Error("The credentials file is not a service-account JSON key");
  }

  const key = await importPKCS8(credentials.private_key, "RS256");
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({
      alg: "RS256",
      kid: credentials.private_key_id,
      typ: "JWT",
    })
    .setIssuer(credentials.client_email)
    .setSubject(credentials.client_email)
    .setAudience(MANAGEMENT_AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);
}

async function googleRiscRequest(path, token, body) {
  const response = await fetch(`${MANAGEMENT_ORIGIN}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = (await response.text()).trim();
    throw new Error(
      `Google RISC API returned ${response.status}${detail ? `: ${detail}` : ""}`,
    );
  }
}

async function main() {
  const [credentialsPath, ...extra] = process.argv.slice(2);
  if (!credentialsPath || extra.length > 0) usage();

  const appUrl = new URL(process.env.APP_URL ?? "");
  if (appUrl.protocol !== "https:") {
    throw new Error("APP_URL must be the public HTTPS deployment URL");
  }
  const receiver = new URL("/api/google/risc", appUrl).href;
  const token = await serviceAccountToken(credentialsPath);

  await googleRiscRequest("/v1beta/stream:update", token, {
    delivery: {
      delivery_method: PUSH_DELIVERY_METHOD,
      url: receiver,
    },
    events_requested: EVENTS_REQUESTED,
  });
  await googleRiscRequest("/v1beta/stream:verify", token, {
    state: `repomonitor-${randomUUID()}`,
  });

  console.log(`Google Cross-Account Protection is configured for ${receiver}`);
  console.log("A verification event was requested from Google.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
