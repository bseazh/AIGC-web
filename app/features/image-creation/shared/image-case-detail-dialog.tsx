"use client";

import { ChevronLeft, ChevronRight, ImageIcon, Wand2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getImageWorkflowSpec } from "@/app/features/image-creation/shared/image-workflow-spec";
import type { ImageWorkflowCase } from "@/lib/image-workflow-cases";

type Props = {
  item: ImageWorkflowCase;
  workflowKey?: string;
  workflowLabel: string;
  onApply: (item: ImageWorkflowCase) => void;
  onClose: () => void;
};

export function ImageCaseDetailDialog({ item, workflowKey, workflowLabel, onApply, onClose }: Props) {
  const images = useMemo(() => item.images?.length ? item.images : [item.image], [item]);
  const presentation = getImageWorkflowSpec(workflowKey).caseDetails;
  const references = item.referenceImages?.length
    ? item.referenceImages
    : [{ image: item.image, label: item.referenceLabel || presentation.referenceLabel }];
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const move = (offset: number) => setIndex((current) => (current + offset + images.length) % images.length);

  return <div className="image-case-dialog-backdrop" role="dialog" aria-modal="true" aria-label={`${item.title}作品详情`} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="image-case-dialog">
      <div className="image-case-dialog-media">
        <img src={images[index]} alt={`${item.title} 第 ${index + 1} 张`} />
        {images.length > 1 && <><button className="previous" type="button" aria-label="查看上一张" onClick={() => move(-1)}><ChevronLeft size={22} /></button><button className="next" type="button" aria-label="查看下一张" onClick={() => move(1)}><ChevronRight size={22} /></button></>}
        <span>{index + 1} / {images.length}</span>
      </div>
      <aside className="image-case-dialog-detail">
        <header><div><h2>作品详情</h2><span><ImageIcon size={12} />图片</span></div><button type="button" aria-label="关闭作品详情" onClick={onClose}><X size={20} /></button></header>
        <strong className="image-case-dialog-workflow">{workflowLabel}</strong>
        <section><h3>案例素材</h3><div className="image-case-reference-list">{references.map((reference, referenceIndex) => <figure key={`${reference.image}-${referenceIndex}`}><figcaption>{reference.label}</figcaption><img src={reference.image} alt={reference.label} /></figure>)}</div></section>
        <section className="image-case-input-structure"><h3>同款所需内容</h3><ol>{presentation.inputRoles.map((role) => <li key={role}>{role}</li>)}</ol></section>
        <section className="image-case-parameters"><h3>创作说明 / 关键参数</h3><dl><dt>案例名称</dt><dd>{item.title}</dd><dt>{item.descriptionLabel || presentation.descriptionLabel}</dt><dd>{item.productDescription || item.prompt}</dd>{item.parameters?.map((parameter) => <div className="image-case-parameter-row" key={`${parameter.label}-${parameter.value}`}><dt>{parameter.label}</dt><dd>{parameter.value}</dd></div>)}<dt>模型名称</dt><dd>{item.model || "Gemini 2.5 Flash Image"}</dd><dt>图片比例</dt><dd>{item.ratio || "自动"}</dd><dt>画质</dt><dd>{item.quality || "2K"}</dd></dl></section>
        <button className="image-case-apply" type="button" onClick={() => { onApply(item); onClose(); }}><Wand2 size={17} />做同款</button>
      </aside>
    </section>
  </div>;
}
