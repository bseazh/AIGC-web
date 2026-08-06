export type ImageWorkflowCase = {
  id: string;
  title: string;
  tag: string;
  image: string;
  prompt: string;
  productDescription?: string;
  ratio?: string;
  scene?: string;
  style?: string;
};

export const aiImageCases: ImageWorkflowCase[] = [
  {
    id: "orange-cat",
    title: "阳光橘猫",
    tag: "生活摄影",
    image: "https://images.unsplash.com/photo-1573865526739-10659fec78a5?auto=format&fit=crop&w=900&q=88",
    prompt: "一只可爱的橘猫在阳光下打盹，柔和窗光，浅色亚麻布背景，真实摄影质感，温暖、安静、高清细节。",
    ratio: "3:4",
    scene: "自由创作",
    style: "真实摄影",
  },
  {
    id: "perfume-still",
    title: "香氛静物",
    tag: "商业静物",
    image: "https://images.unsplash.com/photo-1541643600914-78b084683601?auto=format&fit=crop&w=900&q=88",
    prompt: "一瓶高端香氛放在半透明亚克力台面上，清透水光、柔和阴影、浅色背景，商业广告摄影，干净留白。",
    ratio: "1:1",
    scene: "商品灵感",
    style: "清透商业",
  },
  {
    id: "neon-sneaker",
    title: "赛博运动鞋",
    tag: "潮流视觉",
    image: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=88",
    prompt: "一双未来感运动鞋悬浮在霓虹灯光环境中，金属反射地面，蓝绿色边缘光，强对比商业海报风格。",
    ratio: "4:3",
    scene: "商品灵感",
    style: "明快促销",
  },
];

export const productSceneCases: ImageWorkflowCase[] = [
  {
    id: "coffee-table",
    title: "咖啡桌面场景",
    tag: "食品饮料",
    image: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=900&q=88",
    productDescription: "袋装精品咖啡，主打新鲜烘焙、坚果香气、适合家庭手冲和办公室饮用。",
    prompt: "把商品自然放在木质咖啡桌面，旁边有咖啡杯、手冲器具和少量咖啡豆，早晨自然光，真实生活方式摄影。",
    ratio: "4:3",
    scene: "咖啡桌面",
    style: "明亮生活方式",
  },
  {
    id: "outdoor-bottle",
    title: "户外通勤水杯",
    tag: "家居百货",
    image: "https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=900&q=88",
    productDescription: "大容量保温杯，磨砂金属质感，适合通勤、露营和运动补水，强调便携与耐用。",
    prompt: "把商品放在户外野餐桌或露营椅旁，背景有柔焦草地和阳光，保留商品轮廓和材质，干净商业构图。",
    ratio: "3:4",
    scene: "户外生活",
    style: "清新自然",
  },
  {
    id: "gift-watch",
    title: "礼赠精品陈列",
    tag: "珠宝配饰",
    image: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=900&q=88",
    productDescription: "精致腕表礼盒，适合节日礼赠、纪念日送礼，突出高级金属细节和仪式感。",
    prompt: "把商品放在节日礼盒和丝绒布料上，暖色点状灯光，轻奢精品店氛围，画面干净、质感高级。",
    ratio: "1:1",
    scene: "节日礼赠",
    style: "轻奢商业",
  },
];
