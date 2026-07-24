import tls from "node:tls";

const [subjectText = "AIGC alert", bodyText = "No details"] = process.argv.slice(2);
const host = process.env.SMTP_HOST; const user = process.env.SMTP_USER; const pass = process.env.SMTP_PASS;
const recipient = (process.env.ALERT_EMAIL_TO || user || "").replace(/[\r\n<>]/g, "").trim();
if (!host || !user || !pass || !recipient) throw new Error("SMTP alert configuration is incomplete");

function command(socket, value, accepted) {
  return new Promise((resolve, reject) => {
    let response = "";
    const cleanup = () => { socket.off("data", onData); socket.off("error", onError); socket.off("timeout", onTimeout); };
    const onError = (error) => { cleanup(); reject(error); };
    const onTimeout = () => { cleanup(); reject(new Error("SMTP alert timed out")); };
    const onData = (chunk) => { response += chunk.toString("utf8"); const last = response.trimEnd().split(/\r?\n/).at(-1) || ""; if (!/^\d{3} /.test(last)) return; cleanup(); const status = Number(last.slice(0, 3)); accepted.includes(status) ? resolve(response) : reject(new Error(`SMTP rejected alert with ${status}`)); };
    socket.on("data", onData); socket.on("error", onError); socket.on("timeout", onTimeout); if (value) socket.write(`${value}\r\n`);
  });
}

const socket = tls.connect({ host, port: Number(process.env.SMTP_PORT || 465), servername: host, rejectUnauthorized: true });
socket.setTimeout(10_000);
try {
  await command(socket, "", [220]); await command(socket, "EHLO aigc.bigapple.store", [250]); await command(socket, "AUTH LOGIN", [334]);
  await command(socket, Buffer.from(user).toString("base64"), [334]); await command(socket, Buffer.from(pass).toString("base64"), [235]);
  await command(socket, `MAIL FROM:<${user}>`, [250]); await command(socket, `RCPT TO:<${recipient}>`, [250, 251]); await command(socket, "DATA", [354]);
  const subject = `=?UTF-8?B?${Buffer.from(subjectText.replace(/[\r\n]/g, " ")).toString("base64")}?=`;
  const body = bodyText.replace(/\r?\n\./g, "\r\n..");
  await command(socket, [`From: Bala AIGC <${user}>`, `To: <${recipient}>`, `Subject: ${subject}`, "MIME-Version: 1.0", "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: 8bit", "", body, "."].join("\r\n"), [250]);
  await command(socket, "QUIT", [221]);
  console.log(JSON.stringify({ event: "alert_email_sent", recipientConfigured: true }));
} finally { socket.destroy(); }
