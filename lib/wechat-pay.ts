import { createDecipheriv, createPrivateKey, createPublicKey, createSign, createVerify, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

const baseUrl = "https://api.mch.weixin.qq.com";

export const rechargePackages = [
  { key: "starter", title: "基础积分包", amountFen: 1000, points: 100, description: "100 积分" },
  { key: "standard", title: "标准积分包", amountFen: 5000, points: 500, description: "500 积分" },
  { key: "pro", title: "进阶积分包", amountFen: 10000, points: 1000, description: "1,000 积分" },
] as const;

type WechatConfig = { mchId: string; appId: string; serialNo: string; apiV3Key: string; notifyUrl: string; privateKey: string; platformPublicKey: string };

function loadPem(value: string | undefined, name: string) {
  if (!value) throw new Error(`${name} is not configured`);
  const pem = value.includes("BEGIN") ? value.replace(/\\n/g, "\n") : readFileSync(value, "utf8");
  return pem.trim();
}

function config(): WechatConfig {
  const mchId = process.env.WECHAT_PAY_MCH_ID;
  const appId = process.env.WECHAT_PAY_APP_ID;
  const serialNo = process.env.WECHAT_PAY_MERCHANT_SERIAL_NO;
  const apiV3Key = process.env.WECHAT_PAY_API_V3_KEY;
  const notifyUrl = process.env.WECHAT_PAY_NOTIFY_URL;
  if (!mchId || !appId || !serialNo || !apiV3Key || !notifyUrl) throw new Error("WeChat Pay configuration is incomplete");
  if (Buffer.byteLength(apiV3Key) !== 32) throw new Error("WECHAT_PAY_API_V3_KEY must contain 32 bytes");
  const privateKey = loadPem(process.env.WECHAT_PAY_PRIVATE_KEY, "WECHAT_PAY_PRIVATE_KEY");
  const platformPublicKey = loadPem(process.env.WECHAT_PAY_PLATFORM_PUBLIC_KEY, "WECHAT_PAY_PLATFORM_PUBLIC_KEY");
  createPrivateKey(privateKey); createPublicKey(platformPublicKey);
  return { mchId, appId, serialNo, apiV3Key, notifyUrl, privateKey, platformPublicKey };
}

export function wechatPayEnabled() { return process.env.WECHAT_PAY_ENABLED === "true"; }
export function wechatMerchantId() { return process.env.WECHAT_PAY_MCH_ID || ""; }

function authorization(method: string, url: string, body: string, settings: WechatConfig) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = randomBytes(16).toString("hex");
  const parsed = new URL(url);
  const message = `${method}\n${parsed.pathname}${parsed.search}\n${timestamp}\n${nonce}\n${body}\n`;
  const signature = createSign("RSA-SHA256").update(message).sign(settings.privateKey, "base64");
  return `WECHATPAY2-SHA256-RSA2048 mchid="${settings.mchId}",nonce_str="${nonce}",timestamp="${timestamp}",serial_no="${settings.serialNo}",signature="${signature}"`;
}

export async function createWechatNativeOrder(order: { orderNo: string; description: string; amountFen: number }) {
  const settings = config();
  const body = JSON.stringify({ mchid: settings.mchId, appid: settings.appId, description: order.description, out_trade_no: order.orderNo, notify_url: settings.notifyUrl, amount: { total: order.amountFen, currency: "CNY" } });
  const url = `${baseUrl}/v3/pay/transactions/native`;
  const response = await fetch(url, { method: "POST", headers: { Authorization: authorization("POST", url, body, settings), "Content-Type": "application/json", Accept: "application/json", "Accept-Language": "zh-CN" }, body });
  const payload = await response.json().catch(() => null) as { prepay_id?: string; code_url?: string; message?: string } | null;
  if (!response.ok || !payload?.prepay_id || !payload.code_url) throw new Error(`WeChat Pay create order failed: ${payload?.message || response.status}`);
  return { prepayId: payload.prepay_id, codeUrl: payload.code_url };
}

export function verifyWechatNotification(headers: Headers, body: string) {
  const settings = config();
  const timestamp = headers.get("wechatpay-timestamp") || "";
  const nonce = headers.get("wechatpay-nonce") || "";
  const signature = headers.get("wechatpay-signature") || "";
  if (!timestamp || !nonce || !signature) return false;
  const verifier = createVerify("RSA-SHA256"); verifier.update(`${timestamp}\n${nonce}\n${body}\n`); verifier.end();
  return verifier.verify(settings.platformPublicKey, signature, "base64");
}

export function decryptWechatResource(resource: { ciphertext: string; nonce: string; associated_data?: string }) {
  const settings = config();
  const encrypted = Buffer.from(resource.ciphertext, "base64");
  const tag = encrypted.subarray(encrypted.length - 16);
  const ciphertext = encrypted.subarray(0, encrypted.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", Buffer.from(settings.apiV3Key), Buffer.from(resource.nonce));
  if (resource.associated_data) decipher.setAAD(Buffer.from(resource.associated_data));
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8")) as { out_trade_no?: string; transaction_id?: string; mchid?: string; trade_state?: string; success_time?: string; amount?: { total?: number; currency?: string } };
}
