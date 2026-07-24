type LogLevel = "info" | "warn" | "error";

function serialize(value: unknown): unknown {
  if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack };
  if (typeof value === "bigint") return value.toString();
  return value;
}

export function structuredLog(level: LogLevel, event: string, fields: Record<string, unknown> = {}) {
  const entry = { timestamp: new Date().toISOString(), level, service: process.env.LOG_SERVICE || "aigc-web", event, ...fields };
  const line = JSON.stringify(entry, (_key, value) => serialize(value));
  if (level === "error") process.stderr.write(`${line}\n`);
  else process.stdout.write(`${line}\n`);
}

export function requestContext(request: Request, extra: Record<string, unknown> = {}) {
  return { requestId: request.headers.get("x-request-id") || undefined, ...extra };
}

export function installStructuredConsole() {
  for (const level of ["log", "warn", "error"] as const) {
    console[level] = (...args: unknown[]) => {
      const first = args[0];
      structuredLog(level === "log" ? "info" : level, typeof first === "string" ? first : "console", args.length > 1 ? { details: args.slice(1) } : typeof first === "object" && first !== null ? { details: first } : {});
    };
  }
}
