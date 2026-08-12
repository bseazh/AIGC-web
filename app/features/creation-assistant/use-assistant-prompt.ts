"use client";

import { useEffect } from "react";
import {
  CREATION_ASSISTANT_APPLY_EVENT,
  CREATION_ASSISTANT_CONTEXT_REQUEST_EVENT,
  type AssistantApplyDetail,
  type AssistantContextRequestDetail,
  type AssistantWorkspaceContext,
} from "./types";

export function useAssistantPromptReceiver(options: {
  setPrompt: (value: string) => void;
  setProductDescription?: (value: string) => void;
  setReferenceImages?: (images: NonNullable<AssistantApplyDetail["referenceImages"]>) => void;
  setSeries?: (detail: Pick<AssistantApplyDetail, "seriesConfig" | "visualBible" | "seriesPlan">) => void;
  setOutputCount?: (count: 1 | 2 | 4) => void;
  setSeriesTaskContext?: (detail: Pick<AssistantApplyDetail, "seriesConfig" | "visualBible" | "seriesPlan">) => void;
  onApplied?: () => void;
}) {
  useEffect(() => {
    const receive = (event: Event) => {
      const detail = (event as CustomEvent<AssistantApplyDetail>).detail;
      if (!detail?.prompt) return;
      const seriesContext = !options.setSeries && (detail.visualBible || detail.seriesPlan?.length)
        ? [
            detail.visualBible ? `系列统一视觉基准：${detail.visualBible}` : "",
            detail.seriesPlan?.length ? `系列图片规划：${detail.seriesPlan.map((item, index) => `第${index + 1}张=${item.title}/${item.angle}/${item.sellingPoint}/${item.copy}`).join("；")}` : "",
          ].filter(Boolean).join("\n")
        : "";
      options.setPrompt([detail.prompt, seriesContext].filter(Boolean).join("\n").slice(0, 1200));
      if (detail.productSummary && options.setProductDescription) {
        options.setProductDescription(detail.productSummary.slice(0, 900));
      }
      if (detail.referenceImages?.length && options.setReferenceImages) {
        options.setReferenceImages(detail.referenceImages);
      }
      if (options.setSeries && (detail.seriesConfig || detail.visualBible || detail.seriesPlan?.length)) {
        options.setSeries({ seriesConfig: detail.seriesConfig, visualBible: detail.visualBible, seriesPlan: detail.seriesPlan });
      }
      options.setSeriesTaskContext?.({ seriesConfig: detail.seriesConfig, visualBible: detail.visualBible, seriesPlan: detail.seriesPlan });
      if (options.setOutputCount && [1, 2, 4].includes(Number(detail.seriesConfig?.count))) {
        options.setOutputCount(detail.seriesConfig?.count as 1 | 2 | 4);
      }
      options.onApplied?.();
    };
    window.addEventListener(CREATION_ASSISTANT_APPLY_EVENT, receive);
    return () => window.removeEventListener(CREATION_ASSISTANT_APPLY_EVENT, receive);
  }, [options]);
}

export function useAssistantWorkspaceContext(context: AssistantWorkspaceContext) {
  useEffect(() => {
    const respond = (event: Event) => {
      const detail = (event as CustomEvent<AssistantContextRequestDetail>).detail;
      detail?.respond?.(context);
    };
    window.addEventListener(CREATION_ASSISTANT_CONTEXT_REQUEST_EVENT, respond);
    return () => window.removeEventListener(CREATION_ASSISTANT_CONTEXT_REQUEST_EVENT, respond);
  }, [context]);
}
