# Design System: 赢海式电商 AIGC 创作平台

> 目标：记录 `https://yinghai.xin/` 首页、登录弹窗及经授权账号登录后可见的产品界面所呈现的设计语言，供创建同类产品时参考。本文不授权复制原站品牌、商标、媒体素材、用户内容或服务端提示词。公开层观察始于 2026-07-16，登录后页面于 2026-07-20 通过用户提供的授权账号实测；本文不记录账号凭据或私人任务数据。

## 1. Visual Theme & Atmosphere

这是一个“媒体先行、工具后置”的电商 AIGC 门户。首屏以全屏商品视频承担情绪和能力展示，界面层只保留白色品牌字、半透明玻璃控件和一条持续移动的创作入口。视觉密度集中在下半屏卡片带，上半屏保持极简且居中，让用户先看见结果质感，再选择工具。品牌姿态偏专业、克制和商业化，不使用娱乐化 AI 插画或复杂营销长页。

### Key Characteristics

- 全屏视频/图片是真正的背景和首要视觉资产，深色遮罩保证前景文字可读。
- 透明白玻璃控件叠在媒体上；登录后工具界面转为浅色蓝灰表面和高饱和蓝青操作色。
- 创作能力用大幅媒体卡表达，信息覆盖在图片上，不使用纯图标功能宫格。
- 交互运动短促：按钮轻微上浮，卡片图片放大；入口跑马灯以 46 秒匀速循环。
- 中文文案直接描述任务与产物，避免抽象 AI 术语堆砌。

## 2. Color Palette & Roles

| Role | Semantic Name | Value | Usage |
| --- | --- | --- | --- |
| Primary action | Electric Blue | `#1478FF` | 登录后主要操作、焦点、保存与查看 |
| Secondary accent | Cyan | `#20C8FF` | 蓝青渐变中段、下载、成功反馈 |
| Supporting accent | Aqua | `#24D6C8` | 蓝青渐变尾部、成功和服务入口 |
| Premium accent | Violet | `#7357FF` | 付费、账户操作和特殊工具 |
| Warm signal | Clay Orange | `#FF9D27` | 重试、提示与警示性动作 |
| Destructive | Rose | `#FF4E67` | 删除、危险和错误动作 |
| App background | Cool Fog | `#F4F6F6` | 登录后页面主背景 |
| App surface | Porcelain | `#FFFFFF` | 卡片、弹层和内容表面 |
| Primary text | Rock | `#252B35` | 浅色界面标题与正文 |
| Muted text | Steel | `#69778D` | 辅助描述和元数据 |
| Border | Blue Hairline | `#D8E3F7` | 表面分隔与输入框边界 |
| Hero card base | Ink Navy | `#1D2433` | 媒体卡图片加载前底色 |
| Login surface | Graphite | `#323C4A` to `#3E4856` | 登录弹窗渐变底 |
| Hero micro-accent | Soft Gold | `#E7CA82` | Sparkles 图标、小范围高级感提示 |

### Primary

- 主要操作渐变：`linear-gradient(135deg, #1478FF 0%, #20C8FF 52%, #24D6C8 100%)`。
- 首页不直接使用蓝色实心 CTA；CTA 保持白色玻璃态，避免与背景视频争夺注意力。

### Interactive

- 焦点环：`#1478FF`；登录弹窗输入框使用偏灰绿 `rgba(139, 198, 187, .88)` 与 3px 外环。
- 首页 hover 主要改变白色透明度并上浮 `2px`；登录后按钮 hover 提高饱和度与亮度。
- 危险、重试、付费等动作使用不同语义色，不把所有操作染成同一种蓝色。

### Neutral Scale

- 标题/正文：`#252B35`。
- 次级正文：`#69778D`。
- 边框：`#D8E3F7`。
- 背景：`#F4F6F6`。
- 深色弹层文字：白色的 `94% / 86% / 66% / 42%` 透明度层级。

### Surface & Overlay

