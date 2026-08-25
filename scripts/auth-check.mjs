import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const PORT = Number(process.env.AUTH_CHECK_PORT || 3456);
const BASE = `http://127.0.0.1:${PORT}`;
const EMAIL = process.env.OWNER_EMAIL || "robertmhenderson582@gmail.com";
const NOVUS_EMAIL = "robertmhenderson582+novus@gmail.com";
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

  const novusBlocked = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: NOVUS_EMAIL,
      password: "definitely-wrong-password",
      acknowledged: true,
    }),
  });
  const novusBlockedBody = await novusBlocked.json();
  assert(novusBlocked.status === 401, `Novus without an issued password should be 401, got ${novusBlocked.status}`);
  assert(typeof novusBlockedBody.error === "string", "Novus blocked login must return JSON error");
  assert(!novusBlocked.headers.get("set-cookie")?.includes("hs_session="), "Novus blocked login must not set hs_session");

  const seats = await fetch(`${BASE}/api/desk/seats`, { headers: { cookie }, cache: "no-store" });
  const seatsBody = await seats.json();
  assert(seats.status === 200, "Owner can list build seats");
  assert(
    (seatsBody.seats ?? []).some((row) => row.email === NOVUS_EMAIL && row.role === "operator" && row.name === "Novus"),
    "Novus operator row must exist",
  );
  assert(
    (seatsBody.seats ?? []).filter((row) => row.role === "owner").length === 1,
    "Robert remains the only owner",
  );

  const roster = await fetch(`${BASE}/api/desk/roster`, { headers: { cookie }, cache: "no-store" });
  const rosterBody = await roster.json();
  assert(roster.status === 200, "Owner can read the visual roster");
  assert(
    !(rosterBody.roster ?? []).some((row) => String(row.email || "").toLowerCase() === NOVUS_EMAIL),
    "Testers must never see Novus on the visual roster",
  );

  const issued = `check-${randomBytes(8).toString("hex")}-desk`;
  const issue = await fetch(`${BASE}/api/desk/seats`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ email: NOVUS_EMAIL, password: issued }),
  });
  const issueBody = await issue.json();
  assert(issue.status === 200, `Owner can issue Novus password, got ${issue.status}`);
  assert(issueBody.ok === true, "Issue password must not send mail");

  const novusLogin = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: NOVUS_EMAIL,
      password: issued,
      acknowledged: true,
    }),
  });
  const novusLoginBody = await novusLogin.json();
  const novusCookie = cookieHeader(novusLogin.headers.get("set-cookie"));
  assert(novusLogin.status === 200, `Novus login after issue should be 200, got ${novusLogin.status}`);
  assert(novusLoginBody.user?.role === "operator", "Novus must be operator, not owner");
  assert(novusLoginBody.user?.name === "Novus", "Novus display name");
  assert(novusLoginBody.user?.mustChangePassword === true, "Issued seat must change password before the desk");
  assert(novusCookie.includes("hs_session="), "Novus login sets hs_session");

  const novusSession = await fetch(`${BASE}/api/auth/session`, {
    headers: { cookie: novusCookie },
    cache: "no-store",
  });
  const novusSessionBody = await novusSession.json();
  assert(novusSession.status === 200, "Novus get-session should be 200");
  assert(novusSessionBody.user?.mustChangePassword === true, "Session must still carry mustChangePassword");

  const changed = `next-${randomBytes(8).toString("hex")}-desk`;
  const change = await fetch(`${BASE}/api/desk/password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: novusCookie },
    body: JSON.stringify({ next: changed }),
  });
  const changeBody = await change.json();
  assert(change.status === 200, "First-login password change should succeed");
  assert(changeBody.user?.mustChangePassword === false, "Flag clears after the first change");

  const afterChange = await fetch(`${BASE}/api/auth/session`, {
    headers: { cookie: cookieHeader(change.headers.get("set-cookie")) || novusCookie },
    cache: "no-store",
  });
  const afterChangeBody = await afterChange.json();
  assert(afterChangeBody.user?.mustChangePassword === false, "Await session after password change");

  console.log("AUTH CHECK PASSED");
  console.log("- wrong password stays 401 with a visible error");
  console.log("- email sign-in sets a first-party HttpOnly SameSite=Lax cookie");
  console.log("- get-session returns the user after login and again on refresh");
  console.log("- desk jobs stay scoped to the signed-in owner");
  console.log("- Novus is an operator seat; testers never see it; first login must change password");
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
