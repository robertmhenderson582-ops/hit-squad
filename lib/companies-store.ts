import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  companyIdFromName,
  isCompanyId,
  mergeCompanies,
  seedCompanyForEmail,
  type Company,
  type CompanyId,
} from "./companies.ts";

type AssignmentFile = {
  assignments: Record<string, CompanyId>;
  companies?: Company[];
};

let memoryOverride: AssignmentFile | null = null;

export function companyAssignmentPath(): string {
  if (process.env.COMPANY_ASSIGNMENT_PATH) return process.env.COMPANY_ASSIGNMENT_PATH;
  if (process.env.VERCEL) return "/tmp/hit-squad-companies.json";
  return join(process.cwd(), "data", "company-assignments.json");
}

function readFile(): AssignmentFile {
  if (memoryOverride) {
    return {
      assignments: { ...memoryOverride.assignments },
      companies: [...(memoryOverride.companies ?? [])],
    };
  }
  try {
    const raw = readFileSync(companyAssignmentPath(), "utf8");
    const parsed = JSON.parse(raw) as AssignmentFile;
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
  } catch {
    return { assignments: {}, companies: [] };
  }
}

function writeFile(data: AssignmentFile) {
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

export function listCompanies(): Company[] {
  return mergeCompanies(readFile().companies);
}

export function isKnownCompany(id: string): boolean {
  return listCompanies().some((row) => row.id === id);
}

/** Persisted assignment, falling back to the seed. Changing this is the reverse of assign. */
export function assignedCompany(email: string): CompanyId {
  const key = email.trim().toLowerCase();
  return readFile().assignments[key] ?? seedCompanyForEmail(key);
}

export function setAssignedCompany(email: string, companyId: CompanyId) {
  const data = readFile();
  data.assignments[email.trim().toLowerCase()] = companyId;
  writeFile(data);
}

export function addCompany(name: string): { ok: true; company: Company } | { error: string } {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (trimmed.length < 2) return { error: "Type a company name." };
  if (trimmed.length > 80) return { error: "That name is too long." };
  const existing = listCompanies();
  const sameName = existing.find((row) => row.name.toLowerCase() === trimmed.toLowerCase());
  if (sameName) return { ok: true, company: sameName };
  let id = companyIdFromName(trimmed);
  if (!isCompanyId(id)) return { error: "Type a company name." };
  if (existing.some((row) => row.id === id)) {
    let n = 2;
    while (existing.some((row) => row.id === `${id}${n}`)) n += 1;
    id = `${id}${n}`;
  }
  const data = readFile();
  data.companies = [...(data.companies ?? []), { id, name: trimmed }];
  writeFile(data);
  return { ok: true, company: { id, name: trimmed } };
}

export function resetCompanyAssignmentsForTests() {
  memoryOverride = null;
  const path = companyAssignmentPath();
  if (process.env.COMPANY_ASSIGNMENT_PATH && existsSync(path)) {
    writeFileSync(path, JSON.stringify({ assignments: {}, companies: [] }, null, 2) + "\n", "utf8");
  }
}

export function useMemoryCompanyAssignments() {
  memoryOverride = { assignments: {}, companies: [] };
}
