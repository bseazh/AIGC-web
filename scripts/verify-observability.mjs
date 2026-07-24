const required = ["http://127.0.0.1:3100/ready", "http://127.0.0.1:3001/api/health"];
for (const url of required) {
  const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
}

const publicHealth = await fetch("https://aigc.bigapple.store/api/health/", { signal: AbortSignal.timeout(10_000) });
const requestId = publicHealth.headers.get("x-request-id");
if (!publicHealth.ok || !requestId) throw new Error("Public health response is missing X-Request-ID");

const query = `{job="nginx"} |= "${requestId}"`;
let streams = 0;
for (let attempt = 0; attempt < 15; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 2_000));
  const nowNs = BigInt(Date.now()) * 1_000_000n;
  const response = await fetch(`http://127.0.0.1:3100/loki/api/v1/query_range?query=${encodeURIComponent(query)}&start=${nowNs - 60_000_000_000n}&end=${nowNs}`, { signal: AbortSignal.timeout(5_000) });
  const body = await response.json();
  if (response.ok && Array.isArray(body?.data?.result)) streams = body.data.result.length;
  if (streams) break;
}
if (!streams) throw new Error("Nginx request log was not found in Loki");
console.log(JSON.stringify({ event: "observability_verified", requestId, lokiStreams: streams, retentionDays: 30 }));
