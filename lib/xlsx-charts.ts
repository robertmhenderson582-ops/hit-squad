/**
 * Native Excel charts for the Cost report client package.
 * ExcelJS 4.4 has no chart API — this stamps OOXML after write.
 * Steel / amber Hit Squad palette. Series always reference workbook ranges.
 */
import JSZip from "jszip";

export const CHART_STEEL = "0F5F6D";
export const CHART_STEEL_DEEP = "083943";
export const CHART_AMBER = "E38B2A";
export const CHART_TEAL = "1A7A88";
export const CHART_CYAN = "00B0F0";
export const CHART_GOLD = "C4922A";
export const CHART_SLATE = "5B6F73";
export const CHART_MINT = "8AA3A1";

export const CHART_SLICES = [
  CHART_STEEL,
  CHART_AMBER,
  CHART_TEAL,
  CHART_STEEL_DEEP,
  CHART_CYAN,
  CHART_GOLD,
  CHART_SLATE,
  CHART_MINT,
] as const;

export type ChartKind = "line" | "pie" | "doughnut" | "bar";

export type ChartSeries = {
  name: string;
  nameRef?: string;
  valRef: string;
  color?: string;
};

export type ChartEmbed = {
  kind: ChartKind;
  title: string;
  /** Host worksheet the drawing sits on. */
  sheetName: string;
  catRef: string;
  series: ChartSeries[];
  fromCol: number;
  fromRow: number;
  toCol: number;
  toRow: number;
  showVal?: boolean;
  showPercent?: boolean;
  showCatName?: boolean;
  valFormat?: string;
  catFormat?: string;
  barDir?: "col" | "bar";
  grouping?: "clustered" | "stacked";
  /** How many pie/doughnut slices to color (defaults to 8). */
  sliceCount?: number;
};

