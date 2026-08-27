export type TesterSeatDef = {
  id: string;
  email: string;
  name: string;
  aliased: boolean;
  rateBuilder: boolean;
  viewAs: boolean;
  shop: "madison" | "field";
};

export const TESTER_SEATS: TesterSeatDef[] = [
  {
    id: "tester-nathan",
    email: "nathanboyte@gmail.com",
    name: "Nathan Boyte",
    aliased: false,
    rateBuilder: true,
    viewAs: false,
    shop: "madison",
  },
  {
    id: "tester-john",
    email: "johnbeech.madison@gmail.com",
    name: "John Beech",
    aliased: false,
    rateBuilder: true,
    viewAs: false,
    shop: "madison",
  },
  {
    id: "tester-wendell",
    email: "wlanderno@yahoo.com",
    name: "Wendell Landerno",
    aliased: false,
    rateBuilder: true,
    viewAs: false,
    shop: "field",
  },
  {
    id: "tester-benny",
    email: "bccamp2@gmail.com",
    name: "Benny Camp",
    aliased: false,
    rateBuilder: true,
    viewAs: false,
    shop: "field",
  },
  {
    id: "tester-chance",
    email: "chancec318@yahoo.com",
    name: "Chance Middlebrooks",
    aliased: false,
    rateBuilder: true,
    viewAs: false,
    shop: "field",
  },
  {
    id: "tester-shane",
    email: "shane@apcontrolsllc.com",
    name: "Shane Smith",
    aliased: false,
    rateBuilder: true,
    viewAs: false,
    shop: "field",
  },
  {
    id: "tester-mark",
    email: "marks544@yahoo.com",
    name: "Mark Schneider",
    aliased: true,
    rateBuilder: true,
    viewAs: false,
    shop: "field",
  },
  {
    id: "tester-cody",
    email: "puma.cody@gmail.com",
    name: "Cody Puma",
    aliased: true,
    rateBuilder: true,
    viewAs: false,
    shop: "field",
  },
  {
    id: "tester-bill",
    email: "bstubby@aol.com",
    name: "Bill Stubblebine",
    aliased: true,
    rateBuilder: true,
    viewAs: false,
    shop: "field",
  },
  {
    id: "tester-james",
    email: "jameshcainjr@gmail.com",
    name: "James Cain",
    aliased: true,
    rateBuilder: true,
    viewAs: false,
    shop: "field",
  },
  {
    id: "tester-joseph",
    email: "josephmhenderson2002@gmail.com",
    name: "Joseph Henderson",
    aliased: true,
    rateBuilder: false,
    viewAs: true,
    shop: "field",
  },
];

export const JOHN_BEECH_EMAIL = "johnbeech.madison@gmail.com";
export const JOSEPH_EMAIL = "josephmhenderson2002@gmail.com";
export const SHANE_EMAIL = "shane@apcontrolsllc.com";

export const FORBIDDEN_SEED_EMAILS = [
  "beechj@madisonltd.com",
  "zeke",
  "ejrock044",
  "markhayes",
  "peffley",
  "sghenderson",
  "johnhenry",
] as const;

export const FORBIDDEN_SEED_NAMES = [
  "zeke",
  "mark hayes",
  "ben peffley",
  "sg henderson",
  "john henry",
] as const;

export function testerByEmail(email: string): TesterSeatDef | undefined {
  return TESTER_SEATS.find((row) => row.email === email.trim().toLowerCase());
}

export function isJosephEmail(email = ""): boolean {
  return email.trim().toLowerCase() === JOSEPH_EMAIL;
}

export function aliasSeatForEmail(email: string): "real" | "aliased" | null {
  const tester = testerByEmail(email);
  if (!tester) return null;
  return tester.aliased ? "aliased" : "real";
}

export function seededHaystack(): string {
  return TESTER_SEATS.map((row) => `${row.email} ${row.name}`).join("\n").toLowerCase();
}

export function hasForbiddenSeed(): boolean {
  const hay = seededHaystack();
  if (FORBIDDEN_SEED_EMAILS.some((needle) => hay.includes(needle))) return true;
  if (FORBIDDEN_SEED_NAMES.some((needle) => hay.includes(needle))) return true;
  if (/\beric\b/.test(hay)) return true;
  return TESTER_SEATS.some((row) => row.email === "beechj@madisonltd.com");
}
