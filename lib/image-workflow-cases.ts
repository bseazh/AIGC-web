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
    title: "超写实写真智能手机抓拍人像摄影",
    tag: "图片案例",
    image: "https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=900&q=88",
    prompt: "超写实手机抓拍质感的人像摄影，夜晚城市暖光背景，自然姿态，浅景深，真实皮肤纹理，电影感光影，画面高级且自然。",
    ratio: "9:16",
    scene: "自由创作",
    style: "真实摄影",
  },
  {
    id: "perfume-still",
    title: "POV 夜间约会肖像",
    tag: "图片案例",
    image: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=900&q=88",
    prompt: "POV 视角夜间约会肖像，人物看向镜头，餐厅暖光、玻璃反射、自然笑容，手机摄影真实质感，高级浅景深。",
    ratio: "9:16",
    scene: "人物氛围",
    style: "真实摄影",
  },
  {
    id: "neon-sneaker",
    title: "动漫 / 杂志杂志封面插画",
    tag: "图片案例",
    image: "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=900&q=88",
    prompt: "未来感潮流杂志封面插画，年轻角色穿机能服装，强烈版式构图，东京街头元素，鲜明色彩，封面级视觉但不要生成可读文字。",
    ratio: "3:4",
    scene: "自由创作",
    style: "插画质感",
  },
  {
    id: "stadium-cheer",
    title: "体育宣传海报",
    tag: "图片案例",
    image: "https://images.unsplash.com/photo-1522778119026-d647f0596c20?auto=format&fit=crop&w=900&q=88",
    prompt: "体育赛事宣传海报，热烈球场氛围，人物举起围巾欢呼，绿色与黄色主色，灯光强烈，动感商业摄影，清晰主体。",
    ratio: "4:3",
    scene: "人物氛围",
    style: "明快促销",
  },
  {
    id: "fashion-green",
    title: "时尚肖像照",
    tag: "图片案例",
    image: "https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?auto=format&fit=crop&w=900&q=88",
    prompt: "时尚肖像摄影，荧光绿色造型，湿润透明背景材质，人物佩戴夸张眼镜，棚拍灯光，强烈潮流杂志质感。",
    ratio: "3:4",
    scene: "人物氛围",
    style: "清透商业",
  },
  {
    id: "summer-poster",
    title: "时尚海报",
    tag: "图片案例",
    image: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=88",
    prompt: "夏日街头潮流海报，霓虹涂鸦背景，动感人物姿态，紫色和黄色高对比，商业宣传视觉，强烈层次感，不要生成可读文字。",
    ratio: "4:3",
    scene: "自由创作",
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
