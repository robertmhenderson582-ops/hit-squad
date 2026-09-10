import { NextResponse } from "next/server";
import { buildRateVaultWorkshop, findSeedRateVaultSource } from "@/lib/rate-vault-library";
import { enrichReviewWithPreview, resolveRateVaultPreview } from "@/lib/rate-vault-preview";
import { parseConfirmReview, recognizeRateVaultSource } from "@/lib/rate-vault-recognize";
import { requireRateVault } from "@/lib/rate-vault-server";
import {
  RATE_VAULT_B1_OCIP_MIX_ERROR,
  isRateVaultSiteId,
  stubPublishRateVault,
  type RateVaultOcipFace,
  type RateVaultPreviewPackage,
  type RateVaultRecognitionReview,
} from "@/lib/rate-vault";
import { mergePreviewFace, previewHasLaneBlend } from "@/lib/rate-vault-preview";
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

async function livePreview(input: {
  siteId?: string | null;
  review?: RateVaultRecognitionReview | null;
  source?: NonNullable<Parameters<typeof resolveRateVaultPreview>[0]>["source"];
  preview?: RateVaultPreviewPackage | null;
}) {
  if (input.preview) return input.preview;
  const siteId = input.siteId ?? input.review?.guessedSiteId ?? input.source?.siteId ?? "wood-river";
  const stored = await getRateVaultPackage(siteId);
  if (stored) return stored;
  return resolveRateVaultPreview({
    siteId,
    review: input.review,
    source: input.source,
  });
}

async function workshopPayload(
  review: RateVaultRecognitionReview | null = null,
  preview?: RateVaultPreviewPackage | null,
) {
  const [extras, reviews, overrides] = await Promise.all([
    listRateVaultOwnerLibrary(),
    listRateVaultReviews(),
    listRateVaultOverrides(),
  ]);
  const resolved = preview !== undefined ? preview : await livePreview({ review });
  const workshop = buildRateVaultWorkshop(extras, reviews, review, overrides, resolved);
  workshop.buyoffs = await listRateVaultBuyoffs();
  return workshop;
}

export async function GET(request: Request) {
  const { error } = await requireRateVault(request);
  if (error) return error;
  const workshop = await workshopPayload();
  return NextResponse.json({
    workshop,
    versions: await listRateVaultVersions(workshop.preview?.siteId || "wood-river"),
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
    confirmOcipMix?: boolean;
    versionNote?: string;
    buyoffId?: string;
    buyoffAction?: string;
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

  if (action === "export-b1") {
    const siteId = isRateVaultSiteId(body.siteId) ? body.siteId : "wood-river";
    const preview = await livePreview({ siteId });
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
      workshop: await workshopPayload(null, preview),
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
    const stored = await getRateVaultPackage(imported.preview.siteId);
    if (previewHasLaneBlend(stored, imported.preview)) {
      return NextResponse.json(
        { error: "Merit and union lanes stay separate. The package was not applied.", code: "invalid" },
        { status: 400 },
      );
    }
    const merged = mergePreviewFace(stored, imported.preview, fileFace || viewFace || "ocip");
    const saved = await upsertRateVaultPackage(merged, typeof body.versionNote === "string" ? body.versionNote : "Imported B-1 Excel");
    if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: saved.status });
    await queueRateVaultBuyoff(saved.preview, saved.preview.version?.note || "Imported B-1 Excel");
    return NextResponse.json({
      preview: saved.preview,
      versions: await listRateVaultVersions(saved.preview.siteId),
      buyoffs: await listRateVaultBuyoffs(),
      workshop: await workshopPayload(null, saved.preview),
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

  if (action === "restore-b1") {
    const siteId = isRateVaultSiteId(body.siteId) ? body.siteId : "wood-river";
    const restored = await restoreRateVaultLastGood(siteId);
    if (!restored.ok) return NextResponse.json({ error: restored.error }, { status: restored.status });
    return NextResponse.json({
      preview: restored.preview,
      versions: await listRateVaultVersions(siteId),
      workshop: await workshopPayload(null, restored.preview),
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
    const preview = await livePreview({ review: recognized, source: linked });
    const review = enrichReviewWithPreview(recognized, preview);
    return NextResponse.json({ review, preview, workshop: await workshopPayload(review, preview) });
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
    const preview = await livePreview({
      review: recognized,
      source: linked,
      siteId: parsed.siteId,
    });
    const review = enrichReviewWithPreview(recognized, preview);
    const confirmed = await confirmRateVaultReview(parsed);
    return NextResponse.json({
      review,
      preview,
      confirmed,
      writesRateBook: false,
      workshop: await workshopPayload(review, preview),
    });
  }

  return NextResponse.json({ error: "Unknown Rate Vault action." }, { status: 400 });
}