- 英雄区媒体遮罩应从顶部的轻白雾过渡到底部的 `rgba(7,10,16,.68)`，文字区域可追加左侧暗化。
- 首页玻璃控件使用 `rgba(255,255,255,.12-.24)`，白色边框 `24%-42%`，`backdrop-filter: blur(12px)`。
- 登录后内容表面使用约 `rgba(255,255,255,.78-.90)`，搭配轻蓝边框，不使用厚重灰边。

### Theme Modes

#### Light Mode

- Background: `#F4F6F6`，可叠加很淡的蓝/青径向光。
- Surface: `rgba(255,255,255,.78-.90)`。
- Text: `#252B35` / `#69778D`。
- Accent: `#1478FF` 到 `#24D6C8`。
- Notes: 公开首页本身始终由深色视频决定明暗；此模式主要适用于登录后工具界面。

#### Dark Mode

- Background: 观察到的样式表使用约 `#080B10` 与 `#101521`。
- Surface: 约 `rgba(18,22,32,.72-.88)`。
- Text: `rgba(238,245,255,.90)` / `rgba(238,245,255,.68)`。
- Accent: 蓝青渐变保持不变，成功色提升至浅青。
- Notes: 首页没有公开的主题切换控件；暗色规则来自可读取的站点样式表，而非首页交互验证。

### Shadows & Depth

- 首页玻璃 CTA：`0 18px 42px rgba(0,0,0,.20)`。
- 入口卡默认：`0 16px 34px rgba(37,43,53,.08)`；hover：`0 22px 48px rgba(37,43,53,.12)`。
- 登录弹窗：`0 28px 76px rgba(0,0,0,.46)`。
- 登录后通用卡（观察到的样式规则）：`0 18px 44px rgba(29,36,51,.08)`。
- 阴影只负责分层，边界仍由 1px 半透明边框定义。

## 3. Typography Rules

### Font Family

- Primary: `"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", ui-sans-serif, system-ui, sans-serif`。
- Monospace: 仅在技术数据需要时使用系统等宽字体；首页未观察到等宽字体。
- OpenType Features: 无特殊设置；所有可见标题 `letter-spacing: 0`，仅英文 eyebrow 使用正向字距。

### Hierarchy

| Role | Font | Size | Weight | Line Height | Letter Spacing | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Hero headline | 系统中文无衬线 | `clamp(48px, 8vw, 120px)` | 700 | 1.0 | `0` | 桌面实测 115.2px，移动 48px |
| Hero subtitle | 同上 | 16px mobile / 24px desktop | 500 | 32px | `0` | 居中，白色 86% |
| Section heading | 同上 | 18px mobile / 24px desktop | 600 | 28/32px | `0` | 入口跑马灯标题 |
| Card title | 同上 | 20px | 700 | 28px | `0` | 白字带轻投影 |
| Body | 同上 | 14-16px | 400 | 24px | `0` | 卡片描述限制两行 |
| Label / Eyebrow | 同上 | 12px | 600 | 16px | `2.64px` | 大写英文 `CREATIVE ENTRIES` |
| Control | 同上 | 14-18px | 500-600 | 20-28px | `0` | 按钮依据层级放大 |
| Caption / Meta | 同上 | 12px | 400-600 | 17-20px | `0` | 协议、帮助与状态 |

### Principles

- 中文标题不使用负字距；靠字号、字重和留白构建层级。
- Hero 标题极大但只有品牌名；价值描述放在副标题中。
- 卡片标题和描述使用短句，覆盖在媒体的暗化区域上。
- 英文只作为克制的结构标签，不承担主要信息。

## 4. Component Stylings

### Buttons and Links

