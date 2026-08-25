/** Phillips 66 IPS craft lists. Wood River / Bayway = East (Nathan). Rodeo / Ferndale = West (John). */

export const P66_CONTRACTOR = "MADISON INDUSTRIAL SVCS TEAM LLC (50413486)";

export type StaffingCoast = "east" | "west";

export type IpsCraft = {
  name: string;
  code: string;
  aliases: string[];
};

const SUPERVISION: IpsCraft[] = [
  { name: "General Superintendent", code: "100", aliases: ["general superintendent", "superintendent general"] },
  { name: "Superintendent", code: "101", aliases: ["superintendent", "supt"] },
  { name: "Project Manager", code: "102", aliases: ["project manager"] },
  { name: "Project Controls", code: "103", aliases: ["project controls", "cost analyst", "analyst cost"] },
  { name: "Safety", code: "120", aliases: ["safety", "hse"] },
  { name: "General Foreman", code: "110", aliases: ["general foreman"] },
  { name: "Foreman", code: "111", aliases: ["foreman"] },
];

const CORE_CRAFTS: IpsCraft[] = [
  { name: "Boilermaker Journeyman", code: "201", aliases: ["boilermaker journeyman", "bm journeyman"] },
  { name: "Boilermaker Helper", code: "202", aliases: ["boilermaker helper", "bm helper"] },
  { name: "Boilermaker Welder", code: "203", aliases: ["boilermaker welder", "bm welder"] },
  { name: "Boilermaker", code: "200", aliases: ["boilermaker", "bm"] },
  { name: "Pipefitter Journeyman", code: "301", aliases: ["pipefitter journeyman", "pf journeyman"] },
  { name: "Pipefitter Helper", code: "302", aliases: ["pipefitter helper", "pf helper"] },
  { name: "Pipefitter Welder", code: "303", aliases: ["pipefitter welder", "pf welder"] },
  { name: "Pipefitter", code: "300", aliases: ["pipefitter", "pf"] },
  { name: "Combo Welder", code: "401", aliases: ["combo welder", "merit welder", "welder"] },
  { name: "Structural Welder", code: "402", aliases: ["structural welder"] },
  { name: "Millwright Journeyman", code: "501", aliases: ["millwright journeyman"] },
  { name: "Millwright Helper", code: "502", aliases: ["millwright helper"] },
  { name: "Millwright", code: "500", aliases: ["millwright"] },
  { name: "Electrician Journeyman", code: "701", aliases: ["electrician journeyman"] },
  { name: "Electrician Helper", code: "702", aliases: ["electrician helper"] },
  { name: "Electrician", code: "700", aliases: ["electrician"] },
  { name: "Laborer", code: "901", aliases: ["laborer"] },
  { name: "Firewatch", code: "902", aliases: ["firewatch", "fire watch"] },
  { name: "Holewatch", code: "903", aliases: ["holewatch", "hole watch"] },
];

const EAST_OPERATORS: IpsCraft[] = [
  { name: "Equipment Operator", code: "801", aliases: ["equipment operator", "operator"] },
];

const WEST_EXTRA: IpsCraft[] = [
  { name: "Ironworker Structural", code: "601", aliases: ["ironworker structural", "ironworker journeyman", "ironworker", "iw"] },
  { name: "Ironworker Connector", code: "602", aliases: ["ironworker connector", "connector"] },
  { name: "Ironworker Welder", code: "603", aliases: ["ironworker welder"] },
  { name: "Ironworker Rigger", code: "604", aliases: ["ironworker rigger", "rigger"] },
  { name: "Crane Operator", code: "810", aliases: ["crane operator", "crane"] },
  { name: "Forklift Operator", code: "820", aliases: ["forklift operator", "forklift"] },
  { name: "Combo Operator", code: "830", aliases: ["combo operator"] },
  { name: "Equipment Operator", code: "801", aliases: ["equipment operator", "operator"] },
];

export const EAST_COAST_CRAFTS: IpsCraft[] = [...SUPERVISION, ...CORE_CRAFTS, ...EAST_OPERATORS];

export const WEST_COAST_CRAFTS: IpsCraft[] = [...SUPERVISION, ...CORE_CRAFTS, ...WEST_EXTRA];

export function staffingCoastFromSite(site = "", client = "", plantCode = ""): StaffingCoast {
  const hay = `${site} ${client} ${plantCode}`.toLowerCase();
  if (hay.includes("rodeo") || hay.includes("ferndale") || hay.includes("west coast")) return "west";
  return "east";
}

export function craftsForCoast(coast: StaffingCoast): IpsCraft[] {
  return coast === "west" ? WEST_COAST_CRAFTS : EAST_COAST_CRAFTS;
}

export function matchIpsCraft(title: string, crafts: IpsCraft[]): IpsCraft | null {
  const hay = title.trim().toLowerCase();
  if (!hay) return null;
  let best: { craft: IpsCraft; len: number } | null = null;
  for (const craft of crafts) {
    const names = [craft.name.toLowerCase(), ...craft.aliases];
    for (const alias of names) {
      if (hay === alias || hay.includes(alias)) {
        if (!best || alias.length > best.len) best = { craft, len: alias.length };
      }
    }
  }
  return best?.craft ?? null;
}
