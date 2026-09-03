/** Minimal OOXML .xlsx writer (ZIP store). Excel-strict package. No workbooks in git. */

const EXCEL_SHEET_NAME_ILLEGAL = /[:\\/?*[\]&]/g;
const XML_ILLEGAL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let crc = i;
    for (let j = 0; j < 8; j += 1) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    table[i] = crc >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(value: number): Uint8Array {
  const out = new Uint8Array(2);
  out[0] = value & 0xff;
  out[1] = (value >>> 8) & 0xff;
  return out;
}

function u32(value: number): Uint8Array {
  const out = new Uint8Array(4);
  out[0] = value & 0xff;
  out[1] = (value >>> 8) & 0xff;
  out[2] = (value >>> 16) & 0xff;
  out[3] = (value >>> 24) & 0xff;
  return out;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const size = parts.reduce((n, part) => n + part.length, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

type ZipEntry = { name: string; data: Uint8Array };

/** MS-DOS date/time. Excel rejects a 0/0 stamp on some packages. */
export function dosDateTime(now = new Date()): { time: number; date: number } {
  const year = Math.max(1980, Math.min(2107, now.getFullYear()));
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const seconds = Math.floor(now.getSeconds() / 2);
  return {
    time: (hours << 11) | (minutes << 5) | seconds,
    date: ((year - 1980) << 9) | (month << 5) | day,
  };
}

function zipStore(files: ZipEntry[], stamped = dosDateTime()): Uint8Array {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  const nameEnc = new TextEncoder();
  const { time, date } = stamped;
  const stamp = time || date ? { time, date } : dosDateTime(new Date(2026, 8, 3, 12, 0, 0));

  for (const file of files) {
    const name = nameEnc.encode(file.name);
    const crc = crc32(file.data);
    const local = concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(stamp.time),
      u16(stamp.date),
      u32(crc),
      u32(file.data.length),
      u32(file.data.length),
      u16(name.length),
      u16(0),
      name,
      file.data,
    ]);
    const central = concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(0),
      u16(stamp.time),
      u16(stamp.date),
      u32(crc),
      u32(file.data.length),
      u32(file.data.length),
      u16(name.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      name,
    ]);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }

  const centralDir = concat(centrals);
  const eocd = concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(centralDir.length),
    u32(offset),
    u16(0),
  ]);
  return concat([...locals, centralDir, eocd]);
}

export function stripXmlIllegal(value: string): string {
  return value.replace(XML_ILLEGAL, "");
}

