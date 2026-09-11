import { isOwnerLoginEmail } from "./owner-login.ts";

export type LoginGate = "password" | "create" | "recover";

/** Existing seats type email + password on the first paint. No identify hop. */
export const INITIAL_LOGIN_GATE: LoginGate = "password";

export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function loginShowsPasswordField(gate: LoginGate, email: string): boolean {
  if (isOwnerLoginEmail(email)) return true;
  return gate === "password" || gate === "recover";
}

export function loginShowsCreateFields(gate: LoginGate, email: string): boolean {
  return gate === "create" && !isOwnerLoginEmail(email);
}

export function loginGateAfterProbe(input: {
  email: string;
  probe: "create" | "password";
  current: LoginGate;
}): LoginGate {
  if (isOwnerLoginEmail(input.email)) return input.current === "recover" ? "recover" : "password";
  if (input.current === "recover") return "recover";
  return input.probe;
}

export function loginSubmitLabel(gate: LoginGate, submitting: boolean): string {
  if (submitting) return "CHECKING SESSION";
  if (gate === "recover") return "RECOVER THE DESK";
  return "ENTER THE DESK";
}

export function mustChangeGateBlocks(input: {
  status: string;
  mustChangePassword?: boolean;
  released: boolean;
}): boolean {
  return input.status === "authenticated" && Boolean(input.mustChangePassword) && !input.released;
}