function xmlEscape(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function nextRid(relsXml: string) {
  let max = 0;
  for (const match of relsXml.matchAll(/Id="rId(\d+)"/g)) {
    max = Math.max(max, Number(match[1]));
  }
  return `rId${max + 1}`;
}

function nextIndex(zip: JSZip, folder: string, prefix: string) {
  let max = 0;
  const re = new RegExp(`^${folder}/${prefix}(\\d+)\\.xml$`);
  for (const name of Object.keys(zip.files)) {
    const match = re.exec(name);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return max + 1;
}

function worksheetPathForSheet(workbookXml: string, workbookRels: string, sheetName: string): string | null {
  const escaped = sheetName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const sheet =
    new RegExp(`<sheet[^>]*name="${escaped}"[^>]*r:id="(rId\\d+)"`, "i").exec(workbookXml) ??
    new RegExp(`<sheet[^>]*r:id="(rId\\d+)"[^>]*name="${escaped}"`, "i").exec(workbookXml);
  if (!sheet) return null;
  const rel =
    new RegExp(`<Relationship[^>]*Id="${sheet[1]}"[^>]*Target="([^"]+)"`).exec(workbookRels) ??
    new RegExp(`<Relationship[^>]*Target="([^"]+)"[^>]*Id="${sheet[1]}"`).exec(workbookRels);
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

function upsertDrawingOnSheet(sheetXml: string, rid: string) {
  if (/<drawing\b/.test(sheetXml)) {
    return sheetXml.replace(/<drawing\b[^/]*\/>/, `<drawing r:id="${rid}"/>`);
  }
  if (/<picture\b/.test(sheetXml)) {
    return sheetXml.replace(/<picture\b/, `<drawing r:id="${rid}"/><picture`);
  }
  return sheetXml.replace("</worksheet>", `<drawing r:id="${rid}"/></worksheet>`);
}

function titleXml(title: string) {
  return `
    <c:title>
      <c:tx>
        <c:rich>
          <a:bodyPr/>
          <a:lstStyle/>
          <a:p>
            <a:pPr><a:defRPr sz="1200" b="1"/></a:pPr>
            <a:r>
              <a:rPr lang="en-US" sz="1200" b="1">
                <a:solidFill><a:srgbClr val="${CHART_STEEL}"/></a:solidFill>
                <a:latin typeface="Calibri"/>
              </a:rPr>
              <a:t>${xmlEscape(title)}</a:t>
            </a:r>
          </a:p>
        </c:rich>
      </c:tx>
      <c:overlay val="0"/>
    </c:title>`;
}

function seriesTx(series: ChartSeries) {
  if (series.nameRef) {
    return `<c:tx><c:strRef><c:f>${xmlEscape(series.nameRef)}</c:f></c:strRef></c:tx>`;
  }
  return `<c:tx><c:v>${xmlEscape(series.name)}</c:v></c:tx>`;
}

function piePoints(count: number) {
  return Array.from({ length: Math.max(1, count) }, (_, idx) => {
    const color = CHART_SLICES[idx % CHART_SLICES.length];
    return `
            <c:dPt>
              <c:idx val="${idx}"/>
              <c:bubble3D val="0"/>
              <c:spPr>
                <a:solidFill><a:srgbClr val="${color}"/></a:solidFill>
                <a:ln w="12700"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:ln>
              </c:spPr>
            </c:dPt>`;
  }).join("");
}

function dLbls(spec: ChartEmbed) {
  const showVal = spec.showVal ?? (spec.kind === "pie" || spec.kind === "doughnut");
  const showPct = spec.showPercent ?? (spec.kind === "pie" || spec.kind === "doughnut");
  const showCat = spec.showCatName ?? (spec.kind === "pie" || spec.kind === "doughnut");
  const fmt = spec.valFormat ?? (spec.kind === "pie" || spec.kind === "doughnut" ? "$#,##0" : "#,##0");
  return `
        <c:dLbls>
          <c:numFmt formatCode="${xmlEscape(fmt)}" sourceLinked="0"/>
          <c:showLegendKey val="0"/>
          <c:showVal val="${showVal ? 1 : 0}"/>
          <c:showCatName val="${showCat ? 1 : 0}"/>
          <c:showSerName val="0"/>
          <c:showPercent val="${showPct ? 1 : 0}"/>
          <c:showBubbleSize val="0"/>
          <c:showLeaderLines val="1"/>
        </c:dLbls>`;
}

function pieLikeXml(spec: ChartEmbed, doughnut: boolean) {
  const series = spec.series[0];
  if (!series) return "";
  const tag = doughnut ? "doughnutChart" : "pieChart";
  return `
      <c:${tag}>
        <c:varyColors val="1"/>
        <c:ser>
          <c:idx val="0"/>
          <c:order val="0"/>
          ${seriesTx(series)}
          ${piePoints(spec.sliceCount ?? 8)}
          <c:cat><c:strRef><c:f>${xmlEscape(spec.catRef)}</c:f></c:strRef></c:cat>
          <c:val><c:numRef><c:f>${xmlEscape(series.valRef)}</c:f></c:numRef></c:val>
        </c:ser>
        ${dLbls(spec)}
        <c:firstSliceAng val="0"/>
        ${doughnut ? '<c:holeSize val="58"/>' : ""}
      </c:${tag}>`;
}

function barXml(spec: ChartEmbed) {
  const dir = spec.barDir ?? "col";
  const grouping = spec.grouping ?? "clustered";
  const series = spec.series
    .map((item, idx) => {
      const color = item.color ?? (idx === 0 ? CHART_STEEL : CHART_AMBER);
      return `
        <c:ser>
          <c:idx val="${idx}"/>
          <c:order val="${idx}"/>
          ${seriesTx(item)}
          <c:spPr>
            <a:solidFill><a:srgbClr val="${color}"/></a:solidFill>
            <a:ln w="0"><a:noFill/></a:ln>
          </c:spPr>
          <c:cat><c:strRef><c:f>${xmlEscape(spec.catRef)}</c:f></c:strRef></c:cat>
          <c:val><c:numRef><c:f>${xmlEscape(item.valRef)}</c:f></c:numRef></c:val>
        </c:ser>`;
    })
    .join("");
  return `
      <c:barChart>
        <c:barDir val="${dir}"/>
        <c:grouping val="${grouping}"/>
        <c:varyColors val="0"/>
        ${series}
        <c:dLbls>
          <c:showVal val="${spec.showVal ? 1 : 0}"/>
          <c:showCatName val="0"/>
          <c:showSerName val="0"/>
          <c:showPercent val="0"/>
        </c:dLbls>
        <c:gapWidth val="80"/>
        <c:axId val="1"/>
        <c:axId val="2"/>
      </c:barChart>
      <c:catAx>
        <c:axId val="1"/>
        <c:scaling><c:orientation val="minMax"/></c:scaling>
        <c:delete val="0"/>
        <c:axPos val="b"/>
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
              <a:solidFill><a:srgbClr val="${CHART_MINT}"/></a:solidFill>
            </a:ln>
          </c:spPr>
        </c:majorGridlines>
        <c:numFmt formatCode="${xmlEscape(spec.valFormat ?? "$#,##0")}" sourceLinked="0"/>
        <c:majorTickMark val="out"/>
        <c:minorTickMark val="none"/>
        <c:tickLblPos val="nextTo"/>
        <c:crossAx val="1"/>
        <c:crosses val="autoZero"/>
      </c:valAx>`;
}

function lineXml(spec: ChartEmbed) {
  const series = spec.series
    .map((item, idx) => {
      const color = item.color ?? (idx === 0 ? CHART_STEEL : CHART_AMBER);
      return `
        <c:ser>
          <c:idx val="${idx}"/>
          <c:order val="${idx}"/>
          ${seriesTx(item)}
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
          <c:cat><c:strRef><c:f>${xmlEscape(spec.catRef)}</c:f></c:strRef></c:cat>
          <c:val><c:numRef><c:f>${xmlEscape(item.valRef)}</c:f></c:numRef></c:val>
          <c:smooth val="0"/>
        </c:ser>`;
    })
    .join("");
  return `
      <c:lineChart>
        <c:grouping val="standard"/>
        <c:varyColors val="0"/>
        ${series}
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
        <c:numFmt formatCode="${xmlEscape(spec.catFormat ?? "YYYY-MM-DD")}" sourceLinked="0"/>
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
              <a:solidFill><a:srgbClr val="${CHART_MINT}"/></a:solidFill>
            </a:ln>
          </c:spPr>
        </c:majorGridlines>
        <c:numFmt formatCode="${xmlEscape(spec.valFormat ?? "#,##0.0")}" sourceLinked="0"/>
        <c:majorTickMark val="out"/>
        <c:minorTickMark val="none"/>
        <c:tickLblPos val="nextTo"/>
        <c:crossAx val="1"/>
        <c:crosses val="autoZero"/>
      </c:valAx>`;
}

function plotXml(spec: ChartEmbed) {
  if (spec.kind === "pie") return pieLikeXml(spec, false);
  if (spec.kind === "doughnut") return pieLikeXml(spec, true);
  if (spec.kind === "bar") return barXml(spec);
  return lineXml(spec);
}

function chartXml(spec: ChartEmbed) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <c:roundedCorners val="0"/>
  <c:chart>
    ${titleXml(spec.title)}
    <c:autoTitleDeleted val="0"/>
    <c:plotArea>
      <c:layout/>
      ${plotXml(spec)}
      <c:spPr>
        <a:solidFill><a:srgbClr val="F7FAF9"/></a:solidFill>
        <a:ln w="6350"><a:solidFill><a:srgbClr val="${CHART_STEEL}"/></a:solidFill></a:ln>
      </c:spPr>
    </c:plotArea>
    <c:legend>
      <c:legendPos val="${spec.kind === "pie" || spec.kind === "doughnut" ? "r" : "b"}"/>
      <c:overlay val="0"/>
    </c:legend>
    <c:plotVisOnly val="1"/>
    <c:dispBlanksAs val="gap"/>
  </c:chart>
  <c:spPr>
    <a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill>
    <a:ln w="12700"><a:solidFill><a:srgbClr val="${CHART_STEEL}"/></a:solidFill></a:ln>
  </c:spPr>
</c:chartSpace>
`;
}

function anchorXml(spec: ChartEmbed, chartRid: string, name: string, id: number) {
  return `
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
        <xdr:cNvPr id="${id}" name="${xmlEscape(name)}"/>
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
  </xdr:twoCellAnchor>`;
}

/**
 * Stamp one or more charts onto an ExcelJS workbook.
 * Groups embeds by host sheet so Cover can carry four tiles and Hrs S-curve stays its own sheet.
 */
export async function embedWorkbookCharts(bytes: Uint8Array, embeds: ChartEmbed[]): Promise<Uint8Array> {
  const list = embeds.filter((item) => item.series.length && item.catRef);
  if (!list.length) return bytes;
  const zip = await JSZip.loadAsync(bytes);
  const workbook = await zip.file("xl/workbook.xml")?.async("string");
  const workbookRels = await zip.file("xl/_rels/workbook.xml.rels")?.async("string");
  if (!workbook || !workbookRels) return bytes;

  const bySheet = new Map<string, ChartEmbed[]>();
  for (const item of list) {
    const cur = bySheet.get(item.sheetName) ?? [];
    cur.push(item);
    bySheet.set(item.sheetName, cur);
  }

  let types = (await zip.file("[Content_Types].xml")?.async("string")) ?? "";

  for (const [sheetName, charts] of bySheet) {
    const sheetPath = worksheetPathForSheet(workbook, workbookRels, sheetName);
    if (!sheetPath) continue;
    const sheetXml = await zip.file(sheetPath)?.async("string");
    if (!sheetXml) continue;

    const drawingN = nextIndex(zip, "xl/drawings", "drawing");
    const drawingName = `drawing${drawingN}.xml`;
    const anchors: string[] = [];
    const rels: string[] = [];

    charts.forEach((spec, index) => {
      const chartN = nextIndex(zip, "xl/charts", "chart");
      const chartName = `chart${chartN}.xml`;
      zip.file(`xl/charts/${chartName}`, chartXml(spec));
      types = upsertContentType(
        types,
        `/xl/charts/${chartName}`,
        "application/vnd.openxmlformats-officedocument.drawingml.chart+xml",
      );
      const rid = `rId${index + 1}`;
      rels.push(
        `<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/${chartName}"/>`,
      );
      anchors.push(anchorXml(spec, rid, spec.title, index + 2));
    });

    zip.file(
      `xl/drawings/_rels/${drawingName}.rels`,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${rels.join("\n  ")}
</Relationships>
`,
    );
    zip.file(
      `xl/drawings/${drawingName}`,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
${anchors.join("\n")}
</xdr:wsDr>
`,
    );
    types = upsertContentType(
      types,
      `/xl/drawings/${drawingName}`,
      "application/vnd.openxmlformats-officedocument.drawing+xml",
    );

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
  }

  zip.file("[Content_Types].xml", types);
  return new Uint8Array(
    await zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } }),
  );
}
