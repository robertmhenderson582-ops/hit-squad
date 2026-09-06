/**
 * Native Excel line chart for the Cost report hours S-curve.
 * ExcelJS 4.4 has no first-class chart API — this stamps OOXML after write.
 * Steel = estimate (live pack). Amber = Turnip actuals. No invented series.
 */
import JSZip from "jszip";

export const S_CURVE_STEEL = "0F5F6D";
export const S_CURVE_AMBER = "E38B2A";

export type SCurveChartSpec = {
  sheetName: string;
  /** First data row (values, not the header). */
  firstRow: number;
  lastRow: number;
  /** Category column (dates). */
  catCol?: string;
  /** Cumulative estimate hours column. */
  estCol?: string;
  /** Cumulative actual hours column. */
  actCol?: string;
  /** 0-based from-col / from-row for the drawing anchor. */
  fromCol?: number;
  fromRow?: number;
  toCol?: number;
  toRow?: number;
  title?: string;
};

function xmlEscape(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function quoteSheet(name: string) {
  return /[^A-Za-z0-9]/.test(name) ? `'${name.replaceAll("'", "''")}'` : name;
}

function sheetRange(sheetName: string, col: string, first: number, last: number) {
  return `${quoteSheet(sheetName)}!$${col}$${first}:$${col}$${last}`;
}

function nextRid(relsXml: string) {
  let max = 0;
  for (const match of relsXml.matchAll(/Id="rId(\d+)"/g)) {
    max = Math.max(max, Number(match[1]));
  }
  return `rId${max + 1}`;
}

function chartXml(spec: Required<Pick<SCurveChartSpec, "sheetName" | "firstRow" | "lastRow" | "catCol" | "estCol" | "actCol" | "title">>) {
  const cats = sheetRange(spec.sheetName, spec.catCol, spec.firstRow, spec.lastRow);
  const est = sheetRange(spec.sheetName, spec.estCol, spec.firstRow, spec.lastRow);
  const act = sheetRange(spec.sheetName, spec.actCol, spec.firstRow, spec.lastRow);
  const estTx = `${quoteSheet(spec.sheetName)}!$${spec.estCol}$6`;
  const actTx = `${quoteSheet(spec.sheetName)}!$${spec.actCol}$6`;
  const series = (
    idx: number,
    nameRef: string,
    valRef: string,
    color: string,
  ) => `
        <c:ser>
          <c:idx val="${idx}"/>
          <c:order val="${idx}"/>
          <c:tx><c:strRef><c:f>${xmlEscape(nameRef)}</c:f></c:strRef></c:tx>
          <c:spPr>
            <a:ln w="25400">
              <a:solidFill><a:srgbClr val="${color}"/></a:solidFill>
              <a:prstDash val="solid"/>
            </a:ln>
          </c:spPr>
          <c:marker>
            <c:symbol val="circle"/>
            <c:size val="6"/>
            <c:spPr>
              <a:solidFill><a:srgbClr val="${color}"/></a:solidFill>
              <a:ln><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></a:ln>
            </c:spPr>
          </c:marker>
          <c:cat><c:strRef><c:f>${xmlEscape(cats)}</c:f></c:strRef></c:cat>
          <c:val><c:numRef><c:f>${xmlEscape(valRef)}</c:f></c:numRef></c:val>
          <c:smooth val="0"/>
        </c:ser>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <c:roundedCorners val="0"/>
  <c:chart>
    <c:title>
      <c:tx>
        <c:rich>
          <a:bodyPr/>
          <a:lstStyle/>
          <a:p>
            <a:pPr><a:defRPr sz="1400" b="1"/></a:pPr>
            <a:r>
              <a:rPr lang="en-US" sz="1400" b="1">
                <a:solidFill><a:srgbClr val="${S_CURVE_STEEL}"/></a:solidFill>
                <a:latin typeface="Calibri"/>
              </a:rPr>
              <a:t>${xmlEscape(spec.title)}</a:t>
            </a:r>
          </a:p>
        </c:rich>
      </c:tx>
      <c:overlay val="0"/>
    </c:title>
    <c:autoTitleDeleted val="0"/>
    <c:plotArea>
      <c:layout/>
      <c:lineChart>
        <c:grouping val="standard"/>
        <c:varyColors val="0"/>
        ${series(0, estTx, est, S_CURVE_STEEL)}
        ${series(1, actTx, act, S_CURVE_AMBER)}
        <c:marker val="1"/>
        <c:smooth val="0"/>
        <c:axId val="1"/>
        <c:axId val="2"/>
      </c:lineChart>
      <c:catAx>
        <c:axId val="1"/>
        <c:scaling><c:orientation val="minMax"/></c:scaling>
        <c:delete val="0"/>
        <c:axPos val="b"/>
        <c:numFmt formatCode="YYYY-MM-DD" sourceLinked="0"/>
        <c:majorTickMark val="out"/>
        <c:minorTickMark val="none"/>
        <c:tickLblPos val="nextTo"/>
        <c:crossAx val="2"/>
        <c:crosses val="autoZero"/>
        <c:auto val="1"/>
        <c:lblAlgn val="ctr"/>
        <c:lblOffset val="100"/>
      </c:catAx>
      <c:valAx>
        <c:axId val="2"/>
        <c:scaling><c:orientation val="minMax"/></c:scaling>
        <c:delete val="0"/>
        <c:axPos val="l"/>
        <c:majorGridlines>
          <c:spPr>
            <a:ln w="6350">
              <a:solidFill><a:srgbClr val="8AA3A1"/></a:solidFill>
            </a:ln>
          </c:spPr>
        </c:majorGridlines>
        <c:numFmt formatCode="#,##0.0" sourceLinked="0"/>
        <c:majorTickMark val="out"/>
        <c:minorTickMark val="none"/>
        <c:tickLblPos val="nextTo"/>
        <c:crossAx val="1"/>
        <c:crosses val="autoZero"/>
      </c:valAx>
      <c:spPr>
        <a:solidFill><a:srgbClr val="F7FAF9"/></a:solidFill>
        <a:ln w="6350"><a:solidFill><a:srgbClr val="0F5F6D"/></a:solidFill></a:ln>
      </c:spPr>
    </c:plotArea>
    <c:legend>
      <c:legendPos val="b"/>
      <c:overlay val="0"/>
    </c:legend>
    <c:plotVisOnly val="1"/>
    <c:dispBlanksAs val="gap"/>
  </c:chart>
  <c:spPr>
    <a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill>
    <a:ln w="12700"><a:solidFill><a:srgbClr val="${S_CURVE_STEEL}"/></a:solidFill></a:ln>
  </c:spPr>
</c:chartSpace>
`;
}

function drawingXml(spec: Required<Pick<SCurveChartSpec, "fromCol" | "fromRow" | "toCol" | "toRow">>, chartRid: string) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <xdr:twoCellAnchor>
    <xdr:from>
      <xdr:col>${spec.fromCol}</xdr:col>
      <xdr:colOff>0</xdr:colOff>
      <xdr:row>${spec.fromRow}</xdr:row>
      <xdr:rowOff>0</xdr:rowOff>
    </xdr:from>
    <xdr:to>
      <xdr:col>${spec.toCol}</xdr:col>
      <xdr:colOff>0</xdr:colOff>
      <xdr:row>${spec.toRow}</xdr:row>
      <xdr:rowOff>0</xdr:rowOff>
    </xdr:to>
    <xdr:graphicFrame macro="">
      <xdr:nvGraphicFramePr>
        <xdr:cNvPr id="2" name="Hours S-curve"/>
        <xdr:cNvGraphicFramePr>
          <a:graphicFrameLocks noGrp="1"/>
        </xdr:cNvGraphicFramePr>
      </xdr:nvGraphicFramePr>
      <xdr:xfrm>
        <a:off x="0" y="0"/>
        <a:ext cx="0" cy="0"/>
      </xdr:xfrm>
      <a:graphic>
        <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">
          <c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="${chartRid}"/>
        </a:graphicData>
      </a:graphic>
    </xdr:graphicFrame>
    <xdr:clientData/>
  </xdr:twoCellAnchor>
</xdr:wsDr>
`;
}

function drawingRels(chartPath: string) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="${chartPath}"/>
</Relationships>
`;
}

