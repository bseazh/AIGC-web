import tls from "node:tls";

function encodeFromHeader(value: string, fallbackAddress: string) {
  const sanitized = value.replace(/[\r\n]/g, " ").trim();
  const match = sanitized.match(/^(.*?)\s*<([^<>]+)>$/);
  if (!match) return `<${fallbackAddress}>`;
  const encodedName = "=?UTF-8?B?" + Buffer.from(match[1].trim()).toString("base64") + "?=";
  return `${encodedName} <${match[2].trim()}>`;
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
      const last = response.trimEnd().split(/\r?\n/).at(-1) || "";
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

export function emailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

export async function sendEmail(to: string, subjectText: string, html: string) {
  const config = smtpConfig();
  const recipient = to.replace(/[\r\n<>]/g, "").trim();
  const subject = "=?UTF-8?B?" + Buffer.from(subjectText.replace(/[\r\n]/g, " ")).toString("base64") + "?=";
  const socket = tls.connect({ host: config.host, port: config.port, servername: config.host, rejectUnauthorized: true });
  socket.setTimeout(10_000);
  try {
    await smtpCommand(socket, "", [220]);
    await smtpCommand(socket, "EHLO aigc.bigapple.store", [250]);
    await smtpCommand(socket, "AUTH LOGIN", [334]);
    await smtpCommand(socket, Buffer.from(config.user).toString("base64"), [334]);
    await smtpCommand(socket, Buffer.from(config.pass).toString("base64"), [235]);
    await smtpCommand(socket, `MAIL FROM:<${config.user}>`, [250]);
    await smtpCommand(socket, `RCPT TO:<${recipient}>`, [250, 251]);
    await smtpCommand(socket, "DATA", [354]);
    const body = html.replace(/\r?\n\./g, "\r\n..");
    const message = [
      `From: ${encodeFromHeader(config.from, config.user)}`,
      `To: <${recipient}>`,
      `Subject: ${subject}`,
      "MIME-Version: 1.0",
      "Content-Type: text/html; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      body,
      ".",
    ].join("\r\n");
    await smtpCommand(socket, message, [250]);
    await smtpCommand(socket, "QUIT", [221]);
  } finally {
    socket.destroy();
  }
}

export function emailLayout(content: string) {
  return `<div style="font-family:Arial,sans-serif;color:#283241;line-height:1.7"><h2>芭乐AIGC</h2>${content}<p style="color:#728096;font-size:12px">此邮件由系统自动发送，请勿直接回复。</p></div>`;
}
