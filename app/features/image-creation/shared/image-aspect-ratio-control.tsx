"use client";

const ratioNames: Record<string, string> = {
  auto: "自动画幅",
  "1:1": "方形",
  "3:4": "竖版",
  "4:3": "横版",
  "9:16": "手机竖版",
  "16:9": "横屏",
  "2:3": "长竖版",
  "3:2": "宽横版",
};

const defaultCustomRatio = "8:20";

function previewSize(value: string) {
  const [width, height] = value.split(":").map(Number);
  if (!width || !height) return { width: 28, height: 22 };
  const maxWidth = 32;
  const maxHeight = 30;
  const scale = Math.min(maxWidth / width, maxHeight / height);
  return { width: Math.max(8, Math.round(width * scale)), height: Math.max(8, Math.round(height * scale)) };
}

export function ImageAspectRatioControl({
  value,
  options,
  onChange,
  disabled = false,
  label = "图片比例",
  required = true,
}: {
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
  disabled?: boolean;
  label?: string;
  required?: boolean;
}) {
  const fixedOptions = options.filter((option) => option !== "auto" && option !== "保持原比例");
  const isPreset = fixedOptions.includes(value);
  const isAuto = value === "auto" || value === "保持原比例";
  const isCustom = !isAuto && !isPreset;
  const customMatch = (isCustom ? value : defaultCustomRatio).match(/^(\d{1,5}):((?:\d{1,5}))$/);
  const customWidth = customMatch?.[1] || "8";
  const customHeight = customMatch?.[2] || "20";
  const selectCustom = () => onChange(isCustom ? value : defaultCustomRatio);
  const updateCustom = (width: string, height: string) => {
    const nextWidth = Math.min(10_000, Math.max(1, Number(width) || 1));
    const nextHeight = Math.min(10_000, Math.max(1, Number(height) || 1));
    onChange(`${nextWidth}:${nextHeight}`);
  };

  return (
    <fieldset className="image-aspect-ratio-field" disabled={disabled}>
      <legend>{label}{required && <em>*</em>}</legend>
      <div className="image-aspect-ratio-options" role="radiogroup" aria-label={label}>
        <button type="button" role="radio" aria-checked={isAuto} className={isAuto ? "active" : ""} onClick={() => onChange("auto")}>
          <span className="image-aspect-ratio-preview auto" aria-hidden="true"><i /></span>
          <span><strong>自动画幅</strong><small>根据参考图与内容匹配</small></span>
        </button>
        {fixedOptions.map((option) => {
          const size = previewSize(option);
          return (
            <button
              type="button"
              role="radio"
              aria-checked={value === option}
              className={value === option ? "active" : ""}
              key={option}
              onClick={() => onChange(option)}
            >
              <span className="image-aspect-ratio-preview" aria-hidden="true"><i style={size} /></span>
              <span><strong>{ratioNames[option] || "自定义画幅"}</strong><small>{option}</small></span>
            </button>
          );
        })}
        <button type="button" role="radio" aria-checked={isCustom} className={isCustom ? "active" : ""} onClick={selectCustom}>
          <span className="image-aspect-ratio-preview" aria-hidden="true"><i style={previewSize(`${customWidth}:${customHeight}`)} /></span>
          <span><strong>自定义画幅</strong><small>{isCustom ? value : "输入宽高比例"}</small></span>
        </button>
      </div>
      {isCustom && (
        <div className="image-aspect-ratio-custom">
          <label><span>宽</span><input type="number" min="1" max="10000" inputMode="numeric" value={customWidth} onChange={(event) => updateCustom(event.target.value, customHeight)} /></label>
          <b>:</b>
          <label><span>高</span><input type="number" min="1" max="10000" inputMode="numeric" value={customHeight} onChange={(event) => updateCustom(customWidth, event.target.value)} /></label>
          <small>支持极端画幅，例如 8:20。生成时会完整保留主体并补齐画面。</small>
        </div>
      )}
    </fieldset>
  );
}
