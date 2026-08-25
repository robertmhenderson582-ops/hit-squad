"use client";

export function PhotoViewer({
  src,
  caption,
  onClose,
}: {
  src: string;
  caption?: string;
  onClose: () => void;
}) {
  async function copy() {
    const blob = await (await fetch(src)).blob();
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
  }

  function save() {
    const link = document.createElement("a");
    link.href = src;
    link.download = "hit-squad-photo.jpg";
    link.click();
  }

  return (
    <div className="photo-scrim" role="dialog" aria-label="Photo">
      <div className="photo-sheet">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={caption || "Attached photo"} className="max-h-[70vh] w-full object-contain" />
        {caption ? <p className="mt-3 text-sm text-[#5b6f73]">{caption}</p> : null}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={() => void copy()} className="rounded-lg border border-steel px-3 py-2 text-sm text-steel">
            Copy to clipboard
          </button>
          <button type="button" onClick={save} className="rounded-lg border border-steel px-3 py-2 text-sm text-steel">
            Save
          </button>
          <button type="button" onClick={onClose} className="rounded-lg bg-steel px-3 py-2 text-sm text-white">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
