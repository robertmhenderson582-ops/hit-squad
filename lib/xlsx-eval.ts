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

  function asNumber(value: number | string | boolean): number {
    if (typeof value === "boolean") return value ? 1 : 0;
    if (typeof value === "number") return value;
    if (value === "") return 0;
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function evalAt(sheet: string, ref: string): number {
    return asNumber(cellRaw(sheet, ref));
  }

  type Token =
    | { kind: "num"; value: number }
    | { kind: "str"; value: string }
    | { kind: "id"; value: string }
    | { kind: "ref"; sheet?: string; ref: string }
    | { kind: "op"; value: string }
    | { kind: "lp" }
    | { kind: "rp" }
    | { kind: "comma" };

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
        const ref = /^(\$?[A-Z]+\$?\d+)/.exec(src.slice(i));
        if (!ref) throw new Error(`sheet-ref ${raw}`);
        tokens.push({ kind: "ref", sheet: name, ref: ref[1].replaceAll("$", "") });
        i += ref[1].length;
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
        tokens.push({ kind: "ref", ref: cell[1].replaceAll("$", "") });
        i += cell[1].length;
        continue;
      }
      if (/[A-Za-z]/.test(ch)) {
        const ident = /^[A-Za-z][A-Za-z0-9]*/.exec(src.slice(i))!;
        const after = src.slice(i + ident[0].length);
        const sheetRef = /^!(\$?[A-Z]+\$?\d+)/.exec(after);
        if (sheetRef) {
          tokens.push({ kind: "ref", sheet: ident[0], ref: sheetRef[1].replaceAll("$", "") });
          i += ident[0].length + 1 + sheetRef[1].length;
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

    function parseArgs(): Array<number | string | boolean> {
      const args: Array<number | string | boolean> = [];
      if (peek()?.kind === "rp") return args;
      args.push(parseCompare());
      while (peek()?.kind === "comma") {
        take();
        args.push(parseCompare());
      }
      return args;
    }

    function parsePrimary(): number | string | boolean {
      const tok = take();
      if (!tok) return 0;
      if (tok.kind === "num") return tok.value;
      if (tok.kind === "str") return tok.value;
      if (tok.kind === "ref") return cellRaw(tok.sheet || sheet, tok.ref);
      if (tok.kind === "lp") {
        const inner = parseCompare();
        if (peek()?.kind === "rp") take();
        return inner;
      }
      if (tok.kind === "id") {
        if (peek()?.kind !== "lp") return 0;
        take();
        const args = parseArgs();
        if (peek()?.kind === "rp") take();
        if (tok.value === "SUM") {
          return args.reduce<number>((sum, arg) => {
            if (typeof arg === "string" && /:/.test(arg)) return sum;
            return sum + asNumber(arg);
          }, 0);
        }
        if (tok.value === "IF") return args[0] ? args[1] : args[2];
        if (tok.value === "AND") return args.every(Boolean);
        if (tok.value === "OR") return args.some(Boolean);
        if (tok.value === "MIN") return Math.min(...args.map(asNumber));
        if (tok.value === "MAX") return Math.max(...args.map(asNumber));
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

    function parseMul(): number | string | boolean {
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

    function parseAdd(): number | string | boolean {
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

    function parseCompare(): number | string | boolean {
      let left = parseAdd();
      let op = takeOp();
      while (op && ["=", "<>", "<", ">", "<=", ">="].includes(op)) {
        take();
        const right = parseAdd();
        if (op === "=") left = left === right || asNumber(left) === asNumber(right);
        else if (op === "<>") left = left !== right;
        else if (op === "<") left = asNumber(left) < asNumber(right);
        else if (op === ">") left = asNumber(left) > asNumber(right);
        else if (op === "<=") left = asNumber(left) <= asNumber(right);
        else left = asNumber(left) >= asNumber(right);
        op = takeOp();
      }
      return left;
    }

    const result = parseCompare();
    return typeof result === "boolean" ? asNumber(result) : result;
  }

  return { evalAt, cellRaw };
}

export function summaryAmountAt(sheets: WorkbookSheet[], sheetName: string, label: string): number | null {
  const sheet = sheets.find((item) => item.name === sheetName);
  const ref = sheet?.cells.find((cell) => cell.ref.startsWith("A") && cell.type === "text" && cell.value === label)?.ref;
  if (!ref) return null;
  return evaluateWorkbook(sheets).evalAt(sheetName, `B${ref.slice(1)}`);
}
