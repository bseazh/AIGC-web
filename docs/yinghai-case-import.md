# 银海案例采集

`scripts/import-yinghai-cases.mjs` 采集银海图片工作台的案例元数据，以及案例中的成品图、参考图和商品图 URL。

默认只保存 URL 和原始接口记录，不下载、托管或写入线上素材库。采集结果位于 `data/yinghai-cases/`，该目录默认被 `.gitignore` 忽略，避免把第三方素材提交进仓库。

## 采集

公开请求可能返回 `403`，需要在浏览器登录银海后提供当前会话 Cookie：

```bash
YINGHAI_COOKIE='name=value; other=value' npm run import:yinghai-cases
```

脚本覆盖以下配置：

`image_generate_demo`、`product_scene_image_demo`、`create_model_demo`、`model_wear_demo`、`product_main_detail_demo`、`detail_page_baihuo_demo`、`detail_page_demo`、`main_image_demo`、`image_transform_demo`、`image_baidi_tiqu`、`image_enhance_demo`、`multi_create_video_img`。

## 已授权素材暂存

只有确认拥有素材再发布权限后，才运行下载模式。下载仅进入本地 `data/yinghai-cases/assets/`，不会自动上传 COS 或进入生产素材库：

```bash
YINGHAI_COOKIE='name=value' \
YINGHAI_IMPORT_AUTHORIZED=true \
npm run import:yinghai-cases -- --download
```

下载文件名包含案例 ID、序号和 SHA-256 前 12 位，可用于判重。`manifest.json` 记录来源、采集时间、授权状态、配置键、案例数和图片数；每个配置还有一个独立 JSON 文件，供“做同款”弹窗适配器读取。

## 接入产品

生产环境应把这些记录映射成自有案例结构。未授权记录只显示“结构参考/来源”，使用自有或已授权封面；不要把原站真实商品、模特或成品图直接复制到生产资产库。授权素材经过审核后，才进入现有上传/COS 流程，并沿用素材 SHA-256 去重和“添加到素材库”生命周期。
