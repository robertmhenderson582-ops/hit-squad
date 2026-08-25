export const CAPTURE_ROOT_SELECTORS = [
  "[data-capture-root]",
  ".paper-page",
  ".desk-day",
  ".industrial-root",
] as const;

export function pickCaptureSelector(classNames: string[]): string {
  if (classNames.includes("data-capture-root")) return "[data-capture-root]";
  if (classNames.includes("paper-page")) return ".paper-page";
  if (classNames.includes("desk-day")) return ".desk-day";
  if (classNames.includes("industrial-root")) return ".industrial-root";
  return "body";
}

function deskRoot(): HTMLElement {
  for (const selector of CAPTURE_ROOT_SELECTORS) {
    const hit = document.querySelector(selector);
    if (hit instanceof HTMLElement) return hit;
  }
  return document.body;
}

function paperShot(target: HTMLElement) {
  return Boolean(
    target.closest(".paper-page, .desk-day, .paper-desk") || target.classList.contains("paper-page"),
  );
}

export function shouldIgnoreForCapture(el: Element) {
  if (!(el instanceof HTMLElement)) return false;
  if (el.dataset.capture === "ignore") return true;
  return (
    el.classList.contains("desk-fabs") ||
    el.classList.contains("ticket-card") ||
    el.classList.contains("ticket-scrim") ||
    el.classList.contains("inbox-card") ||
    el.classList.contains("inbox-toast") ||
    el.classList.contains("fab-note") ||
    el.classList.contains("ticket-markup")
  );
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
    const target = deskRoot();
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
