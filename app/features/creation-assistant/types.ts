export type ImageAssistantWorkflowKey =
  | "image-generate"
  | "product-hero-image"
  | "scene-image"
  | "commerce-model"
  | "model-wear"
  | "hd-enhance"
  | "white-background"
  | "resize-image"
  | "product-detail-page"
  | "recreate-product-hero"
  | "recreate-detail-page";

export type AssistantMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
};

export type AssistantRecommendations = {
  productSummary: string;
  visualAnalysis: string;
  audiences: string[];
  scenes: string[];
  styles: string[];
  sellingPoints: string[];
  reply: string;
  question: string;
  quickReplies: string[];
};

export type CreationAssistantState = {
  step: "service" | "product" | "direction" | "result";
  goal: ImageAssistantWorkflowKey;
  sourceText: string;
  audience: string;
  scene: string;
  style: string;
  sellingPoint: string;
  revision: string;
  prompt: string;
  recommendations: AssistantRecommendations | null;
  messages: AssistantMessage[];
  referenceImages: AssistantReferenceImage[];
  handoffPending?: boolean;
  expiresAt?: string;
};

export type AssistantReferenceImage = {
  assetId: string;
  name: string;
  url?: string;
};

export type AssistantApplyDetail = {
  prompt: string;
  productSummary?: string;
  referenceImages?: AssistantReferenceImage[];
};

export type AssistantWorkspaceContext = {
  images: Array<{ url: string; name?: string; role?: "product" | "reference" }>;
  productText?: string;
};

export type AssistantContextRequestDetail = {
  respond: (context: AssistantWorkspaceContext) => void;
};

export const CREATION_ASSISTANT_APPLY_EVENT = "bala:creation-assistant-apply";
export const CREATION_ASSISTANT_CONTEXT_REQUEST_EVENT = "bala:creation-assistant-context-request";
