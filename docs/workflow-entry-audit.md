# Workflow Entry Audit

Current objective: make each creation-center card match the page and capability users see after clicking it.

## Video Creation

| Center group | Card | Route | Current page | Status |
| --- | --- | --- | --- | --- |
| 带货视频生成 | 产品广告大片 | `/create/product-ad-video` | Product ad video form with right-side case references and same-style presets | Aligned |
| 带货视频生成 | 模特口播文案 | `/create/model-spokesperson-video` | Script-first workspace with case references and same-style script presets | Aligned as phase 1 |
| 智能带货视频 | 复刻爆款带货视频-新版 | `/create/recreate-video` | Dedicated recreate workflow with project state, source video, keyframes, materials, generation | Dedicated complex flow |
| 智能带货视频 | 智能混剪带货视频 | `/create/video-mix` | Generic video workflow for ordered authorized MP4 clips | Needs later visual alignment |
| Seedance2-视频 | Seedance2 视频 | `/create/seedance-video` | Generic advanced video workflow | Needs later visual alignment |

Notes:
- `模特口播文案` is intentionally labeled as a script workspace until video generation is implemented.
- Avoid two different center cards linking to the same route unless their labels clearly describe the same capability.

## Image Creation

| Center section | Card | Route | Current page | Status |
| --- | --- | --- | --- | --- |
| AI创意生图 | AI生图 | `/create/image-generate` | Dedicated Yinghai-style image generation page with case references | Aligned |
| AI创意生图 | 生成产品场景图 | `/create/scene-image` | Dedicated product scene page with case references | Aligned |
| AI带货模特 | 创作专属带货模特 | `/create/commerce-model` | Yinghai-style left form and right case references for reusable model asset generation | Aligned as phase 1 |
| AI带货模特 | 模特穿搭图 | `/create/model-wear` | Dedicated model-wear workspace with model/product upload and right-side case grid | Aligned as phase 1 |
| 电商商品图制作 | 商品主图+详情页 | `/create/product-hero` | Yinghai-style left form and right case references with preset backfill | Aligned as phase 1 |
| 电商商品图制作 | 商品详情页（百货） | `/create/product-detail` | Yinghai-style left form and right case references with preset backfill | Aligned as phase 1 |
| 电商商品图制作 | 复制详情页 | `/create/recreate-detail-page` | Yinghai-style left form and right case references with preset backfill | Aligned as phase 1 |
| 电商商品图制作 | 复制主图 | `/create/recreate-product-hero` | Yinghai-style left form and right case references with preset backfill | Aligned as phase 1 |
| 图片处理 | 调整图片比例 | `/create/resize-image` | Yinghai-style left form and focused resize case reference | Aligned as phase 1 |
| 图片处理 | 白底图生成 | `/create/white-background` | Yinghai-style left form and focused white-background case reference | Aligned as phase 1 |
| 图片处理与优化 | 商品图高清优化 | `/create/hd-enhance` | Yinghai-style left form and focused HD-enhance case reference | Aligned as phase 1 |

First fix completed:
- Product ad video has a source-site-like right-side case board.
- Model spokesperson page now has case references and same-style parameter backfill.
- Video center no longer exposes duplicate口播 entries that both land on the same script page.
- Image creation center cards now use real cover thumbnails. `带货模特` and `模特穿搭图` are separate routes, and core image workspaces share the same left-form / right-case-reference pattern.
