import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  STANDALONE_ID,
  STANDALONE_NAME,
  assignedCompaniesForId,
  companyDeskLogoSrc,
  companyIdFromName,
  companyLogoSrc,
  isCompanyId,
  isRetiredPeerCompany,
  isRetiredPeerCompanyName,
  isStandaloneId,
  mergeCompanies,
  seedCompanyForEmail,
  validateCompanyLogoInput,
  canSeeCompany,
  type Company,
  type CompanyId,
  type CompanyScope,
} from "./companies.ts";
import {
  divisionKey,
  divisionOverlay,
  hydrateDivision,
  mergeDivisions,
  parseDivisionCode,
  parseDivisionName,
  uniqueDivisionId,
  WOOD_RIVER_MOLD_ID,
  type Division,
} from "./divisions.ts";
import { COMPANIES_VAULT_KIND, COMPANIES_VAULT_NAME, readVaultJson, writeVaultJson } from "./drive-data.ts";
import { driveAdapter, type DriveAdapter } from "./drive-estimates.ts";

export type AssignmentFile = {
  assignments: Record<string, CompanyId>;
  companies?: Company[];
  divisions?: Division[];
  removedDivisionKeys?: string[];
};

let memoryOverride: AssignmentFile | null = null;
let hydrated = false;
let injectedAdapter: DriveAdapter | null | undefined;

export function companyAssignmentPath(): string {
  if (process.env.COMPANY_ASSIGNMENT_PATH) return process.env.COMPANY_ASSIGNMENT_PATH;
  if (process.env.VERCEL) return "/tmp/hit-squad-companies.json";
  return join(process.cwd(), "data", "company-assignments.json");
}

export function parseAssignmentFile(raw: unknown): AssignmentFile {
  const parsed = raw && typeof raw === "object" ? (raw as AssignmentFile) : { assignments: {}, companies: [] };
  const assignments: Record<string, CompanyId> = {};
  for (const [email, id] of Object.entries(parsed.assignments ?? {})) {
    if (isCompanyId(id)) assignments[email.toLowerCase()] = id;
  }
  const companies: Company[] = [];
  for (const row of parsed.companies ?? []) {
    if (row && isCompanyId(row.id) && typeof row.name === "string" && row.name.trim()) {
      if (isRetiredPeerCompany(row.id) || isRetiredPeerCompanyName(row.name)) continue;
      const logo = companyLogoSrc(typeof row.logo === "string" ? row.logo : null);
      companies.push({
        id: row.id,
        name: row.name.trim(),
        ...(logo ? { logo } : {}),
      });
    }
  }
  const divisions: Division[] = [];
  for (const row of parsed.divisions ?? []) {
    const next = hydrateDivision(row);
    if (next) divisions.push(divisionOverlay(next));
  }
  const removedDivisionKeys = [
    ...new Set(
      (parsed.removedDivisionKeys ?? [])
        .map((key) => (typeof key === "string" ? key.trim() : ""))
        .filter(Boolean),
    ),
  ];
  return { assignments, companies, divisions, removedDivisionKeys };
}

function emptyFile(): AssignmentFile {
  return { assignments: {}, companies: [], divisions: [], removedDivisionKeys: [] };
}

function hasDeskData(data: AssignmentFile) {
  return (
    Object.keys(data.assignments).length > 0 ||
    (data.companies?.length ?? 0) > 0 ||
    (data.divisions?.length ?? 0) > 0 ||
    (data.removedDivisionKeys?.length ?? 0) > 0
  );
}

function cloneFile(data: AssignmentFile): AssignmentFile {
  return {
    assignments: { ...data.assignments },
    companies: [...(data.companies ?? [])],
    divisions: [...(data.divisions ?? [])],
    removedDivisionKeys: [...(data.removedDivisionKeys ?? [])],
  };
}

function readCache(): AssignmentFile {
  if (memoryOverride) {
    return cloneFile(memoryOverride);
  }
  try {
    return parseAssignmentFile(JSON.parse(readFileSync(companyAssignmentPath(), "utf8")));
  } catch {
    return emptyFile();
  }
}

