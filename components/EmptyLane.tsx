export function EmptyLane({
  title,
  headers,
}: {
  title: string;
  headers: string[];
}) {
  return (
    <section className="plant-card px-4 py-4">
      <h3 className="font-display text-lg tracking-wide">{title}</h3>
      <div className="mt-3 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="font-mono text-[10px] tracking-[0.16em] text-[#5b6f73]">
            <tr>
              {headers.map((header) => (
                <th key={header} className="whitespace-nowrap px-2 py-2">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-[#d5e0de]">
              <td colSpan={headers.length} className="px-2 py-5 text-sm text-[#5b6f73]">
                None on this desk.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
