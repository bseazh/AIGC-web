import { useMemo, useState } from "react";

import { materialLabel } from "../constants";
import type { Item, MaterialKind, PolishedRecreatePrompt } from "../types";

type UseRecreateMaterialsOptions = {
  clearTaskState: () => void;
};

export function useRecreateMaterials({ clearTaskState }: UseRecreateMaterialsOptions) {
  const [products, setProducts] = useState<Item[]>([]);
  const [referenceImage, setReferenceImage] = useState<Item | null>(null);
  const [productInfo, setProductInfo] = useState("");
  const [special, setSpecial] = useState("");
  const [polishedPrompt, setPolishedPrompt] = useState<PolishedRecreatePrompt | null>(null);
  const [materialMentionOpen, setMaterialMentionOpen] = useState(false);
  const [materialMentionQuery, setMaterialMentionQuery] = useState("");
  const [materialAnalysisBusyIndex, setMaterialAnalysisBusyIndex] = useState<number | null>(null);
  const [privacyViewBusyIndex, setPrivacyViewBusyIndex] = useState<number | null>(null);
  const [faceMaskBusyIndex, setFaceMaskBusyIndex] = useState<number | null>(null);

  const materialReferences = useMemo(
    () =>
      products.map((product, index) => ({
        label: product.name.trim() || materialLabel(index),
        fallbackLabel: materialLabel(index),
        preview: product.preview,
      })),
    [products],
  );
  const privacyReferenceIndex = products.findIndex((product) => product.name.trim() === "虚拟模特参考");
  const privacyReference = privacyReferenceIndex >= 0 ? products[privacyReferenceIndex] : null;
  const portraitCandidateIndex = products.length ? Math.max(privacyReferenceIndex, 0) : -1;
  const portraitCandidate = portraitCandidateIndex >= 0 ? products[portraitCandidateIndex] : null;
  const mentionMaterials = useMemo(() => {
    const query = materialMentionQuery.trim().replace(/^@/, "");
    if (!query) return materialReferences;
    return materialReferences.filter((item) => item.label.includes(query) || item.fallbackLabel.includes(query));
  }, [materialMentionQuery, materialReferences]);

  const productReady = products.length > 0 || Boolean(productInfo.trim()) || Boolean(polishedPrompt?.finalPrompt);
  const referenceReady = productReady;

  const materialKindLabel = (kind?: MaterialKind) => {
    if (kind === "person") return "模特/人物";
    if (kind === "product") return "商品/物体";
    if (kind === "scene") return "场景/背景";
    if (kind === "text") return "文字/Logo";
    return "未识别";
  };

  const removeProduct = (index: number) =>
    setProducts((current) => {
      const item = current[index];
      if (item?.file) URL.revokeObjectURL(item.preview);
      return current.filter((_, itemIndex) => itemIndex !== index);
    });

  const renameProduct = (index: number, name: string) => {
    setProducts((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index
          ? { ...item, name: name.slice(0, 18) }
          : item,
      ),
    );
    setPolishedPrompt(null);
    clearTaskState();
  };

  const normalizeProductName = (index: number) => {
    setProducts((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index
          ? { ...item, name: item.name.trim() || materialLabel(index) }
          : item,
      ),
    );
  };

  const setMaterialKind = (index: number, kind: MaterialKind) => {
    setProducts((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              materialKind: kind,
              materialSummary:
                kind === "person"
                  ? "已手动标为模特/人物，请生成隐私化完整人体多视图"
                  : kind === "product"
                    ? "已手动标为商品/物体，请生成商品多视图"
                    : kind === "scene"
                      ? "已手动标为场景/背景"
                      : kind === "text"
                        ? "已手动标为文字/Logo"
                        : "已手动标为未识别素材",
              materialConfidence: 1,
            }
          : item,
      ),
    );
    setPolishedPrompt(null);
    clearTaskState();
  };

  const insertMaterialReference = (label: string) => {
    setProductInfo((current) => {
      const beforeCursor = current;
      const match = beforeCursor.match(/(^|\s)@[\u4e00-\u9fa5\w-]*$/);
      if (match) {
        const start = beforeCursor.length - match[0].length;
        const prefix = beforeCursor.slice(0, start);
        const leading = match[1] || "";
        return `${prefix}${leading}@${label} `.slice(0, 800);
      }
      const suffix = current.trim() ? ` @${label}` : `@${label}`;
      return `${current}${suffix} `.slice(0, 800);
    });
    setMaterialMentionOpen(false);
    setMaterialMentionQuery("");
    setPolishedPrompt(null);
    clearTaskState();
  };

  const handleCommandInput = (value: string) => {
    setProductInfo(value);
    setPolishedPrompt(null);
    clearTaskState();
    const match = value.match(/(^|\s)@([\u4e00-\u9fa5\w-]*)$/);
    setMaterialMentionOpen(Boolean(match && materialReferences.length));
    setMaterialMentionQuery(match?.[2] || "");
  };

  const resetMaterials = () => {
    setProducts([]);
    setReferenceImage(null);
    setProductInfo("");
    setSpecial("");
    setPolishedPrompt(null);
    setMaterialMentionOpen(false);
    setMaterialMentionQuery("");
    setMaterialAnalysisBusyIndex(null);
    setPrivacyViewBusyIndex(null);
    setFaceMaskBusyIndex(null);
  };

  return {
    faceMaskBusyIndex,
    handleCommandInput,
    insertMaterialReference,
    materialAnalysisBusyIndex,
    materialKindLabel,
    materialMentionOpen,
    materialMentionQuery,
    materialReferences,
    mentionMaterials,
    normalizeProductName,
    polishedPrompt,
    portraitCandidate,
    portraitCandidateIndex,
    privacyReference,
    privacyReferenceIndex,
    privacyViewBusyIndex,
    productInfo,
    productReady,
    products,
    referenceImage,
    referenceReady,
    removeProduct,
    renameProduct,
    resetMaterials,
    setFaceMaskBusyIndex,
    setMaterialAnalysisBusyIndex,
    setMaterialKind,
    setMaterialMentionOpen,
    setMaterialMentionQuery,
    setPolishedPrompt,
    setPrivacyViewBusyIndex,
    setProductInfo,
    setProducts,
    setReferenceImage,
    setSpecial,
    special,
  };
}
