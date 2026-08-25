import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
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

  await rm("data/seat-secrets.json", { force: true });
  await rm("/tmp/hs-seat-secrets.json", { force: true });

  const blocked = await fetch(`${BASE}/api/auth/claim`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "jhenderson582@gmail.com",
      password: "not-a-real-invite-password",
      acknowledged: true,
    }),
  });
  assert(blocked.status === 401, "jhenderson582 must not be a seat");

  const james = await fetch(`${BASE}/api/auth/claim`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "jamescain@gmail.com",
      password: "not-a-real-invite-password",
      acknowledged: true,
    }),
  });
  assert(james.status === 401, "James Cain must not be a seat");

  const josephPassword = "joseph-field-trial-local";
  const josephClaim = await fetch(`${BASE}/api/auth/claim`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "josephmhenderson2002@gmail.com",
      password: josephPassword,
      acknowledged: true,
    }),
  });
  const josephClaimBody = await josephClaim.json();
  assert(josephClaim.status === 200, `Joseph claim should be 200, got ${josephClaim.status}`);
  assert(josephClaimBody.user?.email === "josephmhenderson2002@gmail.com", "Joseph claim must return Joseph");
  const josephCookie = cookieHeader(josephClaim.headers.get("set-cookie"));

  const josephLogin = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "josephmhenderson2002@gmail.com",
      password: josephPassword,
      acknowledged: true,
    }),
  });
  assert(josephLogin.status === 200, "Joseph must sign in after setting a password");

  const josephBoard = await fetch(`${BASE}/api/desk/board`, {
    headers: { cookie: josephCookie },
    cache: "no-store",
  });
  const josephBoardBody = await josephBoard.json();
  assert(josephBoard.status === 200, "Joseph can read the shared blotter");
  assert(!josephBoardBody.board.rates?.length, "Joseph must not receive rate-builder rows");

  const josephRoster = await fetch(`${BASE}/api/desk/roster`, {
    headers: { cookie: josephCookie },
    cache: "no-store",
  });
  assert(josephRoster.status === 403, "Joseph cannot open Users / other testers");

  const bennyPassword = "benny-field-trial-local";
  const bennyClaim = await fetch(`${BASE}/api/auth/claim`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "bccamp2@gmail.com",
      password: bennyPassword,
      acknowledged: true,
    }),
  });
  assert(bennyClaim.status === 200, "Benny claim should be 200");
  const bennyCookie = cookieHeader(bennyClaim.headers.get("set-cookie"));
  const bennyBoard = await fetch(`${BASE}/api/desk/board`, {
    headers: { cookie: bennyCookie },
    cache: "no-store",
  });
  const bennyBoardBody = await bennyBoard.json();
  const bennyDump = JSON.stringify(bennyBoardBody);
  assert(!/phillips\s*66/i.test(bennyDump), "Benny must not see Phillips 66");
  assert(!/\bP66\b/.test(bennyDump), "Benny must not see P66");
  assert(!/madison/i.test(bennyDump), "Benny must not see Madison");
  assert(!/wood river/i.test(bennyDump), "Benny must not see Wood River");

  const otherSeats = [
    ["Wlanderno@yahoo.com", "wendell-field-trial-local"],
    ["chancec318@yahoo.com", "chance-field-trial-local"],
    ["nathanboyte@gmail.com", "nathan-field-trial-local"],
    ["marks544@yahoo.com", "mark544-field-trial-local"],
    ["bstubby@aol.com", "bill-field-trial-local"],
  ];
  for (const [email, password] of otherSeats) {
    const claimed = await fetch(`${BASE}/api/auth/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, acknowledged: true }),
    });
    assert(claimed.status === 200, `${email} claim should be 200`);
    const signed = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, acknowledged: true }),
    });
    assert(signed.status === 200, `${email} must sign in after setting a password`);
  }

  const ownerRoster = await fetch(`${BASE}/api/desk/roster`, {
    headers: { cookie },
    cache: "no-store",
  });
  const ownerRosterBody = await ownerRoster.json();
  assert(ownerRoster.status === 200, "Owner can open Users");
  assert(ownerRosterBody.roster?.length === 7, "Owner roster must show the seven seats");
  const emails = ownerRosterBody.roster.map((row) => row.email);
  assert(emails.includes("josephmhenderson2002@gmail.com"), "Joseph seat must be listed");
  assert(!emails.some((item) => item.includes("jhenderson582")), "jhenderson582 must not be seeded");
  assert(!emails.some((item) => item.includes("james")), "James Cain must not be seeded");

  console.log("AUTH CHECK PASSED");
  console.log("- wrong password stays 401 with a visible error");
  console.log("- email sign-in sets a first-party HttpOnly SameSite=Lax cookie");
  console.log("- get-session returns the user after login and again on refresh");
  console.log("- desk jobs stay scoped to the signed-in owner");
  console.log("- seven invite seats; Joseph has no rates; Benny sees aliases only");
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