function worksheetPathForSheet(workbookXml: string, workbookRels: string, sheetName: string): string | null {
  const escaped = sheetName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const sheet = new RegExp(`<sheet[^>]*name="${escaped}"[^>]*r:id="(rId\\d+)"`, "i").exec(workbookXml)
    ?? new RegExp(`<sheet[^>]*r:id="(rId\\d+)"[^>]*name="${escaped}"`, "i").exec(workbookXml);
  if (!sheet) return null;
  const rel = new RegExp(`<Relationship[^>]*Id="${sheet[1]}"[^>]*Target="([^"]+)"`).exec(workbookRels)
    ?? new RegExp(`<Relationship[^>]*Target="([^"]+)"[^>]*Id="${sheet[1]}"`).exec(workbookRels);
  if (!rel) return null;
  const target = rel[1].replace(/^\//, "");
  return target.startsWith("xl/") ? target : `xl/${target.replace(/^\.\.\//, "")}`;
}

function upsertContentType(typesXml: string, partName: string, contentType: string) {
  if (typesXml.includes(`PartName="${partName}"`)) return typesXml;
  return typesXml.replace(
    "</Types>",
    `<Override PartName="${partName}" ContentType="${contentType}"/></Types>`,
  );
}

function upsertDrawingOnSheet(sheetXml: string, rid: string) {
  if (/<drawing\b/.test(sheetXml)) {
    return sheetXml.replace(/<drawing\b[^/]*\/>/, `<drawing r:id="${rid}"/>`);
  }
  if (/<picture\b/.test(sheetXml)) {
    return sheetXml.replace(/<picture\b/, `<drawing r:id="${rid}"/><picture`);
  }
  return sheetXml.replace("</worksheet>", `<drawing r:id="${rid}"/></worksheet>`);
}

function upsertRel(relsXml: string, rid: string, type: string, target: string) {
  if (relsXml.includes(`Id="${rid}"`)) {
    return relsXml.replace(new RegExp(`<Relationship[^>]*Id="${rid}"[^/]*/>`), "");
  }
  const rel = `<Relationship Id="${rid}" Type="${type}" Target="${target}"/>`;
  if (!relsXml.includes("<Relationships")) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rel}</Relationships>
`;
  }
  return relsXml.replace("</Relationships>", `${rel}</Relationships>`);
}

/** Embed a steel/amber cumulative-hours line chart. No-op when the range is empty. */
export async function embedHoursSCurveChart(bytes: Uint8Array, spec: SCurveChartSpec): Promise<Uint8Array> {
  if (spec.lastRow < spec.firstRow) return bytes;
  const zip = await JSZip.loadAsync(bytes);
  const workbook = await zip.file("xl/workbook.xml")?.async("string");
  const workbookRels = await zip.file("xl/_rels/workbook.xml.rels")?.async("string");
  if (!workbook || !workbookRels) return bytes;
  const sheetPath = worksheetPathForSheet(workbook, workbookRels, spec.sheetName);
  if (!sheetPath) return bytes;
  const sheetXml = await zip.file(sheetPath)?.async("string");
  if (!sheetXml) return bytes;

  const chartName = "chart1.xml";
  const drawingName = "drawing1.xml";
  const resolved: Required<SCurveChartSpec> = {
    sheetName: spec.sheetName,
    firstRow: spec.firstRow,
    lastRow: spec.lastRow,
    catCol: spec.catCol ?? "A",
    estCol: spec.estCol ?? "D",
    actCol: spec.actCol ?? "E",
    fromCol: spec.fromCol ?? 0,
    fromRow: spec.fromRow ?? spec.lastRow + 1,
    toCol: spec.toCol ?? 7,
    toRow: spec.toRow ?? spec.lastRow + 17,
    title: spec.title ?? "Hours S-curve — estimate vs actuals",
  };

  zip.file(`xl/charts/${chartName}`, chartXml(resolved));
  zip.file(
    `xl/drawings/_rels/${drawingName}.rels`,
    drawingRels(`../charts/${chartName}`),
  );
  zip.file(`xl/drawings/${drawingName}`, drawingXml(resolved, "rId1"));

  const relsPath = sheetPath.replace(/worksheets\/([^/]+)$/, "worksheets/_rels/$1.rels");
  const existingRels = (await zip.file(relsPath)?.async("string")) ?? "";
  const drawingRid = nextRid(existingRels || "");
  zip.file(
    relsPath,
    upsertRel(
      existingRels,
      drawingRid,
      "http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing",
      `../drawings/${drawingName}`,
    ),
  );
  zip.file(sheetPath, upsertDrawingOnSheet(sheetXml, drawingRid));

  const typesPath = "[Content_Types].xml";
  const types = await zip.file(typesPath)?.async("string");
  if (types) {
    let next = upsertContentType(
      types,
      "/xl/drawings/drawing1.xml",
      "application/vnd.openxmlformats-officedocument.drawing+xml",
    );
    next = upsertContentType(
      next,
      "/xl/charts/chart1.xml",
      "application/vnd.openxmlformats-officedocument.drawingml.chart+xml",
    );
    zip.file(typesPath, next);
  }

  return new Uint8Array(
    await zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } }),
  );
}