- Primary hero CTA: 56px 高、左右 40px、全圆角、18px/600 白字、白色 16% 背景和 42% 边框；hover 上移 2px并将背景提高到 24%。
- Header login: 38px 高、16px 圆角、14px/500，白色 14% 背景，左侧 16px Lucide 登录图标。
- App primary: 蓝到青绿的 135 度渐变，白字、全圆角，约 48px 高。
- Secondary: 白色 86% 表面、蓝色文字、淡蓝边框和轻阴影。
- Text links: 无常驻下划线；协议类链接使用较高字重区分。
- Iconography: 2px 线宽的 Lucide 风格图标；按钮图标通常 16-20px。

### Cards and Containers

- 首页入口卡：260px mobile、320px tablet、`clamp(360px,22vw,430px)` desktop；实测高度 198px。
- Radius: 首页媒体卡 24px；登录弹窗桌面约 24-30px，移动 20px。
- Border: 1px `#D8E3F7`，叠在媒体上时可使用白色 28%-36%。
- Internal spacing: 20px；信息分为顶部标签/图标和底部标题/描述/行动三层。
- 图片 `object-fit: cover`；下方和左侧各叠一层线性暗化，不把文字放进额外内嵌卡片。

### Inputs and Interactive Controls

- 登录弹窗输入框：36px 常规高度，验证码位可达 48px；10px 圆角、12px 水平内边距。
- 深色表面输入：白色 8% 背景、白色 14% 边框、白色 94% 输入文字、42% placeholder。
- Focus: 灰绿边框加 `0 0 0 3px rgba(139,198,187,.20)`。
- Tabs: 两列分段控件，40px 高、16px 外圆角；选中项为白色 90% 表面与深色字。
- Checkbox: 16px，4px 圆角；重要合规声明逐条确认，不能合并成一个模糊总开关。

### Navigation

- 公开首页头部为 64px 绝对定位透明栏，左右各 16px 内边距。
- 左侧 36px 方形品牌图标和粗体站名；右侧只放登录主动作。
- 不使用长导航菜单。功能选择在首屏下方的入口带完成。
- 登录后顶部导航实测包含：首页品牌、AI生图、AI电商视频、AI工具、AI办公、任务中心、我的资产、主题切换和用户菜单。
- 用户菜单保持精简，仅提供个人中心、账号安全和退出登录。
- 移动端将主导航折叠，但保留任务与资产作为一级能力，不把它们埋进创作表单。

### Image Treatment

- 使用真实商品图、模特图、详情页或视频结果，不用抽象渐变插画替代产品证据。
- 入口图保持自然色，只做轻微 `brightness(1.03) saturate(1.02)`。
- Hover 将入口图缩放至约 105%，持续 300ms；容器保持裁切。
- 自建版本必须使用有授权的素材或自行生成资产，不能镜像原站 OSS 文件。

### Distinctive Components

- Hero badge: 白色 12% 玻璃胶囊，配一个金色 Sparkles 图标，文案枚举三类产物。
- Creative marquee: 两份入口卡序列拼接，46 秒线性向左移动；hover/focus-within 暂停，reduced-motion 时静止。
- Floating support: 右下角 52px mobile / 60px desktop 圆形按钮，支持拖动；客服信息悬浮展开。
- Login modal: 深灰蓝独立表面，品牌头、登录方式分段控件、验证码、企业用途声明与协议确认完整收拢在 430px 宽窗口内。
- Authenticated inspiration portal: 登录后的首页转为浅色应用门户；顶部是工具入口轮播，下方是案例搜索、类型筛选、11 个行业标签及 20 个“做同款”案例卡。
- Tool catalog: 每个一级目录使用分类标题加功能卡网格；功能卡显示分类、VIP 标识、功能名、简短产物描述和“立即开始”。
- Unified workflow form: 支持“本地上传/资产库”切换、多素材数量提示、模型/画质/比例选择、动态积分预估、提交/重置和案例一键回填。
- Task center: 页面标题、短说明、数据留存提醒、刷新按钮、一级业务筛选、状态筛选、记录数和空状态。
- Asset library: 标题、容量使用量、上传按钮、媒体类型筛选、排序、名称搜索、资产数量和空状态。

## Authenticated Product Topology

