function stampFallback(): string {
  const width = Math.min(window.innerWidth, 1280);
  const height = Math.min(window.innerHeight, 720);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#163038";
  ctx.font = "20px sans-serif";
  ctx.fillText(document.title, 28, 48);
  ctx.font = "14px sans-serif";
  ctx.fillStyle = "#5b6f73";
  ctx.fillText(window.location.pathname, 28, 76);
  ctx.fillText(new Date().toLocaleString(), 28, 98);
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
  await new Promise((resolve) => window.setTimeout(resolve, 120));
  try {
    const width = Math.min(window.innerWidth, 1400);
    const height = Math.min(window.innerHeight, 900);
    const serialized = new XMLSerializer().serializeToString(document.body);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject width="100%" height="100%">${serialized}</foreignObject></svg>`;
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("canvas"));
          return;
        }
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(image, 0, 0, width, height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL("image/jpeg", 0.72));
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("image"));
      };
      image.src = url;
    });
    return dataUrl;
  } catch {
    return stampFallback();
  }
}
