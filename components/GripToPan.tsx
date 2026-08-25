"use client";

import { useRef } from "react";

const SKIP = "input,select,textarea,button,a,label,option,[data-no-pan],[contenteditable='true']";

export function GripToPan({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; sl: number } | null>(null);

  function endPan(event?: React.PointerEvent<HTMLDivElement>) {
    drag.current = null;
    ref.current?.classList.remove("is-panning");
    if (event && ref.current?.hasPointerCapture(event.pointerId)) {
      ref.current.releasePointerCapture(event.pointerId);
    }
  }

  return (
    <div
      ref={ref}
      className={`grip-pan overflow-x-auto ${className ?? ""}`}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        if ((event.target as HTMLElement).closest(SKIP)) return;
        const el = ref.current;
        if (!el) return;
        drag.current = { x: event.clientX, sl: el.scrollLeft };
        el.setPointerCapture(event.pointerId);
        el.classList.add("is-panning");
      }}
      onPointerMove={(event) => {
        if (!drag.current || !ref.current) return;
        ref.current.scrollLeft = drag.current.sl - (event.clientX - drag.current.x);
      }}
      onPointerUp={endPan}
      onPointerCancel={endPan}
    >
      {children}
    </div>
  );
}
