import type { KeyframeSelection, RecreateFrameAnalysis } from "./types";

export function keyframeCollagePrompt(collageImageIndex: number | null) {
  return collageImageIndex
    ? `动作结构十二宫格参考图：第${collageImageIndex}张参考图是一张由已选关键画面转换成边缘轮廓线稿的动作结构板；请按从左到右、从上到下理解每个关键帧的人体姿态、四肢方向、重心变化、站位、景别和镜头节奏，不得把它当作人物脸、商品细节、品牌、Logo、水印或字幕参考。`
    : "十二宫格参考图：当前只有关键画面时间点，未能提交拼接图；请主要参考对标视频的镜头节奏和已确认时间点。";
}

export function builtInRecreatePrompt(collageImageIndex: number | null) {
  return [
    "【系统内置复刻策略】",
    "先阅读 reference_video 和动作结构十二宫格参考图，提取原视频的镜头顺序、景别变化、主体站位、动作节奏、运镜方向、构图重心、光线氛围和剪辑节点；这些内容是本次复刻的结构骨架。",
    collageImageIndex
      ? `第${collageImageIndex}张参考图是已转换成边缘轮廓线稿的十二宫格关键帧拼图，必须按从左到右、从上到下的顺序理解镜头推进；重点复刻每格里四肢方向、身体倾斜、步伐、手势、重心和出镜位置，不表示可复制的人脸、商品、品牌或字幕。`
      : "如果十二宫格拼图不可用，则以 reference_video 和已确认关键帧时间点作为镜头结构依据。",
    "再阅读其余上传图片作为替换素材：人物/模特素材用于替换原视频人物或手部动作主体，商品素材用于替换原视频售卖商品，场景素材用于替换背景氛围，文字/Logo 素材只作为用户新内容参考。",
    "生成时保留原视频的动作参考、镜头节奏、构图、景别、人物/商品出现时机和展示逻辑；但必须重生成原创画面，不复制原人物脸、原商品、原品牌、Logo、水印、字幕或可识别真实身份。",
    "如果上传了 @虚拟模特参考 或人物多视图参考，必须用该新模特替换原视频中的真人主体：参考原视频动作、姿态、走位和出镜节奏，但脸型、发型、身形、服装关系以用户上传人物素材为准。",
    "如果上传了商品或服装素材，必须让新商品/服装出现在原视频对应展示位置和镜头段落里，保持新商品外观、颜色、材质、比例和关键细节准确。",
    "用户不需要写专业提示词；即使用户口令为空，也按以上内置策略自动完成镜头复刻和素材替换。",
  ].join("\n");
}

export function actionDirectorPrompt(
  analysis: RecreateFrameAnalysis | null | undefined,
  selectedKeyframes: KeyframeSelection[],
) {
  const timeline = (analysis?.actionTimeline || []).filter((item) => typeof item?.time === "number");
  if (timeline.length) {
    return [
      "【逐帧动作导演脚本】",
      "必须按以下时间顺序连续复刻动作走势，不要生成无关走路、站立摆拍或随机展示镜头；每个关键动作之间要平滑过渡。",
      ...timeline.slice(0, 12).map((item, index) =>
        [
          `动作 ${index + 1}｜${Number(item.time).toFixed(1)}s：`,
          item.pose ? `姿态：${item.pose}` : "",
          item.hands ? `手部：${item.hands}` : "",
          item.feet ? `脚步：${item.feet}` : "",
          item.bodyWeight ? `重心：${item.bodyWeight}` : "",
          item.camera ? `镜头：${item.camera}` : "",
          item.transitionToNext ? `衔接：${item.transitionToNext}` : "",
          item.replicationInstruction ? `执行：${item.replicationInstruction}` : "",
        ]
          .filter(Boolean)
          .join(" "),
      ),
    ].join("\n");
  }
  if (analysis?.frames?.length) {
    return [
      "【逐帧动作导演脚本】",
      "根据关键帧分析按时间顺序复刻动作走势，重点保持主体站位、姿态、手脚方向、重心变化、景别和镜头节奏。",
      ...analysis.frames.slice(0, 12).map((frame, index) =>
        `动作 ${index + 1}｜${Number(frame.time || 0).toFixed(1)}s：${frame.shotType || "参考该帧景别"}；${frame.cameraMovement || "保持该帧镜头关系"}；${frame.scene || "按该帧主体姿态和构图重演"}。`,
      ),
    ].join("\n");
  }
  return selectedKeyframes.length
    ? [
        "【逐帧动作导演脚本】",
        "按已选关键帧时间点连续复刻动作：逐格读取动作结构十二宫格中的人体姿态、手脚方向、重心变化、站位和景别，生成时让新模特/新商品在相同时间节点完成对应动作，不要只生成普通走路或随机停顿。",
        `关键帧时间顺序：${selectedKeyframes.map((frame) => `${frame.time.toFixed(1)}s`).join(" -> ")}。`,
      ].join("\n")
    : "【逐帧动作导演脚本】请先完整读取 reference_video，按原视频从开头到结尾的动作走势、运镜方向、景别变化和剪辑节奏连续复刻。";
}
