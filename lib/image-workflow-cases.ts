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
    tag: "食品饮品",
    image: "https://images.unsplash.com/photo-1517701604599-bb29b565090c?auto=format&fit=crop&w=900&q=88",
    productDescription: "精品咖啡或饮品杯，主打现制饮品、香气和社交分享场景。",
    prompt: "把商品自然放在咖啡桌面，双手拿起杯子碰杯，背景有柔焦咖啡机和暖色灯光，真实门店生活方式摄影。",
    ratio: "1:1",
    scene: "咖啡桌面",
    style: "明亮生活方式",
  },
  {
    id: "outdoor-bottle",
    title: "户外通勤水杯",
    tag: "家居百货",
    image: "https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=900&q=88",
    productDescription: "绿色随行水杯，磨砂质感，适合通勤、运动和户外补水，强调简洁、便携、耐用。",
    prompt: "把商品置于干净浅色背景或户外桌面，突出杯身轮廓和瓶盖结构，柔和自然光，干净商业构图。",
    ratio: "9:16",
    scene: "户外生活",
    style: "低饱和质感",
  },
  {
    id: "gift-watch",
    title: "礼盒精品陈列",
    tag: "珠宝配饰",
    image: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=900&q=88",
    productDescription: "白色智能腕表或配饰礼盒，适合礼赠、节日促销和精品陈列。",
    prompt: "把商品放在浅灰礼盒场景中，两个商品形成对角构图，轻奢质感，柔和阴影，突出材质细节。",
    ratio: "1:1",
    scene: "节日礼赠",
    style: "轻奢商业",
  },
  {
    id: "baby-romper",
    title: "婴儿飞袖纯棉连体衣",
    tag: "母婴服饰",
    image: "https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?auto=format&fit=crop&w=900&q=88",
    productDescription: "婴儿纯棉连体衣，柔软亲肤，适合居家穿着和母婴店展示。",
    prompt: "把商品呈现在明亮婴儿房或柔软床品场景，浅色背景，温柔自然光，强调亲肤和柔软质感。",
    ratio: "9:16",
    scene: "自然居家",
    style: "明亮生活方式",
  },
  {
    id: "male-pants",
    title: "产品场景图-裤子",
    tag: "服饰穿搭",
    image: "https://images.unsplash.com/photo-1516257984-b1b4d707412e?auto=format&fit=crop&w=900&q=88",
    productDescription: "男士休闲裤，宽松版型，适合通勤和日常穿搭。",
    prompt: "让模特在室内门廊自然站立，穿着商品裤子，光线柔和，强调裤型、垂坠感和日常穿搭氛围。",
    ratio: "9:16",
    scene: "精品店陈列",
    style: "低饱和质感",
  },
  {
    id: "female-pants",
    title: "产品场景图-裤子",
    tag: "服饰穿搭",
    image: "https://images.unsplash.com/photo-1485968579580-b6d095142e6e?auto=format&fit=crop&w=900&q=88",
    productDescription: "女士休闲阔腿裤，高腰版型，适合居家、通勤和轻运动场景。",
    prompt: "让模特在自然居家卧室场景中穿着商品裤子，站姿自然，浅色床品背景，强调裤型和面料舒适度。",
    ratio: "9:16",
    scene: "自然居家",
    style: "明亮生活方式",
  },
];
