export type JobEventLabel = "Turnaround" | "Outage";

const P66_HINT =
  /phillips\s*66|\bp66\b|wood\s*river|bayway|rodeo|ferndale|billings|refinery/i;

export function isPhillips66Plant(client = "", site = ""): boolean {
  return P66_HINT.test(`${client} ${site}`);
}

/** Job-event chip only. Estimate type stays T&M / contract types. */
export function jobEventLabel(client = "", site = ""): JobEventLabel {
  return isPhillips66Plant(client, site) ? "Turnaround" : "Outage";
}

export function defaultEstimateName(client = "", site = "", size?: string) {
  if (size === "shop") return "Shop / rig job";
  return `New ${jobEventLabel(client, site)} estimate`;
}

export function isDefaultEstimateName(name: string) {
  return /^(New (Turnaround|Outage) estimate|Shop \/ rig job|New T&M estimate)$/i.test(name.trim());
}
