import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const checkScript = path.join(repository, "scripts/check-health-alert.sh");
const temporary = await mkdtemp(path.join(tmpdir(), "aigc-health-alert-test-"));
const alertsFile = path.join(temporary, "alerts.log");
const stateFile = path.join(temporary, "state");
const alertSender = path.join(temporary, "send-alert.sh");
const observabilityScript = path.join(temporary, "observability.mjs");

let health = { status: "degraded", checks: { moderation: "down", database: "up" } };
const server = http.createServer((_request, response) => {
  response.writeHead(health.status === "unhealthy" ? 503 : 200, { "Content-Type": "application/json" });
  response.end(JSON.stringify(health));
});

await writeFile(alertSender, "#!/usr/bin/env bash\nprintf '%s\\n' \"$1\" >> \"$AIGC_TEST_ALERTS_FILE\"\n", { mode: 0o700 });
await writeFile(observabilityScript, "process.exit(0);\n");
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
if (!address || typeof address === "string") throw new Error("Test HTTP server did not start");

function runCheck() {
  return new Promise((resolve, reject) => {
    const child = spawn("bash", [checkScript], {
      cwd: repository,
      env: {
        ...process.env,
        AIGC_PROJECT_DIR: temporary,
        AIGC_HEALTH_URL: `http://127.0.0.1:${address.port}/api/health/`,
        AIGC_ALERT_SENDER: alertSender,
        AIGC_TEST_ALERTS_FILE: alertsFile,
        AIGC_OBSERVABILITY_SCRIPT: observabilityScript,
        AIGC_HEALTH_ALERT_STATE_FILE: stateFile,
        HEALTH_ALERT_REPEAT_SECONDS: "21600",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stderr }));
  });
}

async function alertSubjects() {
  return (await readFile(alertsFile, "utf8")).trim().split("\n").filter(Boolean);
}

try {
  assert.equal((await runCheck()).code, 1);
  assert.deepEqual(await alertSubjects(), ["[AIGC] Health degraded"]);

  assert.equal((await runCheck()).code, 1);
  assert.equal((await alertSubjects()).length, 1, "unchanged incidents must be suppressed");

  health = { status: "degraded", checks: { notifications: "down", database: "up" } };
  assert.equal((await runCheck()).code, 1);
  assert.deepEqual(await alertSubjects(), ["[AIGC] Health degraded", "[AIGC] Health degraded"]);

  health = { status: "healthy", checks: { notifications: "up", database: "up" } };
  assert.equal((await runCheck()).code, 0);
  assert.deepEqual(await alertSubjects(), ["[AIGC] Health degraded", "[AIGC] Health degraded", "[AIGC] Health recovered"]);

  assert.equal((await runCheck()).code, 0);
  assert.equal((await alertSubjects()).length, 3, "recovery must only be sent once");
  console.log("PASS: health alert deduplication and recovery");
} finally {
  await new Promise((resolve) => server.close(resolve));
  await rm(temporary, { recursive: true, force: true });
}
