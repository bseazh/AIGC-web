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
  onApplied?: () => void;
}) {
  useEffect(() => {
    const receive = (event: Event) => {
      const detail = (event as CustomEvent<AssistantApplyDetail>).detail;
      if (!detail?.prompt) return;
      options.setPrompt(detail.prompt.slice(0, 1200));
      if (detail.productSummary && options.setProductDescription) {
        options.setProductDescription(detail.productSummary.slice(0, 900));
      }
      if (detail.referenceImages?.length && options.setReferenceImages) {
        options.setReferenceImages(detail.referenceImages);
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
