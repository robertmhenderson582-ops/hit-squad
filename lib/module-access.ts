import {
  companyHasModule,
  type Company,
  type CompanyModuleKey,
} from "./companies.ts";
import { isOwner, isProjectManager } from "./desk-role.ts";
import { hasPrivilege, type PrivilegeViewer } from "./privileges.ts";

export const CHANGE_ORDERS_PRIVILEGE = "change-orders" as const;
export const STC_ORDER_PRIVILEGE = "stc-order" as const;

export const ESTIMATE_WRITE_DENIED = "Estimate write is limited to Owner and Project Managers.";
export const CHANGE_ORDERS_DENIED = "Change Orders are limited to Owner and assigned seats.";
export const STC_ORDER_DENIED = "STC ordering is limited to Owner and assigned seats.";
export const DISPATCH_DENIED = "Dispatch / Control Center is off for this company.";
export const JOBS_DENIED = "Jobs is off for this company.";
export const QUALITY_DENIED = "Quality is off for this company.";
export const HSE_DENIED = "HSE is off for this company.";
export const ACCOUNTING_DENIED = "Accounting is off for this company.";

export const COMPANY_MODULE_DENIED: Record<CompanyModuleKey, string> = {
  jobs: JOBS_DENIED,
  quality: QUALITY_DENIED,
  hse: HSE_DENIED,
  accounting: ACCOUNTING_DENIED,
  dispatch: DISPATCH_DENIED,
};

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

/**
 * Per-company Home dock flags.
 * Missing vault fields stay on (Madison continuity). Explicit `false` hides that
 * company's Home tile. Owner session may still open the matching route for support
 * — use `canOpenCompanyModule` / `canOpenDispatchModule` for the ACL.
 */
export function companyModuleEnabled(
  company: Pick<Company, "modules"> | null | undefined,
  key: CompanyModuleKey,
): boolean {
  return companyHasModule(company, key);
}

export function companyDispatchEnabled(company?: Pick<Company, "modules"> | null): boolean {
  return companyModuleEnabled(company, "dispatch");
}

export function canSeeCompanyModule(
  _user: ModuleAccessUser | null | undefined,
  company: Pick<Company, "modules"> | null | undefined,
  key: CompanyModuleKey,
): boolean {
  return companyModuleEnabled(company, key);
}

export function canSeeCompanyDispatch(
  user?: ModuleAccessUser | null,
  company?: Pick<Company, "modules"> | null,
): boolean {
  return canSeeCompanyModule(user, company, "dispatch");
}

/** Owner (real session) can still reach the module. Company seats follow the flag. */
export function canOpenCompanyModule(
  session: ModuleAccessUser | null | undefined,
  company: Pick<Company, "modules"> | null | undefined,
  key: CompanyModuleKey,
): boolean {
  if (!session) return false;
  if (isOwner(session)) return true;
  return companyModuleEnabled(company, key);
}

export function canOpenDispatchModule(
  session?: ModuleAccessUser | null,
  company?: Pick<Company, "modules"> | null,
): boolean {
  return canOpenCompanyModule(session, company, "dispatch");
}

export function companyModuleDenied(key: CompanyModuleKey): string {
  return COMPANY_MODULE_DENIED[key];
}