### Observed Primary Routes

| Route | Purpose | Observed content |
| --- | --- | --- |
| `/` | 登录后案例门户 | 工具入口轮播、案例搜索、行业筛选、案例“做同款” |
| `/image-generate` | AI 生图目录 | 11 个图像工具，覆盖创意生图、场景图、模特、商详、主图、白底图和高清 |
| `/ai-video` | AI 电商视频目录 | 6 个视频工具，覆盖广告大片、自拍、复刻、混剪、口播和 Seedance |
| `/ai-media` | AI 工具目录 | 抖音链接/数据、字幕提取及风格化生图 |
| `/ai-office` | AI 办公目录 | 实测为空状态，不应作为首版重点 |
| `/tasks` | 任务中心 | 业务类型/状态筛选、记录数、任务结果留存提醒 |
| `/assets` | 我的资产 | 容量、上传、媒体类型、排序、搜索与资产卡 |

### Observed Image Tool Catalog

- AI 创意生图。
- 生成产品场景图。
- 创作专属带货模特。
- 模特穿搭图。
- 商品主图 + 详情页。
- 商品详情页（百货）。
- 复刻商详页。
- 复刻商品主图。
- 调整图片比例。
- 白底图生成。
- 商品图高清优化。

### Form Density and Behavior

- 桌面工作流采用左侧/主列素材输入与右侧参数区的高密度布局。
- 每个素材字段明确必填状态、用途说明和上传数量上限，例如模特图 `0/1`、多颜色商品图 `0/10`。
- 本地文件与已有资产是同级输入来源，避免用户重复上传。
- 模型、画质和比例使用下拉/组合框；积分报价根据必填项完成情况动态更新。
- 案例区位于表单下方，支持查看详情和“做同款”回填，而不是只承担装饰作用。

### 自建实现补充（2026-07-20）

- 芭乐AIGC 登录后采用浅色应用壳：工作台、创作工具、任务中心和内容资产均为同级导航。
- 已开放工具卡使用可点击链接；未开放工具显示“即将上线”但不伪装成按钮。
- 已新增商品主图和场景图两个真实图像工作流，均遵循上传 -> 冻结积分 -> 异步生成 -> COS 资产 -> 任务详情的同一链路。
- 灵感区使用授权示例图和原创文案，明确用于方向展示，不下载或镜像原站案例媒体。

## 5. Layout Principles

### Spacing System

- Base unit: 4px。
- 高频值：8、12、16、20、24、32、40px。
- Hero 元素间距：badge 到标题 24px，标题到副标题 20px，副标题到 CTA 32px。

### Grid & Container

- Hero 内容最大宽度约 1280px，居中；副标题最大宽度更窄。
- 页面高度围绕 `100dvh` 组织，桌面内容和 36px 页脚合计一屏。
- 入口区不采用网格换行，而采用横向单行卡片轨道；间隙 16px。
- 首页两侧安全边距：16px mobile、32px tablet、40px desktop。

### Whitespace Philosophy

- 上半屏大面积留白来自背景媒体，不额外添加装饰模块。
- 信息始终向中轴或卡片暗区对齐；不要把文字随机漂浮在图像亮部。
- 公开入口强调快速扫描；登录后工具表单应提高密度并保持清晰分组。

### Border Radius Scale

- Micro: 4px（checkbox）。
- Input: 10px。
- Standard: 12-16px（普通按钮、标签、工具卡）。
- Large: 20-24px（媒体卡、移动弹窗）。
- Modal: 24-30px desktop。
- Pill: `9999px`（主 CTA、状态标签、分段高亮）。

## 6. Depth & Elevation

| Level | Treatment | Use |
| --- | --- | --- |
| Flat | 无阴影，透明背景 | 页头、正文和页脚链接 |
| Ring | 1px 半透明白/蓝边框 | 输入、badge、玻璃按钮 |
| Card | 16-44px 软阴影，低 alpha | 功能入口、登录后内容表面 |
| Modal | 28px 76px 黑色 46% 阴影 | 登录和关键流程弹窗 |
| Focus | 3px 外环 | 键盘焦点和输入状态 |

