import { X } from "lucide-react";

import type { PreviewMedia } from "../types";

type RecreatePreviewModalProps = {
  media: PreviewMedia;
  onClose: () => void;
};

export function RecreatePreviewModal({ media, onClose }: RecreatePreviewModalProps) {
  return (
    <div
      className="asset-preview-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section className="asset-preview-modal" role="dialog" aria-modal="true" aria-label={`预览${media.name}`}>
        <button
          className="asset-preview-close"
          type="button"
          aria-label="关闭预览"
          title="关闭"
          onClick={onClose}
        >
          <X size={21} />
        </button>
        <div className="asset-preview-stage">
          <img src={media.url} alt={media.name} />
        </div>
        <footer>
          <div>
            <strong>{media.name}</strong>
            <small>复刻素材预览</small>
          </div>
        </footer>
      </section>
    </div>
  );
}
