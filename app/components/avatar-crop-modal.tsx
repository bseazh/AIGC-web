"use client";

import { Check, RotateCcw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type Props = {
  file: File;
  onCancel: () => void;
  onConfirm: (file: File) => void;
};

const SIZE = 512;

export function AvatarCropModal({ file, onCancel, onConfirm }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [x, setX] = useState(0);
  const [y, setY] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { imageRef.current = image; setReady(true); };
    image.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image || !ready) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const baseScale = Math.max(SIZE / image.naturalWidth, SIZE / image.naturalHeight);
    const width = image.naturalWidth * baseScale * zoom;
    const height = image.naturalHeight * baseScale * zoom;
    const maxX = Math.max(0, (width - SIZE) / 2);
    const maxY = Math.max(0, (height - SIZE) / 2);
    const left = (SIZE - width) / 2 + (x / 100) * maxX;
    const top = (SIZE - height) / 2 + (y / 100) * maxY;
    context.clearRect(0, 0, SIZE, SIZE);
    context.drawImage(image, left, top, width, height);
  }, [ready, x, y, zoom]);

  const confirm = () => {
    canvasRef.current?.toBlob((blob) => {
      if (blob) onConfirm(new File([blob], "avatar.webp", { type: "image/webp" }));
    }, "image/webp", 0.9);
  };

  return <div className="avatar-crop-backdrop" role="dialog" aria-modal="true" aria-labelledby="avatar-crop-title">
    <section className="avatar-crop-modal">
      <header><div><span>个人头像</span><h2 id="avatar-crop-title">裁剪头像</h2></div><button type="button" className="icon-button" aria-label="取消裁剪" onClick={onCancel}><X size={18} /></button></header>
      <div className="avatar-crop-stage"><canvas ref={canvasRef} width={SIZE} height={SIZE} /><span className="avatar-crop-mask" aria-hidden="true" /></div>
      <label>缩放<input type="range" min="1" max="3" step="0.01" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /></label>
      <label>水平位置<input type="range" min="-100" max="100" value={x} onChange={(event) => setX(Number(event.target.value))} /></label>
      <label>垂直位置<input type="range" min="-100" max="100" value={y} onChange={(event) => setY(Number(event.target.value))} /></label>
      <footer><button type="button" onClick={() => { setZoom(1); setX(0); setY(0); }}><RotateCcw size={16} />重置</button><button type="button" className="primary" disabled={!ready} onClick={confirm}><Check size={16} />确认使用</button></footer>
    </section>
  </div>;
}
