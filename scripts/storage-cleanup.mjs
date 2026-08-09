import COS from "cos-nodejs-sdk-v5";
import pg from "pg";

const { Pool } = pg;
const required = ["DATABASE_URL", "COS_BUCKET", "COS_REGION", "COS_SECRET_ID", "COS_SECRET_KEY"];
for (const name of required) if (!process.env[name]) throw new Error(`${name} is required`);

const dryRun = process.argv.includes("--dry-run");
const temporaryTtlHours = Number(process.env.STORAGE_TEMPORARY_TTL_HOURS || 24);
const uploadingTtlHours = Number(process.env.STORAGE_UPLOADING_TTL_HOURS || 24);
if (!Number.isFinite(temporaryTtlHours) || temporaryTtlHours <= 0) throw new Error("STORAGE_TEMPORARY_TTL_HOURS must be positive");
if (!Number.isFinite(uploadingTtlHours) || uploadingTtlHours <= 0) throw new Error("STORAGE_UPLOADING_TTL_HOURS must be positive");

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
const cos = new COS({ SecretId: process.env.COS_SECRET_ID, SecretKey: process.env.COS_SECRET_KEY });
const bucketOptions = { Bucket: process.env.COS_BUCKET, Region: process.env.COS_REGION };

function listObjects(Prefix, Marker) {
  return new Promise((resolve, reject) => {
    cos.getBucket({ ...bucketOptions, Prefix, Marker }, (error, data) => error ? reject(error) : resolve(data));
  });
}

function removeObject(Key) {
  return new Promise((resolve, reject) => {
    cos.deleteObject({ ...bucketOptions, Key }, (error) => error ? reject(error) : resolve());
  });
}

async function removeStaleTemporaryObjects() {
  const cutoff = Date.now() - temporaryTtlHours * 60 * 60 * 1000;
  let scanned = 0;
  let removed = 0;
  for (const prefix of ["temporary/", "users/"]) {
    let marker;
    do {
      const page = await listObjects(prefix, marker);
      const stale = (page.Contents || []).filter((item) => {
        scanned += 1;
        return (item.Key?.startsWith("temporary/") || item.Key?.includes("/temporary/")) && new Date(item.LastModified).getTime() < cutoff;
      });
      for (const item of stale) {
        if (!dryRun) await removeObject(item.Key);
        removed += 1;
      }
      marker = page.IsTruncated === "true" || page.IsTruncated === true ? page.NextMarker : undefined;
    } while (marker);
  }
  return { scanned, removed };
}

async function removeStaleUploads() {
  const result = await pool.query(
    "SELECT id, storage_key FROM assets WHERE audit_status = 'UPLOADING' AND created_at < NOW() - ($1 * INTERVAL '1 hour') ORDER BY created_at ASC LIMIT 500",
    [uploadingTtlHours],
  );
  let removed = 0;
  for (const asset of result.rows) {
    if (!dryRun) {
      await removeObject(asset.storage_key);
      await pool.query("DELETE FROM assets WHERE id = $1 AND audit_status = 'UPLOADING'", [asset.id]);
    }
    removed += 1;
  }
  return { found: result.rowCount, removed };
}

try {
  const [temporary, uploads] = await Promise.all([
    removeStaleTemporaryObjects(),
    removeStaleUploads(),
  ]);
  const summary = { event: "storage_cleanup_complete", dryRun, temporary, uploads, retainedAssets: "USER_INPUTS_AND_SAVED_OUTPUTS" };
  if (!dryRun) {
    await pool.query("INSERT INTO operations_runs (operation, status, summary) VALUES ('STORAGE_CLEANUP', 'SUCCEEDED', $1)", [JSON.stringify(summary)]);
  }
  console.log(JSON.stringify(summary));
} catch (error) {
  if (!dryRun) await pool.query("INSERT INTO operations_runs (operation, status, summary) VALUES ('STORAGE_CLEANUP', 'FAILED', $1)", [error instanceof Error ? error.message.slice(0, 2000) : "STORAGE_CLEANUP_FAILED"]).catch(() => undefined);
  throw error;
} finally {
  await pool.end();
}
