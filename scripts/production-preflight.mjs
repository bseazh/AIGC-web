import COS from "cos-nodejs-sdk-v5";

const required = ["ARK_API_KEY", "ARK_MODEL", "COS_BUCKET", "COS_REGION", "COS_SECRET_ID", "COS_SECRET_KEY"];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
  console.error(`Production preflight failed: missing ${missing.join(", ")}`);
  process.exit(1);
}

const cos = new COS({ SecretId: process.env.COS_SECRET_ID, SecretKey: process.env.COS_SECRET_KEY });
await new Promise((resolve, reject) => cos.headBucket({ Bucket: process.env.COS_BUCKET, Region: process.env.COS_REGION }, (error) => error ? reject(error) : resolve()));
console.log("COS access: OK");

const response = await fetch("https://ark.cn-beijing.volces.com/api/v3/models", {
  headers: { Authorization: `Bearer ${process.env.ARK_API_KEY}` },
});
if (!response.ok) throw new Error(`Ark credential check failed: HTTP ${response.status}`);
const payload = await response.json().catch(() => ({}));
const models = Array.isArray(payload?.data) ? payload.data.map((model) => model?.id) : [];
if (models.length && !models.includes(process.env.ARK_MODEL)) throw new Error(`Ark model is not enabled for this key: ${process.env.ARK_MODEL}`);
console.log(`Ark access: OK (${process.env.ARK_MODEL})`);
console.log("Preflight passed. Restart the worker, then submit one real task for each approved duration/resolution combination.");
