import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  companyIdFromName,
  isCompanyId,
  mergeCompanies,
  seedCompanyForEmail,
  type Company,
  type CompanyId,
} from "./companies.ts";
import { COMPANIES_VAULT_KIND, COMPANIES_VAULT_NAME, readVaultJson, writeVaultJson } from "./drive-data.ts";
import { driveAdapter, type DriveAdapter } from "./drive-estimates.ts";

export type AssignmentFile = {
  assignments: Record<string, CompanyId>;
  companies?: Company[];
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
      companies.push({ id: row.id, name: row.name.trim() });
    }
  }
  return { assignments, companies };
}

function emptyFile(): AssignmentFile {
  return { assignments: {}, companies: [] };
}

function hasDeskData(data: AssignmentFile) {
  return Object.keys(data.assignments).length > 0 || (data.companies?.length ?? 0) > 0;
}

function readCache(): AssignmentFile {
  if (memoryOverride) {
    return {
      assignments: { ...memoryOverride.assignments },
      companies: [...(memoryOverride.companies ?? [])],
    };
  }
  try {
    return parseAssignmentFile(JSON.parse(readFileSync(companyAssignmentPath(), "utf8")));
  } catch {
    return emptyFile();
  }
}

function writeCache(data: AssignmentFile) {
  if (memoryOverride) {
    memoryOverride = {
      assignments: { ...data.assignments },
      companies: [...(data.companies ?? [])],
    };
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
  if (hydrated) return readCache();
  const cache = readCache();
  const drive = resolveAdapter();
  if (drive) {
    try {
      const vault = parseAssignmentFile(await readVaultJson(drive, COMPANIES_VAULT_NAME, COMPANIES_VAULT_KIND));
      if (hasDeskData(vault)) writeCache(vault);
      else if (hasDeskData(cache)) await writeVaultJson(drive, COMPANIES_VAULT_NAME, COMPANIES_VAULT_KIND, cache);
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
  return (await listCompanies()).some((row) => row.id === id);
}

/** Persisted assignment, falling back to the seed. Changing this is the reverse of assign. */
export async function assignedCompany(email: string): Promise<CompanyId> {
  const key = email.trim().toLowerCase();
  const data = await hydrateCompanyStore();
  return data.assignments[key] ?? seedCompanyForEmail(key);
}

export async function setAssignedCompany(email: string, companyId: CompanyId) {
  const data = await hydrateCompanyStore();
  data.assignments[email.trim().toLowerCase()] = companyId;
  await persist(data);
}

export async function addCompany(name: string): Promise<{ ok: true; company: Company } | { error: string }> {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (trimmed.length < 2) return { error: "Type a company name." };
  if (trimmed.length > 80) return { error: "That name is too long." };
  const existing = await listCompanies();
  const sameName = existing.find((row) => row.name.toLowerCase() === trimmed.toLowerCase());
  if (sameName) return { ok: true, company: sameName };
  let id = companyIdFromName(trimmed);
  if (!isCompanyId(id)) return { error: "Type a company name." };
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
  memoryOverride = { assignments: {}, companies: [] };
  hydrated = true;
  injectedAdapter = null;
}