### Depth Principles

- 媒体层、遮罩层、文字层的顺序必须明确；不要用多个嵌套卡片模拟深度。
- 首页阴影偏黑且透明；应用内阴影偏蓝灰，避免脏重。
- 玻璃效果只用于媒体背景上的小控件，不扩散到所有内容面板。
- 模态框有强分层，普通表单和列表保持安静。

## 7. Do's and Don'ts

### Do

- 用真实生成结果作为首屏和入口卡主视觉。
- 让创作入口直接对应用户任务：商品主图、模特穿搭、详情页、带货视频。
- 保持图标、颜色和文案的动作语义一致。
- 为跑马灯提供 hover/focus 暂停和 reduced-motion 降级。
- 保留登录和生成流程中的企业用途、版权责任与协议确认。

### Don't

- 不复制“赢海”名称、Logo、OSS 媒体、案例或原站文案作为新产品资产。
- 不把首页扩成堆叠卡片的通用 SaaS 营销长页。
- 不在 Hero 上叠放白色实心大卡，也不使用抽象渐变图替代真实商品结果。
- 不为中文标题使用负字距或随视口线性缩放正文。
- 不把公开案例中的 `prompt` 误称为原站系统提示词。

## 8. Responsive Behavior

### Breakpoints

| Name | Width | Key Changes |
| --- | --- | --- |
| Mobile | `< 640px` | 左右 16px；Hero 48px；卡宽 260px；页脚换为 84px；弹窗宽约 `100vw - 16px` |
| Tablet | `640-1279px` | 边距升至 32px；卡宽 320px；副标题升至 24px |
| Desktop | `>= 1280px` | 边距 40px；卡宽 360-430px；Hero 由 8vw 控制，上限 120px |

### Touch Targets

- 主要 CTA 56px；登录按钮 38px；应用主操作建议不小于 44px。
- 浮动客服为 52px；复选框视觉为 16px，但整行 label 必须可点击。
- 横向入口区允许触控滚动，并避免拖动与点击冲突。

### Collapsing Strategy

- Desktop: 首屏固定在单屏内，Hero 居中，入口跑马灯位于下半部，页脚 36px。
- Tablet: 保持同一构图，缩小入口卡并增加水平触控能力。
- Mobile: Hero 标题锁定 48px，副标题两行；入口卡仍横排而非单列；页面总高约 892px（390x844 实测）。
- 登录弹窗: 最高不超过动态视口减安全区；高度不足 720px 时隐藏次级描述并压缩控件。
- 不隐藏核心功能入口；通过横向移动保持功能完整性。

## 9. Agent Prompt Guide

### Quick Color Reference

- Primary CTA: `#1478FF -> #20C8FF -> #24D6C8`
- Background: `#F4F6F6`
- Heading text: `#252B35`
- Body text: `#69778D`
- Border or ring: `#D8E3F7`
- Hero foreground: `#FFFFFF`
- Login surface: `#3E4856 -> #323C4A`

### Quick Summary

构建一个面向电商经营者的 AIGC 创作平台。公开首页是一屏全幅真实商品视频，透明页头、居中品牌标题、单一玻璃 CTA，以及底部自动横移的媒体功能卡。登录后的工作界面切换为浅蓝灰背景、白色半透明表面和蓝青渐变动作色。字体使用中文系统无衬线，字距为 0；圆角从 10px 输入到 24px 卡片，主按钮为全圆角。交互只做轻微上浮、图片缩放和克制软阴影。

### Example Component Prompts

