import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import tls from "node:tls";
import { redis } from "@/lib/redis";

const CODE_TTL_SECONDS = 5 * 60;
const RESEND_SECONDS = 60;

function verificationSecret() {
  const value = process.env.EMAIL_CODE_SECRET || process.env.SESSION_SECRET;
  if (!value || value.length < 32) throw new Error("EMAIL_CODE_SECRET must contain at least 32 characters");
  return value;
}

function codeDigest(email: string, code: string) {
  return createHmac("sha256", verificationSecret()).update(`${email}:${code}`).digest("hex");
}

function encodeFromHeader(value: string, fallbackAddress: string) {
  const sanitized = value.replace(/[\r\n]/g, " ").trim();
  const match = sanitized.match(/^(.*?)\s*<([^<>]+)>$/);
  if (!match) return `<${fallbackAddress}>`;
  const name = match[1].trim();
  const address = match[2].trim();
  const encodedName = "=?UTF-8?B?" + Buffer.from(name).toString("base64") + "?=";
  return `${encodedName} <${address}>`;
}

function smtpConfig() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) throw new Error("SMTP is not configured");
  return {
    host,
    port: Number(process.env.SMTP_PORT || 465),
    user,
    pass,
    from: process.env.EMAIL_FROM || `芭乐AIGC <${user}>`,
  };
}

function smtpCommand(socket: tls.TLSSocket, command: string, accepted: number[]) {
  return new Promise<string>((resolve, reject) => {
    let response = "";
    const cleanup = () => {
      socket.off("data", onData);
      socket.off("error", onError);
      socket.off("timeout", onTimeout);
    };
    const onError = (error: Error) => { cleanup(); reject(error); };
    const onTimeout = () => { cleanup(); reject(new Error("SMTP connection timed out")); };
    const onData = (chunk: Buffer) => {
      response += chunk.toString("utf8");
      const lines = response.trimEnd().split(/\r?\n/);
      const last = lines.at(-1) || "";
      if (!/^\d{3} /.test(last)) return;
      cleanup();
      const status = Number(last.slice(0, 3));
      if (accepted.includes(status)) resolve(response);
      else reject(new Error(`SMTP rejected command with status ${status}`));
    };
    socket.on("data", onData);
    socket.on("error", onError);
    socket.on("timeout", onTimeout);
    if (command) socket.write(`${command}\r\n`);
  });
}

async function sendMail(to: string, code: string) {
  const config = smtpConfig();
  const socket = tls.connect({ host: config.host, port: config.port, servername: config.host, rejectUnauthorized: true });
  socket.setTimeout(10_000);
  try {
    await smtpCommand(socket, "", [220]);
    await smtpCommand(socket, "EHLO aigc.bigapple.store", [250]);
    await smtpCommand(socket, "AUTH LOGIN", [334]);
    await smtpCommand(socket, Buffer.from(config.user).toString("base64"), [334]);
    await smtpCommand(socket, Buffer.from(config.pass).toString("base64"), [235]);
    await smtpCommand(socket, `MAIL FROM:<${config.user}>`, [250]);
    await smtpCommand(socket, `RCPT TO:<${to}>`, [250, 251]);
    await smtpCommand(socket, "DATA", [354]);

    const subject = "=?UTF-8?B?" + Buffer.from("芭乐AIGC 邮箱验证码").toString("base64") + "?=";
    const html = `<div style="font-family:Arial,sans-serif;color:#283241;line-height:1.7"><h2>芭乐AIGC</h2><p>你的注册验证码是：</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p><p>验证码 5 分钟内有效。若非本人操作，请忽略此邮件。</p></div>`;
    const message = [
      `From: ${encodeFromHeader(config.from, config.user)}`,
      `To: <${to}>`,
      `Subject: ${subject}`,
      "MIME-Version: 1.0",
      "Content-Type: text/html; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      html,
      ".",
    ].join("\r\n");
    await smtpCommand(socket, message, [250]);
    await smtpCommand(socket, "QUIT", [221]);
  } finally {
    socket.destroy();
  }
}

export async function sendVerificationCode(email: string, ip: string) {
  smtpConfig();
  const cooldownKey = `email-code:cooldown:${email}`;
  if (await redis.exists(cooldownKey)) return { ok: false as const, reason: "COOLDOWN" as const };

  const hourKey = `email-code:hour:${email}`;
  const dayEmailKey = `email-code:day:email:${email}`;
  const dayIpKey = `email-code:day:ip:${ip}`;
  const [hourCount, dayEmailCount, dayIpCount] = await Promise.all([
    redis.incr(hourKey), redis.incr(dayEmailKey), redis.incr(dayIpKey),
  ]);
  await Promise.all([
    hourCount === 1 ? redis.expire(hourKey, 3600) : null,
    dayEmailCount === 1 ? redis.expire(dayEmailKey, 86400) : null,
    dayIpCount === 1 ? redis.expire(dayIpKey, 86400) : null,
  ]);
  if (hourCount > 5 || dayEmailCount > 10 || dayIpCount > 30) {
    return { ok: false as const, reason: "RATE_LIMIT" as const };
  }

  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  await sendMail(email, code);
  await redis.multi()
    .set(`email-code:value:${email}`, codeDigest(email, code), "EX", CODE_TTL_SECONDS)
    .set(cooldownKey, "1", "EX", RESEND_SECONDS)
    .exec();
  return { ok: true as const, expiresIn: CODE_TTL_SECONDS, retryAfter: RESEND_SECONDS };
}

export async function consumeVerificationCode(email: string, code: unknown) {
  if (typeof code !== "string" || !/^\d{6}$/.test(code)) return false;
  const key = `email-code:value:${email}`;
  const attemptsKey = `email-code:attempts:${email}`;
  const attempts = await redis.incr(attemptsKey);
  if (attempts === 1) await redis.expire(attemptsKey, CODE_TTL_SECONDS);
  if (attempts > 5) return false;
  const stored = await redis.get(key);
  if (!stored) return false;
  const actual = Buffer.from(codeDigest(email, code), "hex");
  const expected = Buffer.from(stored, "hex");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return false;
  await redis.del(key, attemptsKey);
  return true;
}
