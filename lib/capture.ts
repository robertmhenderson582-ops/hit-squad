type CaptureOpts = {
  ignore?: (el: Element) => boolean;
};

async function html2canvasShot(opts: CaptureOpts): Promise<string> {
  const html2canvas = (await import("html2canvas")).default;
  const width = Math.min(window.innerWidth, 1600);
  const height = Math.min(window.innerHeight, 1000);
  const canvas = await html2canvas(document.documentElement, {
    useCORS: true,
    allowTaint: true,
    backgroundColor: "#06161a",
    scale: Math.min(2, window.devicePixelRatio || 1),
    width,
    height,
    windowWidth: window.innerWidth,
    windowHeight: window.innerHeight,
    x: window.scrollX,
    y: window.scrollY,
    ignoreElements: (el) => Boolean(opts.ignore?.(el)),
  });
  return canvas.toDataURL("image/jpeg", 0.82);
}

function looksLikeStamp(dataUrl: string) {
  return !dataUrl || dataUrl.length < 800;
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
    el.classList.contains("fab-note")
  );
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

export async function shootViewport(): Promise<string> {
  if (typeof window === "undefined") return "";
  await new Promise((resolve) => window.requestAnimationFrame(() => resolve(undefined)));
  await new Promise((resolve) => window.setTimeout(resolve, 160));
  try {
    const dataUrl = await html2canvasShot({ ignore: shouldIgnoreForCapture });
    return looksLikeStamp(dataUrl) ? "" : dataUrl;
  } catch {
    return "";
  }
}
