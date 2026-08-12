"use client";

const ratioNames: Record<string, string> = {
  "1:1": "方形",
  "3:4": "竖版",
  "4:3": "横版",
  "9:16": "手机竖版",
  "16:9": "横屏",
  "2:3": "长竖版",
  "3:2": "宽横版",
};

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
  return (
    <fieldset className="image-aspect-ratio-field" disabled={disabled}>
      <legend>{label}{required && <em>*</em>}</legend>
      <div className="image-aspect-ratio-options" role="radiogroup" aria-label={label}>
        {options.map((option) => {
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
      </div>
    </fieldset>
  );
}
