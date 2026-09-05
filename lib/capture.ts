export const CAPTURE_ROOT_SELECTORS = [
  "[data-capture-root]",
  ".desk-home-root",
  ".paper-page",
  ".desk-day",
  ".industrial-root",
] as const;

export const CAPTURE_OVERLAY_CLASSES = [
  "modal-scrim",
  "estimate-modal",
  "ticket-card",
  "ticket-scrim",
] as const;

export const CAPTURE_CHROME_CLASSES = [
  "inbox-fab",
  "ticket-fab",
  "inbox-card",
  "inbox-toast",
  "fab-note",
  "ticket-markup",
] as const;

export const CAPTURE_OVERLAY_SELECTOR = ".modal-scrim, .estimate-modal, .ticket-card, .ticket-scrim";

export function pickCaptureSelector(classNames: string[]): string {
  if (classNames.includes("data-capture-root")) return "[data-capture-root]";
  if (classNames.includes("desk-home-root")) return ".desk-home-root";
  if (classNames.includes("paper-page")) return ".paper-page";
  if (classNames.includes("desk-day")) return ".desk-day";
  if (classNames.includes("industrial-root")) return ".industrial-root";
  return "body";
}

export function overlayClassesOpen(classLists: string[][]): boolean {
  return classLists.some((list) =>
    list.some((name) => (CAPTURE_OVERLAY_CLASSES as readonly string[]).includes(name)),
  );
}

/** Open dialogs live outside the desk shell (portals / layout FABs). Shoot the document. */
export function pickCaptureTarget(overlayOpen: boolean, classNames: string[] = ["data-capture-root"]) {
  return overlayOpen ? "document-element" : pickCaptureSelector(classNames);
}

export function ignoreClassForCapture(classNames: string[], captureIgnore = false) {
  if (classNames.some((name) => (CAPTURE_OVERLAY_CLASSES as readonly string[]).includes(name))) {
    return false;
  }
  if (captureIgnore) return true;
  return classNames.some((name) => (CAPTURE_CHROME_CLASSES as readonly string[]).includes(name));
}

function deskRoot(): HTMLElement {
  for (const selector of CAPTURE_ROOT_SELECTORS) {
    const hit = document.querySelector(selector);
    if (hit instanceof HTMLElement) return hit;
  }
  return document.body;
}

function deskOverlaysOpen() {
  return Boolean(document.querySelector(CAPTURE_OVERLAY_SELECTOR));
}

function captureTarget(): HTMLElement {
  if (deskOverlaysOpen()) return document.documentElement;
  return deskRoot();
}

function paperShot(target: HTMLElement) {
  return Boolean(
    target.closest(".paper-page, .desk-day, .paper-desk") || target.classList.contains("paper-page"),
  );
}

export function shouldIgnoreForCapture(el: Element) {
  if (!(el instanceof HTMLElement)) return false;
  const classNames = [...el.classList];
  if (classNames.some((name) => (CAPTURE_OVERLAY_CLASSES as readonly string[]).includes(name))) {
    return false;
  }
  if (el.closest("[data-capture='ignore']")) return true;
  return ignoreClassForCapture(classNames, el.dataset.capture === "ignore");
}

function usableShot(dataUrl: string) {
  return Boolean(dataUrl && dataUrl.startsWith("data:image/") && dataUrl.length > 2000);
}

async function modernShot(target: HTMLElement): Promise<string> {
  const { domToJpeg } = await import("modern-screenshot");
  const width = window.innerWidth;
  const height = window.innerHeight;
  return domToJpeg(target, {
    quality: 0.82,
    scale: 1,
    width,
    height,
    backgroundColor: paperShot(target) ? "#d5e4e2" : "#06161a",
    filter: (el) => !(el instanceof Element) || !shouldIgnoreForCapture(el),
  });
}

async function html2canvasShot(target: HTMLElement): Promise<string> {
  const mod = await import("html2canvas");
  const html2canvas = mod.default;
  const width = window.innerWidth;
  const height = window.innerHeight;
  const canvas = await html2canvas(target, {
    logging: false,
    useCORS: true,
    allowTaint: false,
    backgroundColor: paperShot(target) ? "#d5e4e2" : "#06161a",
    scale: 1,
    width,
    height,
    windowWidth: window.innerWidth,
    windowHeight: window.innerHeight,
    x: window.scrollX,
    y: window.scrollY,
    scrollX: -window.scrollX,
    scrollY: -window.scrollY,
    ignoreElements: (el) => shouldIgnoreForCapture(el),
  });
  return canvas.toDataURL("image/jpeg", 0.82);
}

export async function burnCaption(dataUrl: string, caption: string): Promise<string> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image"));
    img.src = dataUrl;
  });
  const extra = 88;
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height + extra;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0);
  ctx.fillStyle = "#163038";
  ctx.font = "14px sans-serif";
  const lines = caption.split("\n").slice(0, 3);
  lines.forEach((line, index) => {
    ctx.fillText(line.slice(0, 90), 16, image.height + 24 + index * 20);
  });
  return canvas.toDataURL("image/jpeg", 0.82);
}

export async function attachInboxPhoto(dataUrl: string): Promise<string> {
  if (!dataUrl.startsWith("data:image/")) throw new Error("attach");
  const compact = await compressCapture(dataUrl, 1280, 0.7);
  if (compact.startsWith("data:image/") && compact.length <= 900_000) return compact;
  const smaller = await compressCapture(dataUrl, 960, 0.45);
  if (smaller.startsWith("data:image/") && smaller.length <= 900_000) return smaller;
  throw new Error("attach");
}

export async function compressCapture(dataUrl: string, maxEdge = 1280, quality = 0.7): Promise<string> {
  if (!dataUrl.startsWith("data:image/")) return dataUrl;
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("image"));
      img.src = dataUrl;
    });
    const scale = Math.min(1, maxEdge / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;
    ctx.fillStyle = "#06161a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    let next = canvas.toDataURL("image/jpeg", quality);
    if (next.length > 450_000) next = canvas.toDataURL("image/jpeg", 0.52);
    return usableShot(next) ? next : dataUrl;
  } catch {
    return dataUrl;
  }
}

export async function shootViewport(): Promise<string> {
  if (typeof window === "undefined") return "";
  document.documentElement.classList.add("hs-capturing");
  await new Promise((resolve) => window.requestAnimationFrame(() => resolve(undefined)));
  await new Promise((resolve) => window.setTimeout(resolve, 180));
  try {
    const target = captureTarget();
    try {
      const shot = await modernShot(target);
      if (usableShot(shot)) return shot;
    } catch {
      // try html2canvas
    }
    const shot = await html2canvasShot(target);
    return usableShot(shot) ? shot : "";
  } catch {
    return "";
  } finally {
    document.documentElement.classList.remove("hs-capturing");
  }
}
