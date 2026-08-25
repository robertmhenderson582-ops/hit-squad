import type { EstimateRecord, JobRecord, SiteRecord } from "./types";

function norm(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function estimateHref(id: string) {
  return `/estimates/${id}`;
}

export function newEstimatePackId() {
  return `new-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function newEstimateKey(packId: string) {
  return `new:${packId}`;
}

export function estimateForJob(job: JobRecord, estimates: EstimateRecord[]): EstimateRecord | undefined {
  const jobTitle = norm(job.title);
  return estimates.find((row) => {
    const title = norm(row.title);
    const stem = jobTitle.replace(/\s+estimate$/, "");
    return (
      jobTitle.includes(title) ||
      title.includes(stem) ||
      title.slice(0, 18) === jobTitle.slice(0, 18) ||
      (row.unit.length > 2 && jobTitle.includes(norm(row.unit)) && (job.kind === "estimate" || title.includes(norm(row.unit))))
    );
  });
}

export function estimatesForPlant(
  estimates: EstimateRecord[],
  sites: SiteRecord[],
  plantName: string,
  plantCity = "",
): EstimateRecord[] {
  const name = norm(plantName);
  const city = norm(plantCity.split(",")[0] || "");
  return estimates.filter((row) => {
    const site = sites.find((item) => item.id === row.siteId);
    if (!site) return false;
    const siteName = norm(site.name);
    const siteCity = norm(site.city.split(",")[0] || "");
    return (
      siteName.includes(name) ||
      name.includes(siteName) ||
      (city && (siteCity.includes(city) || city.includes(siteCity)))
    );
  });
}
