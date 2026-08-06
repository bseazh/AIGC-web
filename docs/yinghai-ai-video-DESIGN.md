# Design System: Yinghai AI Video Reference

Source inspected: `https://yinghai.xin/ai-video` and `https://yinghai.xin/ai-video/product-ad-film`

This document captures the visual system and interaction structure needed to build a similar AI video creation center in our own product. Real media from the source site must not be copied into our repository or rehosted unless separately authorized; use owned uploads, licensed stock, generated images, or video frame captures from assets we own.

## 1. Visual Theme & Atmosphere

Yinghai AI Video uses a dark commerce-workbench style: compact creation controls, visible media references, and bright cyan actions that guide users from example browsing to parameterized generation.

It should feel like a practical e-commerce production console: fast to scan, confident, and media-led.

- Overall feeling: polished AI commerce workstation, dark-first, glassy surfaces, high contrast text, cyan action accents.
- Visual density: medium-high. The home page exposes many tools at once; task pages use a two-column creation workspace with a form on the left and example references on the right.
- Brand posture: practical and conversion-focused rather than decorative. The UI should feel like a production tool for e-commerce video creation.
- Signature motifs: cyan-to-blue gradient CTAs, rounded glass cards, black media previews, subtle radial page background, compact Chinese labels.

### Key Characteristics

- Dark mode is the strongest visual identity: deep navy page background, semi-transparent panels, white text, cyan gradients.
- Tool cards are directly visible in expanded sections; do not hide the primary modules inside secondary tabs.
- Case references are first-class controls: each card has preview, title, short prompt/description, and a prominent `做同款` action.
- Creation pages pair parameter forms with a persistent right-side example gallery.

## 2. Color Palette & Roles

| Role | Semantic Name | Value | Usage |
| --- | --- | --- | --- |
| Primary action | Electric Cyan Gradient | `linear-gradient(90deg,#18dcd5,#1bd3fd)` | Main buttons, `做同款`, submit actions |
| Primary action hover | Bright Cyan Gradient | `linear-gradient(90deg,#24e4dc,#26dcff)` | CTA hover state |
| Dark background | Night Canvas | `#090c12` | Dark page background |
| Dark surface | Ink Glass | `rgba(18,22,32,.82)` / `#121620` | Cards, panels, drawers |
| Dark text | Frost White | `#eef5ff` | Main text on dark backgrounds |
| Dark muted text | Blue Gray | `#9aa6ba` | Hints, descriptions, disabled labels |
| Dark border | White Hairline | `rgba(255,255,255,.12)` | Card borders, panel separators |
| Light background | Soft Cloud | `#f4f6f6` | Light page background |
| Light surface | White | `#ffffff` | Light cards and panels |
| Light text | Carbon | `#252b35` | Main text in light mode |
| Light muted text | Slate Muted | `#69778d` | Supporting copy in light mode |
| Light border | Pale Blue Line | `#d8e3f7` | Light card borders |

### Primary

- Use cyan/blue only for high-value actions and selected states.
- Avoid making the entire interface blue. Let surfaces stay neutral and let the CTA carry the brand energy.

### Interactive

- Button hover raises the surface slightly: `translateY(-1px)`.
- Primary hover increases glow: `0 20px 42px rgba(27,211,253,.30)`.
- Media hover adds a black translucent overlay and reveals a centered play icon.
- Case cards should feel clickable through shadow, hover overlay, and cursor changes.

### Theme Modes

#### Light Mode

- Background: `linear-gradient(135deg,#fff,#faf8f6,#f0edf8)` over `#f4f6f6`.
- Surface: `#fff`.
- Text: `#252b35`.
- Accent: `#1478ff`, `#24d6c8`, `#20c8ff`.
- Notes: keep shadows soft and borders visible.

#### Dark Mode

- Background: radial deep blue/cyan highlights over `#090c12`.
- Surface: `rgba(18,22,32,.82)` and `#101521`.
- Text: `#eef5ff`.
- Accent: `#18dcd5` to `#1bd3fd`.
- Notes: cards use white hairlines; black media wells give video thumbnails a clean frame.

### Shadows & Depth

- Main panel shadow: `0 24px 70px rgba(20,120,255,.12)` in light mode.
- Dark card shadow: `0 10px 22px rgba(0,0,0,.22)`.
- CTA shadow: `0 16px 34px rgba(27,211,253,.22)`.
- Hover CTA shadow: `0 20px 42px rgba(27,211,253,.30)`.

## 3. Typography Rules

### Font Family

