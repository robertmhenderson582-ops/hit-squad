import { NextResponse } from "next/server";
import { buildRateVaultWorkshop, findSeedRateVaultSource } from "@/lib/rate-vault-library";
import { enrichReviewWithPreview, resolveRateVaultPreview } from "@/lib/rate-vault-preview";
import { parseConfirmReview, recognizeRateVaultSource } from "@/lib/rate-vault-recognize";
import { requireRateVault } from "@/lib/rate-vault-server";
import {
  RATE_VAULT_B1_BOOK_MIX_ERROR,
  RATE_VAULT_B1_OCIP_MIX_ERROR,
  isRateVaultBookFace,
  isRateVaultSiteId,
  packageBookFace,
  stubPublishRateVault,
  type RateVaultBookFace,
  type RateVaultOcipFace,
  type RateVaultPreviewPackage,
  type RateVaultRecognitionReview,
} from "@/lib/rate-vault";
import {
  inferRateVaultBookFace,
  mergePreviewFace,
  previewHasLaneBlend,
  rateVaultImportMergeFace,
} from "@/lib/rate-vault-preview";
import { applyB1LineControlsToPreview } from "@/lib/rate-vault-b1";
import { parseRateVaultB1LinePatch } from "@/lib/rate-vault-b1-options";
import { parseRateVaultB1Xlsx, rateVaultPreviewToXlsx, RATE_VAULT_B1_MIME } from "@/lib/rate-vault-xlsx";
import {
  addRateVaultOwnerSource,
  confirmRateVaultReview,
  decideRateVaultBuyoff,
  getRateVaultPackage,
  listRateVaultBuyoffs,
  listRateVaultOverrides,
  listRateVaultOwnerLibrary,
  listRateVaultReviews,
  listRateVaultVersions,
  organizeRateVaultSource,
  queueRateVaultBuyoff,
  restoreRateVaultLastGood,
  upsertRateVaultPackage,
} from "@/lib/rate-vault-store";

export const dynamic = "force-dynamic";

function parseBookFace(value: unknown): RateVaultBookFace {
  return isRateVaultBookFace(value) ? value : "rrff";
}

function optionalBookFace(value: unknown): RateVaultBookFace | null {
  return isRateVaultBookFace(value) ? value : null;
}

async function livePreview(input: {
  siteId?: string | null;
  bookFace?: RateVaultBookFace | null;
  review?: RateVaultRecognitionReview | null;
  source?: NonNullable<Parameters<typeof resolveRateVaultPreview>[0]>["source"];
  preview?: RateVaultPreviewPackage | null;
}) {
  if (input.preview) return input.preview;
  const siteId = input.siteId ?? input.review?.guessedSiteId ?? input.source?.siteId ?? "wood-river";
  const book =
    input.bookFace ??
    inferRateVaultBookFace(input.source) ??
    inferRateVaultBookFace({
      id: input.review?.sourceId,
      title: input.review?.fileName,
      fileName: input.review?.fileName,
      kind: input.review?.guessedKind,
      siteId: input.review?.guessedSiteId,
    });
  const stored = await getRateVaultPackage(siteId, book);
  if (stored) return stored;
  return resolveRateVaultPreview({
    siteId,
    bookFace: book,
    review: input.review,
    source: input.source,
  });
}

async function workshopPayload(
  review: RateVaultRecognitionReview | null = null,
  preview?: RateVaultPreviewPackage | null,
  bookFace: RateVaultBookFace = "rrff",
) {
  const [extras, reviews, overrides] = await Promise.all([
    listRateVaultOwnerLibrary(),
    listRateVaultReviews(),
    listRateVaultOverrides(),
  ]);
  const resolved = preview !== undefined ? preview : await livePreview({ review, bookFace });
  const workshop = buildRateVaultWorkshop(extras, reviews, review, overrides, resolved);
  const rrff =
    packageBookFace(resolved) === "rrff" && resolved
      ? resolved
      : await livePreview({ siteId: resolved?.siteId || "wood-river", bookFace: "rrff" });
  const tm =
    packageBookFace(resolved) === "tm" && resolved
      ? resolved
      : await livePreview({ siteId: resolved?.siteId || "wood-river", bookFace: "tm" });
  workshop.bookPreviews = { rrff, tm };
  workshop.buyoffs = await listRateVaultBuyoffs();
  return workshop;
}

