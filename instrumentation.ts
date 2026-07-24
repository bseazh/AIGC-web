import { installStructuredConsole, structuredLog } from "@/lib/logger";

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  installStructuredConsole();
  process.on("uncaughtExceptionMonitor", (error) => structuredLog("error", "uncaught_exception", { error }));
  process.on("unhandledRejection", (error) => structuredLog("error", "unhandled_rejection", { error }));
  structuredLog("info", "service_started", { pid: process.pid });
}
