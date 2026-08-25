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
