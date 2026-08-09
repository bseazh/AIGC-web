import type { Draft, Item, StoredDraft } from "./types";

export function cloneItem(item: Item | null | undefined): Item | null {
  if (!item) return null;
  const { file, ...rest } = item;
  return rest;
}

export function restoreItem(raw: unknown): Item | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Partial<Item>;
  if (
    typeof item.preview !== "string" ||
    typeof item.name !== "string" ||
    typeof item.byteSize !== "number"
  )
    return null;
  if (!item.assetId && item.preview.startsWith("blob:")) return null;
  return {
    preview: typeof item.assetId === "string" ? `/api/assets/${item.assetId}/download/` : item.preview,
    name: item.name,
    byteSize: item.byteSize,
    assetId: typeof item.assetId === "string" ? item.assetId : undefined,
    materialKind:
      item.materialKind === "person" ||
      item.materialKind === "product" ||
      item.materialKind === "scene" ||
      item.materialKind === "text" ||
      item.materialKind === "unknown"
        ? item.materialKind
        : undefined,
    materialSummary: typeof item.materialSummary === "string" ? item.materialSummary : undefined,
    materialConfidence: typeof item.materialConfidence === "number" ? item.materialConfidence : undefined,
    materialSuggestedAction: typeof item.materialSuggestedAction === "string" ? item.materialSuggestedAction : undefined,
    generatedAsset: item.generatedAsset === true,
    savedToLibrary: item.savedToLibrary === true,
    expiresAt: typeof item.expiresAt === "string" ? item.expiresAt : undefined,
    durationSeconds: typeof item.durationSeconds === "number" ? item.durationSeconds : undefined,
    source: item.source === "douyin" ? "douyin" : undefined,
    clipStartSeconds: typeof item.clipStartSeconds === "number" ? item.clipStartSeconds : undefined,
    clipEndSeconds: typeof item.clipEndSeconds === "number" ? item.clipEndSeconds : undefined,
  };
}

export function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

export function draftHasContent(draft: Partial<Draft>) {
  return Boolean(
    draft.douyinInput ||
      draft.sourceItem ||
      draft.douyinClips?.length ||
      draft.products?.length ||
      draft.referenceImage ||
      draft.productInfo ||
      draft.special ||
      draft.polishedPrompt,
  );
}

export function storedDraftValue(draft: Draft, draftId: string | null, draftTitle: string): StoredDraft {
  return {
    ...draft,
    __serverDraftId: draftId,
    __serverDraftTitle: draftTitle,
  };
}
