"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";

type Stroke = { color: string; points: Array<{ x: number; y: number }> };

const COLORS = [
  { id: "amber", value: "#e38b2a", label: "Amber" },
  { id: "red", value: "#b74120", label: "Red" },
] as const;

export function CaptureMarkup({
  src,
  onDone,
  onCancel,
}: {
  src: string;
  onDone: (marked: string) => void;
  onCancel: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const strokes = useRef<Stroke[]>([]);
  const drawing = useRef<Stroke | null>(null);
  const [color, setColor] = useState<(typeof COLORS)[number]["value"]>(COLORS[0].value);
  const [ready, setReady] = useState(false);
  const imageRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const image = new Image();
    image.onload = () => {
      imageRef.current = image;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const maxW = Math.max(240, window.innerWidth - 32);
      const maxH = Math.max(180, window.innerHeight - 140);
      const scale = Math.min(maxW / image.width, maxH / image.height);
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      paint();
      setReady(true);
    };
    image.src = src;
  }, [src]);

  function paint() {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !image || !ctx) return;
    ctx.fillStyle = "#06161a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const stroke of strokes.current) {
      if (stroke.points.length < 2) continue;
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      stroke.points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
      ctx.stroke();
    }
  }

  function point(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const box = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - box.left) / box.width) * canvas.width,
      y: ((event.clientY - box.top) / box.height) * canvas.height,
    };
  }

  function onPointerDown(event: PointerEvent<HTMLCanvasElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = { color, points: [point(event)] };
    strokes.current.push(drawing.current);
    paint();
  }

  function onPointerMove(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    drawing.current.points.push(point(event));
    paint();
  }

  function onPointerUp() {
    drawing.current = null;
    paint();
  }

  function undo() {
    strokes.current = strokes.current.slice(0, -1);
    paint();
  }

  function clear() {
    strokes.current = [];
    paint();
  }

  function done() {
    const canvas = canvasRef.current;
    if (!canvas) {
      onDone(src);
      return;
    }
    paint();
    onDone(canvas.toDataURL("image/jpeg", 0.82));
  }

  return (
    <div className="ticket-markup" data-capture="ignore" role="dialog" aria-label="Mark up capture">
      <div className="ticket-markup-bar">
        <p className="font-semibold text-white">Draw on capture</p>
        <div className="flex flex-wrap items-center gap-2">
          {COLORS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setColor(item.value)}
              className={`rounded-full px-3 py-1 text-sm ${
                color === item.value ? "bg-white text-[#163038]" : "border border-white/40 text-white"
              }`}
            >
              {item.label}
            </button>
          ))}
          <button type="button" onClick={undo} className="rounded-full border border-white/40 px-3 py-1 text-sm text-white">
            Undo
          </button>
          <button type="button" onClick={clear} className="rounded-full border border-white/40 px-3 py-1 text-sm text-white">
            Clear
          </button>
          <button type="button" onClick={onCancel} className="rounded-full border border-white/40 px-3 py-1 text-sm text-white">
            Cancel
          </button>
          <button type="button" onClick={done} className="rounded-full bg-steel px-3 py-1 text-sm text-white">
            Done
          </button>
        </div>
      </div>
      <canvas
        ref={canvasRef}
        className={`ticket-markup-canvas ${ready ? "" : "opacity-0"}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      />
    </div>
  );
}
