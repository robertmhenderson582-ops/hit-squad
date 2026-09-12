import JSZip from "jszip";
import {
  hseCompanyDocFileName,
  hseCompanyDocPreviewType,
  hseCompanyDocViewKind,
  type HseCompanyDocViewKind,
} from "./hse-company-docs.ts";

export type HseCompanyDocZipMember = {
  path: string;
  name: string;
  kind: HseCompanyDocViewKind;
};

export type HseCompanyDocZipFile = {
  name: string;
  type: string;
  data: string;
};

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export function hseCompanyDocZipMemberPath(value: unknown) {
  if (typeof value !== "string") return "";
  return value.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "").trim();
}

export function isHseCompanyDocZipJunk(path: string, dir?: boolean) {
  const norm = hseCompanyDocZipMemberPath(path);
  if (!norm || dir || path.replace(/\\/g, "/").endsWith("/")) return true;
  return norm.split("/").some((part) => part === "__MACOSX");
}

export function hseCompanyDocZipMemberType(name: string) {
  const kind = hseCompanyDocViewKind({ name });
  if (kind === "office") {
    if (name.toLowerCase().endsWith(".docx")) {
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    }
    if (name.toLowerCase().endsWith(".xlsx")) {
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    }
  }
  return hseCompanyDocPreviewType({ name });
}

export function listHseCompanyDocZipMembers(
  entries: Array<{ name?: string; dir?: boolean }>,
): HseCompanyDocZipMember[] {
  return entries
    .map((entry) => ({
      path: hseCompanyDocZipMemberPath(entry.name),
      dir: entry.dir,
      raw: entry.name || "",
    }))
    .filter((entry) => entry.path && !isHseCompanyDocZipJunk(entry.raw || entry.path, entry.dir))
    .map((entry) => ({
      path: entry.path,
      name: entry.path,
      kind: hseCompanyDocViewKind({ name: entry.path }),
    }))
    .sort((left, right) => left.path.localeCompare(right.path));
}

export async function readHseCompanyDocZipMembers(bytes: Uint8Array | ArrayBuffer) {
  const zip = await JSZip.loadAsync(bytes);
  return listHseCompanyDocZipMembers(
    Object.keys(zip.files).map((name) => ({ name, dir: zip.files[name]?.dir })),
  );
}

export async function pickHseCompanyDocZipMember(
  bytes: Uint8Array | ArrayBuffer,
  memberPath: string,
): Promise<HseCompanyDocZipFile | null> {
  const wanted = hseCompanyDocZipMemberPath(memberPath);
  if (!wanted || isHseCompanyDocZipJunk(wanted)) return null;
  const zip = await JSZip.loadAsync(bytes);
  const entry =
    zip.file(wanted) ||
    zip.file(memberPath) ||
    Object.values(zip.files).find((file) => hseCompanyDocZipMemberPath(file.name) === wanted);
  if (!entry || entry.dir) return null;
  const data = await entry.async("uint8array");
  const name = hseCompanyDocFileName(wanted) || wanted;
  return {
    name,
    type: hseCompanyDocZipMemberType(wanted),
    data: bytesToBase64(data),
  };
}
