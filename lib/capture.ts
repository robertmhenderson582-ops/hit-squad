function deskRoot(): HTMLElement {
  return (
    (document.querySelector(".paper-desk") as HTMLElement | null) ||
    (document.querySelector(".industrial-root") as HTMLElement | null) ||
    document.body
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
    el.classList.contains("fab-note")
  );
}

function usableShot(dataUrl: string) {
  return Boolean(dataUrl && dataUrl.startsWith("data:image/") && dataUrl.length > 2000);
}

async function modernShot(target: HTMLElement): Promise<string> {
  const { domToJpeg } = await import("modern-screenshot");
  const width = Math.min(window.innerWidth, 1600);
  const height = Math.min(window.innerHeight, 1000);
  return domToJpeg(target, {
    quality: 0.82,
    scale: 1,
    width,
    height,
    backgroundColor: target.classList.contains("paper-desk") ? "#d5e4e2" : "#06161a",
    filter: (el) => !(el instanceof Element) || !shouldIgnoreForCapture(el),
  });
}

async function html2canvasShot(target: HTMLElement): Promise<string> {
  const mod = await import("html2canvas");
  const html2canvas = mod.default;
  const width = Math.min(window.innerWidth, target.clientWidth || window.innerWidth, 1600);
  const height = Math.min(window.innerHeight, target.clientHeight || window.innerHeight, 1000);
  const canvas = await html2canvas(target, {
    logging: false,
    useCORS: true,
    allowTaint: false,
    backgroundColor: target.classList.contains("paper-desk") ? "#d5e4e2" : "#06161a",
    scale: 1,
    width,
    height,
    windowWidth: window.innerWidth,
    windowHeight: window.innerHeight,
    scrollX: 0,
    scrollY: 0,
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
