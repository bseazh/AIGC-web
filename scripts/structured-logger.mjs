function normalize(value) {
  if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack };
  if (typeof value === "object" && value !== null) return value;
  return String(value);
}

export function log(level, event, fields = {}) {
  const entry = { timestamp: new Date().toISOString(), level, service: process.env.LOG_SERVICE || "aigc-service", event, ...fields };
  process[level === "error" ? "stderr" : "stdout"].write(`${JSON.stringify(entry)}\n`);
}

export function installStructuredConsole(service) {
  process.env.LOG_SERVICE = process.env.LOG_SERVICE || service;
  for (const level of ["log", "warn", "error"]) {
    console[level] = (...args) => {
      const first = args[0];
      const fields = args.slice(1).map(normalize);
      log(level === "log" ? "info" : level, typeof first === "string" ? first : "console", { ...(typeof first === "object" && first !== null ? first : {}), ...(fields.length ? { details: fields } : {}) });
    };
  }
}
