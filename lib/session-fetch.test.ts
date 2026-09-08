import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  AUTH_REQUEST_DEADLINE_MS,
  AUTH_TIMEOUT_ERROR,
  SESSION_LOAD_DEADLINE_MS,
  fetchJsonWithDeadline,
} from "./session-fetch.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("session fetch deadlines stay short enough to clear CHECKING SESSION", () => {
  assert.ok(SESSION_LOAD_DEADLINE_MS <= 4000);
  assert.ok(AUTH_REQUEST_DEADLINE_MS <= 8000);
  assert.ok(AUTH_REQUEST_DEADLINE_MS > SESSION_LOAD_DEADLINE_MS);
  const session = readFileSync(fileURLToPath(new URL("../components/SessionProvider.tsx", import.meta.url)), "utf8");
  const login = readFileSync(fileURLToPath(new URL("../components/LoginForm.tsx", import.meta.url)), "utf8");
  assert.match(session, /SESSION_LOAD_DEADLINE_MS/);
  assert.match(session, /AUTH_REQUEST_DEADLINE_MS/);
  assert.match(session, /catch \{\s*\/\/ Hung session GET/);
  assert.match(login, /finally \{\s*setSubmitting\(false\);/);
});

test("fetchJsonWithDeadline returns JSON before the deadline", async () => {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ user: { email: "ok@example.com" } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })) as typeof fetch;
  const result = await fetchJsonWithDeadline<{ user?: { email: string } }>("/api/auth/session", { method: "GET" }, 200);
  assert.equal(result.ok, true);
  assert.equal(result.data.user?.email, "ok@example.com");
});

test("fetchJsonWithDeadline throws a recoverable error when fetch hangs", async () => {
  globalThis.fetch = (() => new Promise(() => {})) as typeof fetch;
  const started = Date.now();
  await assert.rejects(() => fetchJsonWithDeadline("/api/auth/session", { method: "GET" }, 40), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.equal(error.message, AUTH_TIMEOUT_ERROR);
    return true;
  });
  assert.ok(Date.now() - started < 300, "hung fetch must abort within the deadline");
});
