export type Account = { wallet: { availablePoints: number } };

export type MaterialKind = "person" | "product" | "scene" | "text" | "unknown";

export type Item = {
  preview: string;
  name: string;
  byteSize: number;
  file?: File;
  assetId?: string;
  durationSeconds?: number;
  source?: "douyin";
  clipStartSeconds?: number;
  clipEndSeconds?: number;
  materialKind?: MaterialKind;
  materialSummary?: string;
  materialConfidence?: number;
  materialSuggestedAction?: string;
};

export type Asset = {
  id: string;
  mimeType: string;
  byteSize: number;
  originalName: string;
  url: string;
  durationSeconds?: number | null;
};

export type Result = {
  status: string;
  outputs: Array<{ assetId: string; url: string }>;
  taskId?: string;
};

export type PreviewMedia = { url: string; name: string; mimeType: string };

export type FaceMaskRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence?: number;
  view?: string;
};

export type DouyinAnalysis = {
  title: string;
  durationSeconds: number;
  clipRequired: boolean;
  clipDurations?: number[];
  cacheId?: string;
  cachePreviewUrl?: string;
  cacheByteSize?: number;
  cacheExpiresAt?: string;
  referencePrompt?: string;
  keyframeSeconds?: number[];
};

export type RecreateFrameAnalysis = {
  frames?: Array<{
    time?: number;
    scene?: string;
    shotType?: string;
    cameraMovement?: string;
    people?: unknown;
    replaceableParts?: string[];
    riskNotes?: string[];
  }>;
  actionTimeline?: Array<{
    time?: number;
    pose?: string;
    hands?: string;
    feet?: string;
    bodyWeight?: string;
    camera?: string;
    transitionToNext?: string;
    replicationInstruction?: string;
  }>;
  replacementPlan?: Array<{
    target?: string;
    slotType?: "product" | "person" | "scene" | "text" | "style" | string;
    materialKind?: string;
    replaceable?: boolean;
    priority?: number;
    confidence?: number;
    sourceFrameTimes?: number[];
    strategy?: string;
    promptInstruction?: string;
    detectionNote?: string;
  }>;
  risks?: string[];
  prompt?: string;
  providerError?: string;
  summary?: string;
};

export type PolishedRecreatePrompt = {
  summary?: string;
  preserve?: string[];
  replace?: string[];
  materialUse?: string[];
  avoid?: string[];
  finalPrompt?: string;
  providerError?: string;
};

export type SourceKind = "video" | "product" | "scene";
export type WorkflowStep = "source" | "clip" | "product" | "reference" | "generate";
export type SourceMode = "douyin" | "upload" | "library";

export type KeyframeSelection = {
  time: number;
  url?: string;
  label?: string;
};

type PersistedItem = Pick<
  Item,
  | "preview"
  | "name"
  | "byteSize"
  | "assetId"
  | "durationSeconds"
  | "source"
  | "clipStartSeconds"
  | "clipEndSeconds"
>;

export type Draft = {
  projectSeed?: string;
  step: WorkflowStep;
  sourceMode: SourceMode;
  douyinInput: string;
  douyinAnalysis: DouyinAnalysis | null;
  douyinStart: number;
  douyinClipDuration: number;
  sourceItem: PersistedItem | null;
  douyinClips: PersistedItem[];
  activeClipId: string | null;
  selectedKeyframes: KeyframeSelection[];
  products: Array<
    Pick<
      Item,
      | "preview"
      | "name"
      | "byteSize"
      | "assetId"
      | "materialKind"
      | "materialSummary"
      | "materialConfidence"
      | "materialSuggestedAction"
    >
  >;
  referenceImage: Pick<Item, "preview" | "name" | "byteSize" | "assetId"> | null;
  usageAuthorized: boolean;
  productInfo: string;
  special: string;
  polishedPrompt: PolishedRecreatePrompt | null;
  ratio: string;
  duration: string;
  resolution: string;
};

export type ServerDraft = {
  id: string;
  title: string;
  workflowKey: string;
  status?: string;
  payload: Partial<Draft>;
  taskId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type StoredDraft = Partial<Draft> & {
  __serverDraftId?: string | null;
  __serverDraftTitle?: string;
};