export async function GET(request: Request) {
  const { error } = await requireRateVault(request);
  if (error) return error;
  const url = new URL(request.url);
  const bookFace = parseBookFace(url.searchParams.get("bookFace"));
  const workshop = await workshopPayload(null, undefined, bookFace);
  return NextResponse.json({
    workshop,
    versions: await listRateVaultVersions(workshop.preview?.siteId || "wood-river", bookFace),
    buyoffs: workshop.buyoffs,
  });
}

export async function POST(request: Request) {
  const { error, user } = await requireRateVault(request);
  if (error) return error;
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    title?: string;
    driveId?: string;
    kind?: string;
    siteId?: string;
    craft?: string;
    local?: string;
    note?: string;
    driveKind?: string;
    fileName?: string;
    type?: string;
    data?: string;
    sourceId?: string;
    review?: Record<string, unknown>;
    ocipFace?: string;
    bookFace?: string;
    confirmOcipMix?: boolean;
    confirmBookMix?: boolean;
    versionNote?: string;
    buyoffId?: string;
    buyoffAction?: string;
    lineId?: string;
    patch?: Record<string, unknown>;
  };
  const action = body.action || "";

  if (action === "organize-source") {
    const moved = await organizeRateVaultSource({
      sourceId: body.sourceId,
      siteId: body.siteId,
      kind: body.kind,
    });
    if (!moved.ok) return NextResponse.json({ error: moved.error }, { status: moved.status });
    return NextResponse.json({ override: moved.override, workshop: await workshopPayload() });
  }

  if (action === "publish") {
    return NextResponse.json({ publish: stubPublishRateVault(), workshop: await workshopPayload() });
  }

  if (action === "load-preview") {
    const siteId = isRateVaultSiteId(body.siteId) ? body.siteId : "wood-river";
    const bookFace = parseBookFace(body.bookFace);
    const preview = await livePreview({ siteId, bookFace });
    return NextResponse.json({
      preview,
      workshop: await workshopPayload(null, preview, bookFace),
      versions: await listRateVaultVersions(siteId, bookFace),
    });
  }

  if (action === "export-b1") {
    const siteId = isRateVaultSiteId(body.siteId) ? body.siteId : "wood-river";
    const bookFace = parseBookFace(body.bookFace);
    const preview = await livePreview({ siteId, bookFace });
    if (!preview) {
      return NextResponse.json({ error: "No B-1 package for that site yet." }, { status: 404 });
    }
    const face: RateVaultOcipFace | undefined = body.ocipFace === "ocip" || body.ocipFace === "non-ocip" ? body.ocipFace : undefined;
    const exported = await rateVaultPreviewToXlsx(preview, { ocipFace: face });
    return NextResponse.json({
      fileName: exported.fileName,
      type: RATE_VAULT_B1_MIME,
      data: Buffer.from(exported.bytes).toString("base64"),
      preview,
      workshop: await workshopPayload(null, preview, bookFace),
    });
  }

  if (action === "import-b1") {
    const imported = await parseRateVaultB1Xlsx({
      fileName: body.fileName,
      type: body.type,
      data: body.data,
    });
    if (!imported.ok) {
      if (imported.code === "not-vault-b1") {
        return NextResponse.json({ fallback: "recognize", error: imported.error });
      }
      return NextResponse.json({ error: imported.error, code: imported.code }, { status: 400 });
    }
    const viewFace: RateVaultOcipFace | null =
      body.ocipFace === "ocip" || body.ocipFace === "non-ocip" ? body.ocipFace : null;
    const fileFace = imported.preview.ocipFace === "ocip" || imported.preview.ocipFace === "non-ocip" ? imported.preview.ocipFace : null;
    if (viewFace && fileFace && viewFace !== fileFace && !body.confirmOcipMix) {
      return NextResponse.json(
        { error: RATE_VAULT_B1_OCIP_MIX_ERROR, code: "ocip-mix", needsConfirm: true },
        { status: 400 },
      );
    }
    const viewBook = parseBookFace(body.bookFace);
    const fileBook = packageBookFace(imported.preview);
    if (viewBook !== fileBook && !body.confirmBookMix) {
      return NextResponse.json(
        { error: RATE_VAULT_B1_BOOK_MIX_ERROR, code: "book-mix", needsConfirm: true },
        { status: 400 },
      );
    }
    const tagged = { ...imported.preview, bookFace: viewBook };
    const stored = await getRateVaultPackage(imported.preview.siteId, viewBook);
    if (previewHasLaneBlend(stored, tagged)) {
      return NextResponse.json(
        { error: "Merit and union lanes stay separate. The package was not applied.", code: "invalid" },
        { status: 400 },
      );
    }
    const merged = mergePreviewFace(stored, tagged, rateVaultImportMergeFace(imported.preview));
    const saved = await upsertRateVaultPackage(merged, typeof body.versionNote === "string" ? body.versionNote : "Imported B-1 Excel");
    if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: saved.status });
    await queueRateVaultBuyoff(saved.preview, saved.preview.version?.note || "Imported B-1 Excel");
    return NextResponse.json({
      preview: saved.preview,
      versions: await listRateVaultVersions(saved.preview.siteId, viewBook),
      buyoffs: await listRateVaultBuyoffs(),
      workshop: await workshopPayload(null, saved.preview, viewBook),
    });
  }

  if (action === "decide-buyoff") {
    const decided = await decideRateVaultBuyoff({
      id: body.buyoffId || body.sourceId,
      action: body.buyoffAction || body.kind,
      note: body.note,
      decidedBy: user?.email || user?.name || "owner",
    });
    if (!decided.ok) return NextResponse.json({ error: decided.error }, { status: decided.status });
    return NextResponse.json({
      buyoff: decided.buyoff,
      writesRateBook: false,
      buyoffs: await listRateVaultBuyoffs(),
      workshop: await workshopPayload(),
    });
  }

  if (action === "patch-b1-line") {
    const siteId = isRateVaultSiteId(body.siteId) ? body.siteId : "wood-river";
    const bookFace = parseBookFace(body.bookFace);
    const lineId = typeof body.lineId === "string" ? body.lineId.trim() : "";
    if (!lineId) return NextResponse.json({ error: "B-1 line id is required." }, { status: 400 });
    const preview = await livePreview({ siteId, bookFace });
    if (!preview) {
      return NextResponse.json({ error: "No B-1 package for that site yet." }, { status: 404 });
    }
    const exists =
      preview.fringes.some((line) => line.id === lineId) ||
      preview.burden.some((line) => line.id === lineId) ||
      preview.craftSheets.some(
        (sheet) => sheet.fringes.some((line) => line.id === lineId) || sheet.burden.some((line) => line.id === lineId),
      );
    if (!exists) return NextResponse.json({ error: "That B-1 line is not on this package." }, { status: 400 });
    const next = applyB1LineControlsToPreview(preview, lineId, parseRateVaultB1LinePatch(body.patch));
    const saved = await upsertRateVaultPackage(
      {
        ...next,
        fixture: false,
        extractedFrom: preview.extractedFrom === "demo-seed" || preview.fixture ? "vault-b1-controls" : preview.extractedFrom,
      },
      "B-1 line controls",
    );
    if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: saved.status });
    return NextResponse.json({
      preview: saved.preview,
      versions: await listRateVaultVersions(saved.preview.siteId, bookFace),
      workshop: await workshopPayload(null, saved.preview, bookFace),
    });
  }

  if (action === "restore-b1") {
    const siteId = isRateVaultSiteId(body.siteId) ? body.siteId : "wood-river";
    const bookFace = parseBookFace(body.bookFace);
    const restored = await restoreRateVaultLastGood(siteId, bookFace);
    if (!restored.ok) return NextResponse.json({ error: restored.error }, { status: restored.status });
    return NextResponse.json({
      preview: restored.preview,
      versions: await listRateVaultVersions(siteId, bookFace),
      workshop: await workshopPayload(null, restored.preview, bookFace),
    });
  }

  if (action === "add-source") {
    const saved = await addRateVaultOwnerSource({
      title: body.title,
      driveId: body.driveId,
      kind: body.kind,
      siteId: body.siteId,
      craft: body.craft,
      local: body.local,
      note: body.note,
      driveKind: body.driveKind,
    });
    if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: saved.status });
    return NextResponse.json({ source: saved.entry, workshop: await workshopPayload() });
  }

  if (action === "recognize") {
    const linked = typeof body.driveId === "string" ? findSeedRateVaultSource(body.driveId) : null;
    const recognized = await recognizeRateVaultSource({
      fileName: body.fileName || linked?.title,
      type: body.type,
      data: body.data,
      driveId: body.driveId || linked?.driveId,
      sourceId: body.sourceId || linked?.id,
    });
    if ("error" in recognized) {
      return NextResponse.json({ error: recognized.error }, { status: recognized.status });
    }
    const bookFace =
      optionalBookFace(body.bookFace) ||
      inferRateVaultBookFace(
        linked || {
          id: recognized.sourceId,
          title: recognized.fileName,
          fileName: recognized.fileName,
          kind: recognized.guessedKind,
          siteId: recognized.guessedSiteId,
        },
      );
    const preview = await livePreview({ review: recognized, source: linked, bookFace });
    const review = enrichReviewWithPreview(recognized, preview);
    return NextResponse.json({ review, preview, workshop: await workshopPayload(review, preview, bookFace) });
  }

  if (action === "confirm") {
    const extras = await listRateVaultOwnerLibrary();
    const linked =
      (typeof body.sourceId === "string" && extras.find((row) => row.id === body.sourceId)) ||
      (typeof body.driveId === "string" ? findSeedRateVaultSource(body.driveId) : null);
    const recognized = await recognizeRateVaultSource({
      fileName: body.fileName || linked?.title,
      type: body.type,
      driveId: body.driveId || linked?.driveId,
      sourceId: body.sourceId || linked?.id,
    });
    if ("error" in recognized) {
      return NextResponse.json({ error: recognized.error }, { status: recognized.status });
    }
    const parsed = parseConfirmReview(body.review ?? body, recognized);
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
    if (typeof body.driveId === "string" && body.driveId.trim() && !body.driveId.startsWith("upload:")) {
      await addRateVaultOwnerSource({
        id: parsed.sourceId,
        title: body.fileName || linked?.title || parsed.sourceId,
        driveId: body.driveId,
        kind: parsed.kind,
        siteId: parsed.siteId,
        craft: parsed.craft,
        local: parsed.local,
        note: "Confirmed from Rate Vault recognition. Metadata only.",
      });
    }
    const bookFace = inferRateVaultBookFace(linked || {
      id: recognized.sourceId,
      title: recognized.fileName,
      fileName: recognized.fileName,
      kind: recognized.guessedKind,
      siteId: parsed.siteId,
    });
    const preview = await livePreview({
      review: recognized,
      source: linked,
      siteId: parsed.siteId,
      bookFace,
    });
    const review = enrichReviewWithPreview(recognized, preview);
    const confirmed = await confirmRateVaultReview(parsed);
    return NextResponse.json({
      review,
      preview,
      confirmed,
      writesRateBook: false,
      workshop: await workshopPayload(review, preview, bookFace),
    });
  }

  return NextResponse.json({ error: "Unknown Rate Vault action." }, { status: 400 });
}
