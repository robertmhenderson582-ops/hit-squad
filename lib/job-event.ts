export type JobEventLabel = "Turnaround" | "Outage";

const P66_HINT =
  /phillips\s*66|\bp66\b|wood\s*river|bayway|rodeo|ferndale|billings|refinery/i;

const POWERHOUSE_HINT = /georgia\s*power|yates|piedmont|powerhouse/i;

const SHOP_HINT = /^\s*shop(\s*\/\s*rig)?\s*$/i;

export function isPhillips66Plant(client = "", site = ""): boolean {
  return P66_HINT.test(`${client} ${site}`);
}

export function isShopJob(client = "", site = ""): boolean {
  return SHOP_HINT.test(client.trim()) || SHOP_HINT.test(site.trim());
}

/** Powerhouse only. P66 and Shop / rig never count as Outage. */
export function isPowerhouse(client = "", site = ""): boolean {
  if (isPhillips66Plant(client, site) || isShopJob(client, site)) return false;
  return POWERHOUSE_HINT.test(`${client} ${site}`);
}

/** Job-event chip only. Estimate type stays T&M / contract types. */
export function jobEventLabel(client = "", site = ""): JobEventLabel {
  return isPowerhouse(client, site) ? "Outage" : "Turnaround";
}

/** First JOB/EVENT chip. Shop / rig never relabels this to Outage. */
export function startJobEventLabel(client = "", site = "", size?: string | null): JobEventLabel {
  if (size === "shop" || isShopJob(client, site)) return "Turnaround";
  return jobEventLabel(client, site);
}

export function defaultEstimateName(client = "", site = "", size?: string | null) {
  if (size === "shop") return "Shop / rig job";
  return `New ${jobEventLabel(client, site)} estimate`;
}

export function isDefaultEstimateName(name: string) {
  return /^(New (Turnaround|Outage) estimate|Shop \/ rig job|New T&M estimate)$/i.test(name.trim());
}