/** Text nodes: only & < >. Quotes stay as quotes so Excel does not repair inlineStr. */
export function xmlEscape(value: string): string {
  return stripXmlIllegal(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function xmlAttrEscape(value: string): string {
  return xmlEscape(value).replaceAll('"', "&quot;");
}

/** Excel sheet names cannot contain : \ / ? * [ ] and this package also drops &. */
export function excelSafeSheetName(name = ""): string {
  const cleaned = stripXmlIllegal(name)
    .replace(EXCEL_SHEET_NAME_ILLEGAL, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^'+|'+$/g, "");
  const sliced = cleaned.slice(0, 31).replace(/^'+|'+$/g, "");
  return sliced || "Sheet";
}

export function colLetter(index: number): string {
  let n = index;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

export type SheetCell =
  | { ref: string; type: "text"; value: string }
  | { ref: string; type: "number"; value: number }
  | { ref: string; type: "formula"; value: string };

export function buildSheetXml(cells: SheetCell[], merges: string[] = []): string {
  const byRow = new Map<number, SheetCell[]>();
  for (const cell of cells) {
    const row = Number(/(\d+)$/.exec(cell.ref)?.[1] || 0);
    const list = byRow.get(row) ?? [];
    list.push(cell);
    byRow.set(row, list);
  }
  const rows = [...byRow.keys()].sort((a, b) => a - b);
  const rowXml = rows
    .map((row) => {
      const items = (byRow.get(row) ?? [])
        .slice()
        .sort((a, b) => a.ref.localeCompare(b.ref, "en", { numeric: true }));
      const inner = items
        .map((cell) => {
          if (cell.type === "text") {
            return `<c r="${cell.ref}" t="inlineStr"><is><t>${xmlEscape(cell.value)}</t></is></c>`;
          }
          if (cell.type === "number") {
            return `<c r="${cell.ref}"><v>${cell.value}</v></c>`;
          }
          return `<c r="${cell.ref}"><f>${xmlEscape(cell.value)}</f></c>`;
        })
        .join("");
      return `<row r="${row}">${inner}</row>`;
    })
    .join("");
  const mergeXml = merges.length
    ? `<mergeCells count="${merges.length}">${merges.map((ref) => `<mergeCell ref="${ref}"/>`).join("")}</mergeCells>`
    : "";
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetData>${rowXml}</sheetData>${mergeXml}</worksheet>`
  );
}

export type WorkbookSheet = {
  name: string;
  cells: SheetCell[];
  merges?: string[];
};

const STYLES_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
  `<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>` +
  `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
  `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  `<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>` +
  `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
  `</styleSheet>`;

const CORE_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
  `<dc:creator>Hit Squad Project Controls</dc:creator>` +
  `<cp:lastModifiedBy>Hit Squad Project Controls</cp:lastModifiedBy>` +
  `</cp:coreProperties>`;

const APP_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">` +
  `<Application>Hit Squad Project Controls</Application>` +
  `</Properties>`;

export function buildWorkbook(sheets: WorkbookSheet[]): Uint8Array {
  const list = sheets.filter((sheet) => sheet.name.trim());
  if (!list.length) throw new Error("empty-workbook");
  const enc = new TextEncoder();
  const used = new Set<string>();
  const named = list.map((sheet, index) => {
    const raw = excelSafeSheetName(sheet.name || `Sheet${index + 1}`);
    let name = raw;
    let n = 2;
    while (used.has(name.toLowerCase())) {
      const suffix = `-${n}`;
      name = `${raw.slice(0, Math.max(1, 31 - suffix.length))}${suffix}`;
      n += 1;
    }
    used.add(name.toLowerCase());
    return { ...sheet, safeName: name };
  });
  const stylesRid = `rId${named.length + 1}`;
  const overrides = named
    .map(
      (_, index) =>
        `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    )
    .join("");
  const sheetIndex = named
    .map((sheet, index) => `<sheet name="${xmlAttrEscape(sheet.safeName)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`)
    .join("");
  const sheetRels = named
    .map(
      (_, index) =>
        `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
    )
    .join("");
  const styleRel = `<Relationship Id="${stylesRid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`;
  return zipStore([
    {
      name: "[Content_Types].xml",
      data: enc.encode(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
          `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
          `<Default Extension="xml" ContentType="application/xml"/>` +
          `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
          `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
          `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>` +
          `<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>` +
          overrides +
          `</Types>`,
      ),
    },
    {
      name: "_rels/.rels",
      data: enc.encode(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
          `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>` +
          `<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>` +
          `</Relationships>`,
      ),
    },
    { name: "docProps/core.xml", data: enc.encode(CORE_XML) },
    { name: "docProps/app.xml", data: enc.encode(APP_XML) },
    {
      name: "xl/workbook.xml",
      data: enc.encode(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
          `<fileVersion appName="xl"/>` +
          `<workbookPr/>` +
          `<sheets>${sheetIndex}</sheets>` +
          `<calcPr calcId="124519"/>` +
          `</workbook>`,
      ),
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: enc.encode(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Relationships xmlns="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
          `${sheetRels}${styleRel}` +
          `</Relationships>`,
      ),
    },
    { name: "xl/styles.xml", data: enc.encode(STYLES_XML) },
    ...named.map((sheet, index) => ({
      name: `xl/worksheets/sheet${index + 1}.xml`,
      data: enc.encode(buildSheetXml(sheet.cells, sheet.merges ?? [])),
    })),
  ]);
}

export function buildXlsx(sheetName: string, cells: SheetCell[], merges: string[] = []): Uint8Array {
  return buildWorkbook([{ name: sheetName, cells, merges }]);
}

export function downloadXlsx(filename: string, bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy.buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