- Primary: `"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`
- Monospace: use the product default only for ids, task codes, logs, and debug details.
- OpenType Features: normal tracking for most UI; avoid negative tracking except large marketing-style titles copied from the reference hero.

### Hierarchy

| Role | Font | Size | Weight | Line Height | Letter Spacing | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Featured workflow headline | Primary | `clamp(28px,3.2vw,41px)` | 900 | `1.08` | tight only for hero | Used for `爆款视频换品复刻` |
| Section heading | Primary | `20px-24px` | 700 | `32px` | `0` | Tool groups such as `带货视频生成` |
| Tool card title | Primary | `18px-20px` | 600 | `1.25` | `0` | Two-line clamp on module cards |
| Form label | Primary | `13px-14px` | 500-600 | `20px` | `0` | Compact and direct |
| Case card title | Primary | `12px` | 600 | `16px` | `0` | One-line clamp |
| Case description | Primary | `11px` | 400 | `16px` | `0` | One-line clamp |
| Button label | Primary | `12px-14px` | 500-600 | `16px-20px` | `0` | Center aligned |

### Principles

- Keep creation forms compact. Labels should be short and scannable.
- Use one-line truncation for case-card title and description to maintain card rhythm.
- Do not explain internal strategy prompts in the UI; expose only the user-facing fields.

## 4. Component Stylings

### Buttons and Links

- Primary CTA: cyan-to-blue gradient, dark text `#071014`, 16px radius, 44px minimum height on compact cards.
- Secondary CTA: translucent surface, hairline border, muted text; reserve for non-destructive navigation.
- Text links: inherit text color with subtle opacity change.
- Hover and active feel: `translateY(-1px)` plus brighter gradient for primary actions.

### Cards and Containers

- Surface style: semi-transparent dark glass or clean white in light mode.
- Radius: source cards commonly use 16px; our product may reduce repeated utility cards to 8px if matching existing app conventions, but the right-side case cards should keep the rounded media style.
- Border: `1px solid rgba(255,255,255,.12)` dark, `1px solid #d8e3f7` light.
- Shadow or elevation: low shadow for resting cards, stronger cyan glow only for CTAs.
- Internal spacing: compact, usually 10px-16px in cards and 16px-24px in panels.

### Inputs and Interactive Controls

- Inputs should sit on quiet surfaces with clear labels above.
- Select controls should display current choices such as ratio, model, duration, and resolution.
- Upload controls should behave like dropzones but not dominate the page once media exists.
- Filled-by-case values should be visible in the form immediately after `做同款`.

### Navigation

- Structure: global header with logo, primary nav items, task center, asset library, theme toggle, account menu.
- Background treatment: sticky glass header with border in light mode; dark gradient header in dark mode.
- Link style: active video entry is more prominent and can include a `HOT NOW` motif.
- Page structure: AI Video is a top-level section; modules are shown as expanded grouped cards, not compressed into an inner tab strip.

### Image and Video Treatment

- Case preview media sits in a black well.
- Use `object-contain` for case previews to avoid cropping product/video frames.
- Add top-left media badges such as `视频案例`.
- On hover, overlay `rgba(0,0,0,.15)` and reveal a play button with translucent black background.

### Distinctive Components

- AI video home module grid.
- Featured `爆款视频换品复刻` workflow band.
- Right-side `案例参考` case board.
- Case detail modal with media preview on the left and prompt/key parameters on the right.
- `做同款` action that backfills creation parameters.

## 5. Layout Principles

### Spacing System

- Base unit: 4px.
- Repeated spacing values: 8px, 10px, 12px, 16px, 24px, 32px.

### Grid & Container

- Global container: max width close to `screen-2xl`; desktop observed at 1280px viewport with full-width header and centered content.
- AI Video home: grouped sections, each with cards in a responsive grid.
- Product ad task page: left form plus right case references on desktop; stacked layout on mobile/tablet.
- Case card: square card, media top 64%, content and CTA bottom 36%.

### Whitespace Philosophy

- Use enough spacing to separate tool families, but keep each working panel compact.
- Creation pages should prioritize visible controls and examples above decorative copy.
- Avoid large empty hero space on utility pages.

### Border Radius Scale

- Micro: 6px for chips and tiny controls.
- Standard: 8px for app-native panels and compact controls.
- Large: 16px for source-style case cards, modals, upload wells.
- Pill: 999px for badges and category pills.

## 6. Depth & Elevation

