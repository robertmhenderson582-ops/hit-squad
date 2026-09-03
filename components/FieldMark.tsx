export function FieldMark({ children }: { children: React.ReactNode }) {
  return <span className="field-mark">{children}</span>;
}

export function FieldBlock({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm text-[#163038]">
      <FieldMark>{label}</FieldMark>
      {children}
    </label>
  );
}
