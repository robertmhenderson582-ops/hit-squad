export function ClosedModuleDesk({ title }: { title: string }) {
  return (
    <div className="mt-4 space-y-5">
      <section className="plant-card px-5 py-5">
        <h2 className="font-display text-3xl tracking-wide text-[#163038]">{title}</h2>
        <p className="mt-2 text-sm text-[#5b6f73]">not open for trial yet.</p>
      </section>
    </div>
  );
}
