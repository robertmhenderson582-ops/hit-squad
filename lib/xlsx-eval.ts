import { excelDateSerial, type SheetCell, type WorkbookSheet } from "./xlsx-minimal.ts";

function colIndex(col: string) {
  let n = 0;
  for (const ch of col) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

function colName(index: number) {
  let n = index;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function expandRange(from: string, to: string) {
  const a = /^([A-Z]+)(\d+)$/.exec(from);
  const b = /^([A-Z]+)(\d+)$/.exec(to);
  if (!a || !b) return [];
  const refs: string[] = [];
  for (let c = colIndex(a[1]); c <= colIndex(b[1]); c += 1) {
    for (let r = Number(a[2]); r <= Number(b[2]); r += 1) {
      refs.push(`${colName(c)}${r}`);
    }
  }
  return refs;
}

/** Shared formula walker for tests and the estimate-JSON → xlsx CLI report. */
export function evaluateWorkbook(sheets: WorkbookSheet[]) {
  const cells = new Map<string, SheetCell>();
  for (const sheet of sheets) {
    for (const cell of sheet.cells) cells.set(`${sheet.name}!${cell.ref}`, cell);
  }
  const cache = new Map<string, number | string>();

  type RangeRef = { kind: "range"; sheet?: string; from: string; to: string };
  type Token =
    | { kind: "num"; value: number }
    | { kind: "str"; value: string }
    | { kind: "id"; value: string }
    | { kind: "ref"; sheet?: string; ref: string }
    | RangeRef
    | { kind: "op"; value: string }
    | { kind: "lp" }
    | { kind: "rp" }
    | { kind: "comma" };
  type EvalValue = number | string | boolean | RangeRef;

  function isRange(value: EvalValue): value is RangeRef {
    return Boolean(value && typeof value === "object" && value.kind === "range");
  }

  function cellRaw(sheet: string, ref: string): number | string {
    const key = `${sheet}!${ref.replaceAll("$", "")}`;
    if (cache.has(key)) return cache.get(key)!;
    const cell = cells.get(key);
    let value: number | string = 0;
    if (cell?.type === "number") value = cell.value;
    else if (cell?.type === "date") value = excelDateSerial(cell.value);
    else if (cell?.type === "text") value = cell.value;
    else if (cell?.type === "formula") value = evalFormula(sheet, String(cell.value));
    cache.set(key, value);
    return value;
  }

  function asNumber(value: EvalValue): number {
    if (isRange(value)) return 0;
    if (typeof value === "boolean") return value ? 1 : 0;
    if (typeof value === "number") return value;
    if (value === "") return 0;
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function isNumericLike(value: EvalValue): boolean {
    if (isRange(value)) return false;
    if (typeof value === "boolean") return true;
    if (typeof value === "number") return Number.isFinite(value);
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) return false;
      return Number.isFinite(Number(trimmed));
    }
    return false;
  }

  function asText(value: EvalValue): string {
    if (isRange(value)) return "";
    if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
    return String(value ?? "").trim();
  }

  function evalAt(sheet: string, ref: string): number {
    return asNumber(cellRaw(sheet, ref));
  }

  function rangeCells(range: RangeRef, fallbackSheet: string) {
    const name = range.sheet || fallbackSheet;
    return expandRange(range.from, range.to).map((ref) => ({ sheet: name, ref }));
  }

  function isExcelError(value: EvalValue) {
    return typeof value === "string" && /^#(N\/A|VALUE!|REF!|DIV\/0!)$/.test(value);
  }

  function tokenize(sheet: string, raw: string): Token[] {
    const src = raw.replace(/^=/, "").trim();
    const tokens: Token[] = [];
    let i = 0;
    while (i < src.length) {
      const ch = src[i];
      if (/\s/.test(ch)) {
        i += 1;
        continue;
      }
      if (ch === "'") {
        const end = src.indexOf("'", i + 1);
        const name = src.slice(i + 1, end);
        i = end + 1;
        if (src[i] === "!") i += 1;
        const span = /^(\$?[A-Z]+\$?\d+)(?::(\$?[A-Z]+\$?\d+))?/.exec(src.slice(i));
        if (!span) throw new Error(`sheet-ref ${raw}`);
        if (span[2]) {
          tokens.push({
            kind: "range",
            sheet: name,
            from: span[1].replaceAll("$", ""),
            to: span[2].replaceAll("$", ""),
          });
        } else {
          tokens.push({ kind: "ref", sheet: name, ref: span[1].replaceAll("$", "") });
        }
        i += span[0].length;
        continue;
      }
      if (ch === '"') {
        const end = src.indexOf('"', i + 1);
        tokens.push({ kind: "str", value: src.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
      if (/[0-9.]/.test(ch)) {
        const match = /^[0-9.]+/.exec(src.slice(i))!;
        tokens.push({ kind: "num", value: Number(match[0]) });
        i += match[0].length;
        continue;
      }
      const cell = /^(\$?[A-Z]+\$?\d+)/.exec(src.slice(i));
      if (cell) {
        i += cell[1].length;
        if (src[i] === ":") {
          const next = /^(\$?[A-Z]+\$?\d+)/.exec(src.slice(i + 1));
          if (next) {
            tokens.push({
              kind: "range",
              from: cell[1].replaceAll("$", ""),
              to: next[1].replaceAll("$", ""),
            });
            i += 1 + next[1].length;
            continue;
          }
        }
        tokens.push({ kind: "ref", ref: cell[1].replaceAll("$", "") });
        continue;
      }
      if (/[A-Za-z]/.test(ch)) {
        const ident = /^[A-Za-z][A-Za-z0-9]*/.exec(src.slice(i))!;
        const after = src.slice(i + ident[0].length);
        const sheetSpan = /^!(\$?[A-Z]+\$?\d+)(?::(\$?[A-Z]+\$?\d+))?/.exec(after);
        if (sheetSpan) {
          if (sheetSpan[2]) {
            tokens.push({
              kind: "range",
              sheet: ident[0],
              from: sheetSpan[1].replaceAll("$", ""),
              to: sheetSpan[2].replaceAll("$", ""),
            });
          } else {
            tokens.push({ kind: "ref", sheet: ident[0], ref: sheetSpan[1].replaceAll("$", "") });
          }
          i += ident[0].length + sheetSpan[0].length;
          continue;
        }
        tokens.push({ kind: "id", value: ident[0].toUpperCase() });
        i += ident[0].length;
        continue;
      }
      if (ch === "(") {
        tokens.push({ kind: "lp" });
        i += 1;
        continue;
      }
      if (ch === ")") {
        tokens.push({ kind: "rp" });
        i += 1;
        continue;
      }
      if (ch === ",") {
        tokens.push({ kind: "comma" });
        i += 1;
        continue;
      }
      if (src.startsWith("<>", i)) {
        tokens.push({ kind: "op", value: "<>" });
        i += 2;
        continue;
      }
      if (src.startsWith("<=", i) || src.startsWith(">=", i)) {
        tokens.push({ kind: "op", value: src.slice(i, i + 2) });
        i += 2;
        continue;
      }
      if ("=<>+-*/".includes(ch)) {
        tokens.push({ kind: "op", value: ch });
        i += 1;
        continue;
      }
      throw new Error(`token ${src.slice(i)} in ${raw}`);
    }
    return tokens;
  }

  function evalFormula(sheet: string, raw: string): number | string {
    const sum = /^SUM\((.+)\)$/.exec(raw.replace(/^=/, "").trim());
    if (sum && /:/.test(sum[1])) {
      return sum[1].split(",").reduce((acc, part) => {
        const token = part.trim();
        const range = /^(?:'([^']+)'|([A-Za-z0-9]+))!([A-Z]+\d+):(?:'([^']+)'|([A-Za-z0-9]+))!([A-Z]+\d+)$/.exec(token);
        if (range) {
          return acc + expandRange(range[3], range[6]).reduce((n, ref) => n + evalAt(range[1] || range[2], ref), 0);
        }
        const local = /^([A-Z]+\d+):([A-Z]+\d+)$/.exec(token);
        if (local) return acc + expandRange(local[1], local[2]).reduce((n, ref) => n + evalAt(sheet, ref), 0);
        const xref = /^(?:'([^']+)'|([A-Za-z0-9]+))!([A-Z]+\d+)$/.exec(token);
        if (xref) return acc + evalAt(xref[1] || xref[2], xref[3]);
        return acc + evalAt(sheet, token);
      }, 0);
    }
    const tokens = tokenize(sheet, raw);
    let p = 0;
    const peek = () => tokens[p];
    const take = () => tokens[p++];

    function parseArgs(): EvalValue[] {
      const args: EvalValue[] = [];
      if (peek()?.kind === "rp") return args;
      args.push(parseCompare());
      while (peek()?.kind === "comma") {
        take();
        args.push(parseCompare());
      }
      return args;
    }

    function parsePrimary(): EvalValue {
      const tok = take();
      if (!tok) return 0;
      if (tok.kind === "num") return tok.value;
      if (tok.kind === "str") return tok.value;
      if (tok.kind === "ref") return cellRaw(tok.sheet || sheet, tok.ref);
      if (tok.kind === "range") return tok;
      if (tok.kind === "lp") {
        const inner = parseCompare();
        if (peek()?.kind === "rp") take();
        return inner;
      }
      if (tok.kind === "id") {
        if (tok.value === "TRUE") return true;
        if (tok.value === "FALSE") return false;
        if (peek()?.kind !== "lp") return 0;
        take();
        const args = parseArgs();
        if (peek()?.kind === "rp") take();
        if (tok.value === "SUM") {
          return args.reduce<number>((sum, arg) => {
            if (isRange(arg)) {
              return sum + rangeCells(arg, sheet).reduce((n, item) => n + evalAt(item.sheet, item.ref), 0);
            }
            if (typeof arg === "string" && /:/.test(arg)) return sum;
            return sum + asNumber(arg);
          }, 0);
        }
        if (tok.value === "IF") return args[0] ? args[1] : args[2];
        if (tok.value === "AND") return args.every((arg) => Boolean(isRange(arg) ? false : arg));
        if (tok.value === "OR") return args.some((arg) => Boolean(isRange(arg) ? false : arg));
        if (tok.value === "NOT") return !(isRange(args[0]) ? false : args[0]);
        if (tok.value === "MIN") return Math.min(...args.map((arg) => asNumber(arg)));
        if (tok.value === "MAX") return Math.max(...args.map((arg) => asNumber(arg)));
        if (tok.value === "TRIM") return String(isRange(args[0]) ? "" : (args[0] ?? "")).trim();
        if (tok.value === "N") return isRange(args[0]) ? 0 : asNumber(args[0]);
        if (tok.value === "ISNUMBER") return typeof args[0] === "number" && Number.isFinite(args[0]);
        if (tok.value === "IFERROR") return isExcelError(args[0]) ? args[1] : args[0];
        if (tok.value === "INDEX") {
          const range = args[0];
          const index = Math.round(asNumber(args[1]));
          if (!isRange(range) || index < 1) return "#N/A";
          const cells = rangeCells(range, sheet);
          const hit = cells[index - 1];
          return hit ? cellRaw(hit.sheet, hit.ref) : "#N/A";
        }
        if (tok.value === "MATCH") {
          const needle = String(isRange(args[0]) ? "" : (args[0] ?? "")).trim();
          const range = args[1];
          if (!isRange(range) || !needle) return "#N/A";
          const cells = rangeCells(range, sheet);
          const found = cells.findIndex((item) => String(cellRaw(item.sheet, item.ref)).trim() === needle);
          return found >= 0 ? found + 1 : "#N/A";
        }
        if (tok.value === "COUNTIF") {
          const range = args[0];
          const needle = String(isRange(args[1]) ? "" : (args[1] ?? "")).trim();
          if (!isRange(range)) return 0;
          return rangeCells(range, sheet).filter((item) => String(cellRaw(item.sheet, item.ref)).trim() === needle).length;
        }
        if (tok.value === "WEEKDAY") {
          const serial = asNumber(args[0]);
          const utc = Date.UTC(1899, 11, 30) + serial * 86400000;
          return new Date(utc).getUTCDay() + 1;
        }
        return 0;
      }
      if (tok.kind === "op" && tok.value === "-") return -asNumber(parsePrimary());
      return 0;
    }

    function takeOp(): string | undefined {
      const tok = peek();
      return tok?.kind === "op" ? tok.value : undefined;
    }

    function parseMul(): EvalValue {
      let left = parsePrimary();
      let op = takeOp();
      while (op === "*" || op === "/") {
        take();
        const right = parsePrimary();
        left = op === "*" ? asNumber(left) * asNumber(right) : asNumber(right) === 0 ? 0 : asNumber(left) / asNumber(right);
        op = takeOp();
      }
      return left;
    }

    function parseAdd(): EvalValue {
      let left = parseMul();
      let op = takeOp();
      while (op === "+" || op === "-") {
        take();
        const right = parseMul();
        left = op === "+" ? asNumber(left) + asNumber(right) : asNumber(left) - asNumber(right);
        op = takeOp();
      }
      return left;
    }

    function parseCompare(): EvalValue {
      let left = parseAdd();
      let op = takeOp();
      while (op && ["=", "<>", "<", ">", "<=", ">="].includes(op)) {
        take();
        const right = parseAdd();
        if (op === "=") {
          if (left === right) left = true;
          else if (isNumericLike(left) && isNumericLike(right)) left = asNumber(left) === asNumber(right);
          else left = asText(left) === asText(right);
        } else if (op === "<>") {
          if (left === right) left = false;
          else if (isNumericLike(left) && isNumericLike(right)) left = asNumber(left) !== asNumber(right);
          else left = asText(left) !== asText(right);
        }
        else if (op === "<") left = asNumber(left) < asNumber(right);
        else if (op === ">") left = asNumber(left) > asNumber(right);
        else if (op === "<=") left = asNumber(left) <= asNumber(right);
        else left = asNumber(left) >= asNumber(right);
        op = takeOp();
      }
      return left;
    }

    const result = parseCompare();
    if (typeof result === "boolean") return asNumber(result);
    if (isRange(result)) return "#VALUE!";
    return result;
  }

  return { evalAt, cellRaw };
}

export function summaryAmountAt(sheets: WorkbookSheet[], sheetName: string, label: string): number | null {
  const sheet = sheets.find((item) => item.name === sheetName);
  const ref = sheet?.cells.find((cell) => cell.ref.startsWith("A") && cell.type === "text" && cell.value === label)?.ref;
  if (!ref) return null;
  return evaluateWorkbook(sheets).evalAt(sheetName, `B${ref.slice(1)}`);
}