- Hero: “创建一屏高的电商 AIGC Hero，以真实商品生成视频全幅铺底，叠加深色可读性遮罩；中间放 48-120px 白色品牌名、两行内价值描述和 56px 高玻璃 CTA，首屏底部必须露出创作入口。”
- Card: “创建 260-430px 宽、198px 高的媒体入口卡，24px 圆角，图片 cover；上方是玻璃类别 badge 与图标，下方是白色标题、两行描述和箭头动作，使用底部与左侧双暗化遮罩。”
- Navigation: “创建 64px 透明绝对定位页头，左侧 36px 品牌图和站名，右侧仅一个图标+登录按钮；移动端保持同一结构，不添加汉堡菜单。”
- Login: “创建 430px 深灰蓝登录弹窗，24px 圆角，包含品牌、两段登录方式、输入与验证码、三条合规确认和全宽提交按钮；控件使用白色低透明表面与灰绿焦点环。”

### Ready-to-Use Prompt

以本 `DESIGN.md` 为唯一视觉规则，设计一个原创的电商 AIGC 创作平台。保留媒体先行、一屏 Hero、横向创作入口、深色登录弹窗和浅色工具工作台的设计语言，但使用全新的品牌、文案与已授权媒体。实现 desktop/tablet/mobile 响应式、键盘焦点、reduced-motion、入口跑马灯暂停，以及完整的登录、任务状态和资产操作状态。不得下载或复用原站 OSS 素材。

### Iteration Guide

1. 先验证背景媒体与前景文字对比度，再调整阴影和玻璃透明度。
2. 保证首屏同时看见品牌、CTA 和至少一部分创作入口，不让 Hero 吞没下一步。
3. 登录后提高信息密度，用语义色区分生成、重试、下载、付费和危险操作。
4. 每次新增工具沿用同一卡片/表单结构，不增加新的视觉语法。

## Optional Appendix: Interaction Patterns

- Scroll behavior: 首页禁用常规页面滚动条，主要动态来自入口横向轨道；移动端因页脚换行产生少量纵向高度。
- Hover behavior: 卡片上移 2px、阴影增强、图片缩放 105%、箭头右移；跑马灯暂停。
- Click behavior: 未登录的 Header 登录、Hero CTA 和入口卡都会进入登录流程。
- Animation tone: 入口 46 秒线性循环；一般状态转换约 150ms，图片缩放 300ms，弹窗约 200ms。
- Reduced motion: 入口跑马灯停止并恢复静态横向列表。

## Optional Appendix: Content & Messaging Patterns

- Headline pattern: 品牌名或字面任务名，不用“重新定义未来”式口号。
- CTA language: “开始使用”“登录后使用”“获取”“下载”等明确动词。
- Trust signal pattern: 企业/个体工商户用途、知识产权责任、用户协议与隐私政策逐项确认。
- Voice and tone: 专业、直接、结果导向；描述“生成什么”和“适合什么电商场景”。

## Optional Appendix: Observed Pages

- `https://yinghai.xin/`: 首页 Hero、8 个创作入口、透明页头、页脚、浮动客服与响应式规则。
- 登录弹窗（公开交互）: 账号密码/短信登录、图形验证码、短信验证码、企业用途声明和协议确认。
- 公开样式表: 登录后应用壳的颜色 token、按钮语义、浅/暗表面规则；未登录状态下未验证具体工作台布局。

## Evidence Notes

- Observed: 1440x1000 时 Hero 标题 115.2px，卡片约 360x198px，页脚 36px；390x844 时 Hero 48px，卡片 260x198px，页脚 84px。
- Observed: 根 token 包含 `--yh-action-primary: #1478ff`、`--yh-mist: #20c8ff`、`--yh-sage: #24d6c8`、`--yh-bg: #f4f6f6`、`--yh-ink: #252b35`、`--yh-line: #d8e3f7`。
- Observed: 登录弹窗约 430x660px，深灰蓝渐变、1px 白色 16% 边框与强模态阴影。
- Observed: 首页媒体来自公开 OSS URL，但本规则只记录视觉处理，不保留或授权复制这些资产。
- Not observed: 登录后的真实页面结构、完整暗色切换路径、付费成功/失败和任务异常状态。