| Level | Treatment | Use |
| --- | --- | --- |
| Flat | Transparent or page background | Page bands and simple sections |
| Ring | 1px hairline border | Inputs, cards, panels |
| Card | Hairline + low shadow | Tool cards and case cards |
| Focus | Border highlight + faint cyan ring | Keyboard focus and active controls |
| Modal | Dark overlay + high-z rounded panel | Case detail preview |

### Depth Principles

- Depth separates functional zones, not decoration.
- Media previews should feel physically framed by black wells.
- CTA glow should be used sparingly so `做同款` and submit actions remain obvious.
- Avoid decorative blobs or generic gradient ornaments that do not explain the product.

## 7. Case Card Structure

### Anatomy

1. `article` square card
   - `display:flex`
   - `flex-direction:column`
   - `aspect-ratio:1/1`
   - `overflow:hidden`
   - `border-radius:16px`
   - `border:1px solid var(--yh-line)`
   - dark background `rgba(18,22,32,.82)`

2. Media area
   - height: `64%`
   - background: black
   - image/video poster: full width and height, `object-fit:contain`
   - click action opens work detail modal
   - cursor: zoom-in

3. Hover overlay
   - absolute full inset
   - default: transparent black
   - hover: `rgba(0,0,0,.15)`
   - centered play icon appears from opacity 0 to 1
   - play circle: 44px, `rgba(0,0,0,.55)`, white icon, backdrop blur

4. Badge
   - top-left absolute pill
   - text: `视频案例`
   - 11px text, medium weight
   - background: `rgba(16,27,51,.72)`
   - includes small play icon

5. Content area
   - padding: 10px
   - title: 12px semibold, one-line clamp
   - description: 11px muted, one-line clamp
   - CTA: full width, 44px high, gradient, 16px radius

### Observed Card Data

Use these as structural examples only. Do not copy/rehost the original media without authorization.

| Title | Tag | Description | Observed Defaults After `做同款` |
| --- | --- | --- | --- |
| 罐装气泡水饮料_广告大片 | 视频案例 | 赢海 AI 星泡 0 零糖零卡气泡饮料 广告大片 | 横屏 16:9, 图片比例 9:16, Seedance-2.0-Mini, 720P, 15 秒 |
| 镜面金属气垫粉饼_广告大片 | 视频案例 | 轻奢彩妆大片素材｜Liangnishi 电镀镜面椭圆气垫粉饼带货短视频 | same control family |
| 通勤箱包大片高级质感视频 | 视频案例 | 经典老花波士顿包 9:16 竖屏 15s AI 口播带货视频 | same control family |

### Hover State

- Card media overlay darkens.
- Play icon fades in.
- CTA gradient brightens from `#18dcd5/#1bd3fd` to `#24e4dc/#26dcff`.
- CTA shadow increases from `0 16px 34px rgba(27,211,253,.22)` to `0 20px 42px rgba(27,211,253,.30)`.
- CTA translates upward by 1px.

## 8. `做同款` Replication Logic

`做同款` is not only a visual action. It must hydrate the current creation form with a complete preset.

### Product Ad Film Preset Shape

```ts
type VideoCasePreset = {
  id: string;
  title: string;
  tag: "视频案例" | "图片案例";
  description: string;
  coverAssetId: string;
  sourceAssetIds: string[];
  productInfo: string;
  videoRequirements: string;
  executionMode: "staged" | "direct";
  videoAspectRatio: "9:16" | "16:9" | "1:1";
  imageAspectRatio: "9:16" | "16:9" | "1:1";
  model: "gemini" | "seedance-2-mini" | string;
  durationSeconds: 5 | 10 | 15;
  resolution: "720P" | "1080P";
};
```

### Click Behavior

- Fill product images/material references from owned case assets.
- Fill `产品信息`.
- Fill `视频特殊要求`.
- Set execution mode.
- Set video ratio.
- Set image ratio.
- Set model.
- Set duration.
- Set resolution.
- Keep the user on the same creation page and show the form values immediately.
- Do not expose internal strategy prompts or hidden action-director prompts in the UI.

### Example Owned Replacement Presets

These can be implemented with generated or licensed covers.

| Title | Product Info | Video Requirements | Ratio | Model | Duration |
| --- | --- | --- | --- | --- | --- |
| 清爽气泡水广告大片 | 蓝白渐变细罐气泡水，0 糖 0 卡，清爽聚餐与健身场景 | 高级饮品广告，冰块、水珠、清爽光线，快节奏转场 | 16:9 | Gemini/Seedance route | 15s |
| 金属气垫粉饼广告大片 | 镜面银色椭圆气垫粉饼，轻奢彩妆质感 | 高级美妆广告，柔光反射，手部开盒，产品旋转 | 9:16 | Gemini/Seedance route | 15s |
| 通勤箱包质感短片 | 老花波士顿通勤包，都市出行、轻商务穿搭 | 城市街景，手提包细节，模特行走，质感近景 | 9:16 | Gemini/Seedance route | 15s |

