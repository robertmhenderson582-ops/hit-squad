import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  isCompanyId,
  seedCompanyForEmail,
  type CompanyId,
} from "./companies.ts";

type AssignmentFile = { assignments: Record<string, CompanyId> };

let memoryOverride: AssignmentFile | null = null;

export function companyAssignmentPath(): string {
  if (process.env.COMPANY_ASSIGNMENT_PATH) return process.env.COMPANY_ASSIGNMENT_PATH;
  if (process.env.VERCEL) return "/tmp/hit-squad-companies.json";
  return join(process.cwd(), "data", "company-assignments.json");
}

function readFile(): AssignmentFile {
  if (memoryOverride) return { assignments: { ...memoryOverride.assignments } };
  try {
    const raw = readFileSync(companyAssignmentPath(), "utf8");
    const parsed = JSON.parse(raw) as AssignmentFile;
    const assignments: Record<string, CompanyId> = {};
    for (const [email, id] of Object.entries(parsed.assignments ?? {})) {
      if (isCompanyId(id)) assignments[email.toLowerCase()] = id;
    }
    return { assignments };
  } catch {
    return { assignments: {} };
  }
}

function writeFile(data: AssignmentFile) {
  if (memoryOverride) {
    memoryOverride = { assignments: { ...data.assignments } };
    return;
  }
  const path = companyAssignmentPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf8");
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

export function resetCompanyAssignmentsForTests() {
  memoryOverride = null;
  const path = companyAssignmentPath();
  if (process.env.COMPANY_ASSIGNMENT_PATH && existsSync(path)) {
    writeFileSync(path, JSON.stringify({ assignments: {} }, null, 2) + "\n", "utf8");
  }
}

export function useMemoryCompanyAssignments() {
  memoryOverride = { assignments: {} };
}
