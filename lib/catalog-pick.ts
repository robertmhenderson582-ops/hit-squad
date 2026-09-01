export const CATALOG_CUSTOM = "__custom__";

export type CatalogPickView = {
  listed: boolean;
  named: boolean;
  selectValue: string;
  showValueOption: boolean;
  showCustomInput: boolean;
  placeholderSelected: boolean;
};

/** How the position select should look. A named title must never fall through to the placeholder. */
export function catalogPickView(
  value: string,
  options: readonly string[],
  allowCustom = false,
  wantCustom = false,
): CatalogPickView {
  const named = Boolean(value.trim());
  const listed = (options as readonly string[]).includes(value);
  if (listed) {
    return {
      listed: true,
      named: true,
      selectValue: value,
      showValueOption: false,
      showCustomInput: false,
      placeholderSelected: false,
    };
  }
  if (named) {
    return {
      listed: false,
      named: true,
      selectValue: value,
      showValueOption: true,
      showCustomInput: allowCustom,
      placeholderSelected: false,
    };
  }
  return {
    listed: false,
    named: false,
    selectValue: allowCustom && wantCustom ? CATALOG_CUSTOM : "",
    showValueOption: false,
    showCustomInput: Boolean(allowCustom && wantCustom),
    placeholderSelected: !(allowCustom && wantCustom),
  };
}
