import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const PORT = Number(process.env.AUTH_CHECK_PORT || 3456);
const BASE = `http://127.0.0.1:${PORT}`;
const EMAIL = process.env.OWNER_EMAIL || "robertmhenderson582@gmail.com";
const PASSWORD = process.env.OWNER_PASSWORD;
const SECRET = process.env.AUTH_SECRET;

if (!PASSWORD || !SECRET) {
  console.error("OWNER_PASSWORD and AUTH_SECRET must be set (use --env-file=.env.local).");
  process.exit(1);
}

function cookieHeader(setCookie) {
  if (!setCookie) return "";
  const first = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  return first.split(";")[0];
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function waitForServer() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const response = await fetch(`${BASE}/login`, {
        redirect: "manual",
        signal: AbortSignal.timeout(2000),
      });
      if (response.ok || response.status === 307 || response.status === 308) return;
    } catch {
      // still booting
    }
    await delay(500);
  }
  throw new Error("Server did not become ready.");
}

async function runChecks() {
  const bad = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: EMAIL,
      password: "definitely-wrong-password",
      acknowledged: true,
    }),
  });
  const badBody = await bad.json();
  assert(bad.status === 401, `Wrong password should be 401, got ${bad.status}`);
  assert(typeof badBody.error === "string" && badBody.error.length > 0, "Wrong password must return a visible error");
  assert(!bad.headers.get("set-cookie")?.includes("hs_session="), "Wrong password must not set a session cookie");

  const noAck = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, acknowledged: false }),
  });
  assert(noAck.status === 400, "Acknowledgement must be required");

  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: EMAIL,
      password: PASSWORD,
      acknowledged: true,
    }),
  });
  const loginBody = await login.json();
  const setCookie = login.headers.get("set-cookie");
  assert(login.status === 200, `Login should be 200, got ${login.status}`);
  assert(loginBody.user?.email === EMAIL, "Login must return the owner user");
  assert(setCookie, "Login must Set-Cookie");
  assert(setCookie.includes("HttpOnly"), "Cookie must be HttpOnly");
  assert(/samesite=lax/i.test(setCookie), "Cookie must be SameSite=Lax");
  assert(setCookie.includes("hs_session="), "Cookie name must be first-party hs_session");

  const cookie = cookieHeader(setCookie);
  const session = await fetch(`${BASE}/api/auth/session`, {
    headers: { cookie },
    cache: "no-store",
  });
  const sessionBody = await session.json();
  assert(session.status === 200, "get-session should be 200");
  assert(sessionBody.user?.email === EMAIL, "get-session must return the user before the desk renders");
  assert(sessionBody.user?.id === "owner-robert-henderson", "Users must stay scoped to the seeded owner");

  const refresh = await fetch(`${BASE}/api/auth/session`, {
    headers: { cookie },
    cache: "no-store",
  });
  const refreshBody = await refresh.json();
  assert(refreshBody.user?.email === EMAIL, "Hard refresh must still be authenticated");

  const desk = await fetch(`${BASE}/api/desk/jobs`, {
    headers: { cookie },
    cache: "no-store",
  });
  const deskBody = await desk.json();
  assert(desk.status === 200, "Desk jobs should load for the signed-in owner");
  assert(deskBody.user.email === EMAIL, "Desk payload must not leak another user");
  assert(Array.isArray(deskBody.desk.jobs) && deskBody.desk.jobs.length > 0, "Desk should have owner jobs");

  const anonymous = await fetch(`${BASE}/api/auth/session`, { cache: "no-store" });
  const anonymousBody = await anonymous.json();
  assert(anonymousBody.user === null, "No cookie must not invent a session");

  const foreign = await fetch(`${BASE}/api/desk/jobs`, { cache: "no-store" });
  assert(foreign.status === 401, "Anonymous callers cannot read desk jobs");

  console.log("AUTH CHECK PASSED");
  console.log("- wrong password stays 401 with a visible error");
  console.log("- email sign-in sets a first-party HttpOnly SameSite=Lax cookie");
  console.log("- get-session returns the user after login and again on refresh");
  console.log("- desk jobs stay scoped to the signed-in owner");
}

async function main() {
  const nextBin = fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url));
  const child = spawn(process.execPath, [nextBin, "start", "--hostname", "127.0.0.1", "--port", String(PORT)], {
    env: {
      ...process.env,
      AUTH_COOKIE_SECURE: "false",
      PORT: String(PORT),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", (chunk) => process.stdout.write(chunk));
  child.stderr.on("data", (chunk) => process.stderr.write(chunk));

  try {
    await waitForServer();
    await runChecks();
  } finally {
    child.kill("SIGTERM");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
