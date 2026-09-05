/** In-memory Regular-client overrides. Server hydrates from owner settings; no fs here. */
let overrides: Record<string, boolean> = {};

export function peekRegularClientOverrides(): Record<string, boolean> {
  return { ...overrides };
}

export function setRegularClientOverrides(next: Record<string, boolean> = {}) {
  overrides = { ...next };
}

export function writeRegularClientOverride(siteId: string, regularClient: boolean) {
  overrides = { ...overrides, [siteId]: regularClient };
}