function writeCache(data: AssignmentFile) {
  if (memoryOverride) {
    memoryOverride = cloneFile(data);
    return;
  }
  const path = companyAssignmentPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function resolveAdapter(): DriveAdapter | null {
  if (injectedAdapter !== undefined) return injectedAdapter;
  if (process.env.COMPANY_ASSIGNMENT_PATH) return null;
  const drive = driveAdapter();
  return drive.configured ? drive : null;
}

async function persist(data: AssignmentFile) {
  writeCache(data);
  const drive = resolveAdapter();
  if (drive) await writeVaultJson(drive, COMPANIES_VAULT_NAME, COMPANIES_VAULT_KIND, data);
}

export async function hydrateCompanyStore(): Promise<AssignmentFile> {
  if (memoryOverride) return readCache();
  const cache = readCache();
  const drive = resolveAdapter();
  if (drive) {
    try {
      const raw = await readVaultJson(drive, COMPANIES_VAULT_NAME, COMPANIES_VAULT_KIND);
      const vault = parseAssignmentFile(raw);
      if (hasDeskData(vault)) writeCache(vault);
      else if (hasDeskData(cache) && raw == null) {
        await writeVaultJson(drive, COMPANIES_VAULT_NAME, COMPANIES_VAULT_KIND, cache);
      } else if (raw != null) {
        writeCache(vault);
      }
    } catch {
      // Keep the local cache. A failed vault read must not wipe assignments.
    }
  }
  hydrated = true;
  return readCache();
}

export async function listCompanies(): Promise<Company[]> {
  return mergeCompanies((await hydrateCompanyStore()).companies);
}

export async function isKnownCompany(id: string): Promise<boolean> {
  if (id === STANDALONE_ID) return true;
  return (await listCompanies()).some((row) => row.id === id);
}

/** Persisted assignment, falling back to the seed. Changing this is the reverse of assign. */
export async function assignedCompany(email: string): Promise<CompanyId> {
  const key = email.trim().toLowerCase();
  const data = await hydrateCompanyStore();
  return data.assignments[key] ?? seedCompanyForEmail(key);
}

/** Local cache / seed only. Session GET must not wait on Drive for companyId. */
export function peekAssignedCompany(email: string): CompanyId {
  const key = email.trim().toLowerCase();
  return readCache().assignments[key] ?? seedCompanyForEmail(key);
}

/** Assigned companies for this email only — never the owner's full catalog. */
export async function assignedCompaniesForEmail(email: string): Promise<Company[]> {
  return assignedCompaniesForId(await assignedCompany(email), await listCompanies());
}

export async function companyDeskLogoForEmail(email: string): Promise<string | null> {
  return companyDeskLogoSrc(await assignedCompaniesForEmail(email));
}

export async function setAssignedCompany(email: string, companyId: CompanyId) {
  const data = await hydrateCompanyStore();
  data.assignments[email.trim().toLowerCase()] = companyId;
  await persist(data);
}

export async function setCompanyLogo(
  companyId: string,
  logoSrc: string | null,
): Promise<{ ok: true; company: Company } | { error: string }> {
  const id = companyId.trim();
  if (!isCompanyId(id) || isStandaloneId(id)) return { error: "Pick a company on this desk." };
  const current = (await listCompanies()).find((row) => row.id === id);
  if (!current) return { error: "Pick a company on this desk." };
  const checked = validateCompanyLogoInput(logoSrc);
  if ("error" in checked) return checked;
  const overlay: Company = { id: current.id, name: current.name };
  if (checked.logo) overlay.logo = checked.logo;
  const data = await hydrateCompanyStore();
  data.companies = [...(data.companies ?? []).filter((row) => row.id !== id), overlay];
  await persist(data);
  return { ok: true, company: overlay };
}

export async function addCompany(name: string): Promise<{ ok: true; company: Company } | { error: string }> {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (trimmed.length < 2) return { error: "Type a company name." };
  if (trimmed.length > 80) return { error: "That name is too long." };
  if (trimmed.toLowerCase() === STANDALONE_NAME.toLowerCase() || companyIdFromName(trimmed) === STANDALONE_ID) {
    return { error: "Standalone is a door, not a company." };
  }
  if (isRetiredPeerCompanyName(trimmed) || isRetiredPeerCompany(companyIdFromName(trimmed))) {
    return { error: "That company is not on this desk." };
  }
  const existing = await listCompanies();
  const sameName = existing.find((row) => row.name.toLowerCase() === trimmed.toLowerCase());
  if (sameName) return { ok: true, company: sameName };
  let id = companyIdFromName(trimmed);
  if (!isCompanyId(id) || isStandaloneId(id)) return { error: "Type a company name." };
  if (existing.some((row) => row.id === id)) {
    let n = 2;
    while (existing.some((row) => row.id === `${id}${n}`)) n += 1;
    id = `${id}${n}`;
  }
  const data = await hydrateCompanyStore();
  data.companies = [...(data.companies ?? []), { id, name: trimmed }];
  await persist(data);
  return { ok: true, company: { id, name: trimmed } };
}

export async function listDivisions(): Promise<Division[]> {
  const data = await hydrateCompanyStore();
  return mergeDivisions(data.divisions, data.removedDivisionKeys);
}

export async function listDivisionsForScope(scope?: CompanyScope | null): Promise<Division[]> {
  const rows = await listDivisions();
  return rows.filter((row) => canSeeCompany(scope, row.companyId));
}

export async function addDivision(
  companyId: string,
  name: string,
  code?: string | null,
): Promise<{ ok: true; division: Division } | { error: string }> {
  const id = companyId.trim();
  if (!isCompanyId(id) || isStandaloneId(id) || isRetiredPeerCompany(id)) {
    return { error: "Pick a company on this desk." };
  }
  const company = (await listCompanies()).find((row) => row.id === id);
  if (!company) return { error: "Pick a company on this desk." };
  const named = parseDivisionName(name);
  if ("error" in named) return named;
  const coded = parseDivisionCode(code);
  if ("error" in coded) return coded;
  const existing = await listDivisions();
  const sameName = existing.find(
    (row) => row.companyId === id && row.name.toLowerCase() === named.name.toLowerCase(),
  );
  if (sameName) return { ok: true, division: sameName };
  const next: Division = {
    id: uniqueDivisionId(named.name, existing, id),
    companyId: id,
    name: named.name,
    code: coded.code,
    mold: WOOD_RIVER_MOLD_ID,
  };
  const data = await hydrateCompanyStore();
  const key = divisionKey(next.companyId, next.id);
  data.removedDivisionKeys = (data.removedDivisionKeys ?? []).filter((row) => row !== key);
  data.divisions = [...(data.divisions ?? []).filter((row) => divisionKey(row.companyId, row.id) !== key), next];
  await persist(data);
  return { ok: true, division: next };
}

export async function renameDivision(
  companyId: string,
  divisionId: string,
  name: string,
  code?: string | null,
): Promise<{ ok: true; division: Division } | { error: string }> {
  const existing = (await listDivisions()).find((row) => row.companyId === companyId && row.id === divisionId);
  if (!existing) return { error: "Pick a division on this desk." };
  const named = parseDivisionName(name);
  if ("error" in named) return named;
  const coded = parseDivisionCode(code);
  if ("error" in coded) return coded;
  const clash = (await listDivisions()).find(
    (row) =>
      row.companyId === companyId &&
      row.id !== divisionId &&
      row.name.toLowerCase() === named.name.toLowerCase(),
  );
  if (clash) return { error: "That division is already on this company." };
  const next: Division = {
    ...existing,
    name: named.name,
    code: coded.code,
    mold: WOOD_RIVER_MOLD_ID,
  };
  const data = await hydrateCompanyStore();
  const key = divisionKey(next.companyId, next.id);
  data.removedDivisionKeys = (data.removedDivisionKeys ?? []).filter((row) => row !== key);
  data.divisions = [...(data.divisions ?? []).filter((row) => divisionKey(row.companyId, row.id) !== key), next];
  await persist(data);
  return { ok: true, division: next };
}

export async function removeDivision(
  companyId: string,
  divisionId: string,
): Promise<{ ok: true; divisionId: string } | { error: string }> {
  const existing = (await listDivisions()).find((row) => row.companyId === companyId && row.id === divisionId);
  if (!existing) return { error: "Pick a division on this desk." };
  const data = await hydrateCompanyStore();
  const key = divisionKey(companyId, divisionId);
  data.divisions = (data.divisions ?? []).filter((row) => divisionKey(row.companyId, row.id) !== key);
  data.removedDivisionKeys = [...new Set([...(data.removedDivisionKeys ?? []), key])];
  await persist(data);
  return { ok: true, divisionId };
}

export function resetCompanyAssignmentsForTests() {
  memoryOverride = null;
  hydrated = false;
  injectedAdapter = undefined;
  const path = companyAssignmentPath();
  if (process.env.COMPANY_ASSIGNMENT_PATH && existsSync(path)) {
    writeFileSync(path, JSON.stringify({ assignments: {}, companies: [] }, null, 2) + "\n", "utf8");
  }
}

export function forgetCompanyCacheForTests() {
  memoryOverride = null;
  hydrated = false;
  const path = companyAssignmentPath();
  if (existsSync(path)) unlinkSync(path);
}

export function useCompanyVaultForTests(adapter: DriveAdapter | null) {
  injectedAdapter = adapter;
  hydrated = false;
  memoryOverride = null;
}

export function useMemoryCompanyAssignments() {
  memoryOverride = { assignments: {}, companies: [], divisions: [], removedDivisionKeys: [] };
  hydrated = true;
  injectedAdapter = null;
}
