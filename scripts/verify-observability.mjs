const required = ["http://127.0.0.1:3100/ready", "http://127.0.0.1:3001/api/health"];
for (const url of required) {
  const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
}

const publicHealth = await fetch("https://aigc.bigapple.store/api/health/", { signal: AbortSignal.timeout(10_000) });
const requestId = publicHealth.headers.get("x-request-id");
if (!publicHealth.ok || !requestId) throw new Error("Public health response is missing X-Request-ID");
await new Promise((resolve) => setTimeout(resolve, 3_000));

const query = '{job="nginx"} | json | requestId="' + requestId + '"';
const nowNs = Date.now() * 1_000_000;
const response = await fetch(`http://127.0.0.1:3100/loki/api/v1/query_range?query=${encodeURIComponent(query)}&start=${nowNs - 60_000_000_000}&end=${nowNs}`, { signal: AbortSignal.timeout(5_000) });
const body = await response.json();
if (!response.ok || !Array.isArray(body?.data?.result) || body.data.result.length === 0) throw new Error("Nginx request log was not found in Loki");
console.log(JSON.stringify({ event: "observability_verified", requestId, lokiStreams: body.data.result.length, retentionDays: 30 }));
