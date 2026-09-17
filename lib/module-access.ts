import { isOwner, isProjectManager } from "./desk-role.ts";
import { hasPrivilege, type PrivilegeViewer } from "./privileges.ts";

export const CHANGE_ORDERS_PRIVILEGE = "change-orders" as const;
export const STC_ORDER_PRIVILEGE = "stc-order" as const;

export const ESTIMATE_WRITE_DENIED = "Estimate write is limited to Owner and Project Managers.";
export const CHANGE_ORDERS_DENIED = "Change Orders are limited to Owner and assigned seats.";
export const STC_ORDER_DENIED = "STC ordering is limited to Owner and assigned seats.";

export type ModuleAccessUser = PrivilegeViewer & {
  email?: string;
  role?: string;
  name?: string;
  jobTitle?: string;
};

/** Owner or Project Manager title / seat only. Not an assignable privilege. */
export function canEditEstimateWork(user?: ModuleAccessUser | null): boolean {
  if (!user) return false;
  if (isOwner(user)) return true;
  return isProjectManager(user);
}

/** Settings → Privileges → Change Orders. Owner always. Not blanket PM. */
export function canEditChangeOrders(user?: ModuleAccessUser | null): boolean {
  return hasPrivilege(user, CHANGE_ORDERS_PRIVILEGE);
}

/** Settings → Privileges → STC order. Owner always. Same pattern as Change Orders. */
export function canOrderStc(user?: ModuleAccessUser | null): boolean {
  return hasPrivilege(user, STC_ORDER_PRIVILEGE);
}

export function canTouchEstimatePack(user?: ModuleAccessUser | null): boolean {
  return canEditEstimateWork(user) || canEditChangeOrders(user) || canOrderStc(user);
}

/** PM site-access grants and GF → Tool Room windows. Owner always. */
export function canAssignSitePeople(user?: ModuleAccessUser | null): boolean {
  return canEditEstimateWork(user);
}