## 9. Detail Modal

### Structure

- Dialog title: `作品详情`.
- Left: video/image preview in black media area with play control.
- Right:
  - module label, such as `产品广告大片`
  - `案例素材` with product image thumbnails
  - `提示词 / 关键参数`
  - field rows for case name, content description, product info, video requirements, aspect ratio, model, image ratio, resolution, duration
  - bottom `做同款` CTA

### Implementation Notes

- The modal is useful for inspection but `做同款` should also be available directly on the card.
- The right parameter list can be read-only; editable fields live in the main creation form after applying the preset.

## 10. AI Video Home Page Structure

### Header

- Logo block at left.
- Nav items: `一站式视频带货`, `图片创作`, `实用工具`, `我的任务`, `素材库`.
- Theme toggle and user menu on the right.

### Main Sections

1. Search row
   - Keyword context: `AI电商视频`.

2. Featured workflow
   - Title: `爆款视频换品复刻`.
   - Should be a prominent band/card with step visuals and a direct entry action.

3. `带货视频生成`
   - `产品广告大片`
   - `模特对镜自拍`

4. `智能带货视频`
   - `复刻爆款带货视频-新版`
   - `智能混剪带货视频`
   - `口播带货视频`

5. `Seedance2-视频`
   - `Seedance2 视频`

### Layout Guidance

- Keep these groups expanded on the page.
- Top-level video modules should look like discoverable app cards, not settings tabs.
- Each card should show a concise title, short description, representative media, and a primary entry action.

## 11. Responsive Behavior

| Name | Width | Key Changes |
| --- | --- | --- |
| Mobile | ~390px | Main content width around 366px; creation page stacks; cards remain square; padding around 12px |
| Tablet | ~768px | Main width around 736px; creation page still compact/stacked where needed |
| Desktop | >=1024px | Two-column creation workspace; right `案例参考` remains visible |

### Touch Targets

- Primary card CTA: at least 44px high.
- Media preview should be tappable across the full thumbnail.
- Avoid tiny separate controls inside case thumbnails.

### Collapsing Strategy

- Creation form first, examples second on narrow screens.
- Keep examples available without hiding them behind unclear tabs.
- Use horizontally scrollable case rows only if vertical stacking becomes too long.

## 12. Do's and Don'ts

### Do

- Use owned or generated media for every visible case cover.
- Make `做同款` fill all relevant parameters, not just text.
- Keep internal prompts hidden from the user.
- Put case references beside the form on desktop.
- Preserve task outputs temporarily and require explicit `添加到素材库` for long-term storage.

### Don't

- Do not copy source-site videos or images into our project without authorization.
- Do not make AI Video modules a cramped tab-only experience.
- Do not show internal action-director or replication strategy prompts in the frontend.
- Do not let generated task outputs automatically become permanent library assets.
- Do not overload the first screen with marketing explanations.

## 13. Implementation Mapping

Suggested module split for our codebase:

```txt
app/features/ai-video/
  constants/
    video-case-presets.ts
    video-tool-groups.ts
  components/
    ai-video-home.tsx
    video-tool-card.tsx
    case-reference-board.tsx
    case-reference-card.tsx
    case-detail-dialog.tsx
    product-ad-film-form.tsx
  hooks/
    use-video-case-preset.ts
    use-video-task-draft.ts
  types/
    video-case.ts
    video-tool.ts
```

For `product-ad-film`, the `CaseReferenceBoard` should accept an array of owned `VideoCasePreset` objects and an `onApplyPreset` callback. The page owns the form state; the board only emits the selected preset.

## 14. Agent Prompt Guide

When building pages from this design system:

- Build the actual tool page first, not a landing page.
- Dark mode should feel native, with cyan action energy and quiet glass panels.
- Keep examples on the right side for desktop creation pages.
- Use case presets to backfill product info, requirements, ratio, model, duration, and resolution.
- Use generated or authorized case covers. Never depend on source-site media URLs in production.
- Hide internal prompts. User-facing labels should be simple: `产品图片`, `产品信息`, `视频特殊要求`, `视频画面比例`, `视频模型`, `视频时长`, `视频分辨率`.
