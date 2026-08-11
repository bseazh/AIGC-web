"use client";

export type ImageOutputCount = 1 | 2 | 4;

const outputCountOptions: ImageOutputCount[] = [1, 2, 4];

export function ImageOutputCountControl({
  value,
  onChange,
  disabled = false,
}: {
  value: ImageOutputCount;
  onChange: (value: ImageOutputCount) => void;
  disabled?: boolean;
}) {
  return <section className="image-output-count-control">
    <div><strong>生成数量</strong><small>默认生成 1 张，需要更多结果时再主动选择</small></div>
    <div role="group" aria-label="生成图片数量">
      {outputCountOptions.map((count) => <button
        type="button"
        className={value === count ? "active" : ""}
        disabled={disabled}
        aria-pressed={value === count}
        onClick={() => onChange(count)}
        key={count}
      >{count} 张{count === 4 ? <small>更多</small> : null}</button>)}
    </div>
  </section>;
}
