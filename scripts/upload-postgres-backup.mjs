import { createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import { basename } from "node:path";
import COS from "cos-nodejs-sdk-v5";

const backupFile = process.argv[2];
if (!backupFile) throw new Error("Usage: node scripts/upload-postgres-backup.mjs <backup-file>");
await access(backupFile);
const required = ["COS_BUCKET", "COS_REGION", "COS_SECRET_ID", "COS_SECRET_KEY"];
for (const name of required) if (!process.env[name]) throw new Error(`${name} is required`);

const cos = new COS({ SecretId: process.env.COS_SECRET_ID, SecretKey: process.env.COS_SECRET_KEY });
const Key = `backups/postgres/${basename(backupFile)}`;
await new Promise((resolve, reject) => {
  cos.putObject({
    Bucket: process.env.COS_BUCKET,
    Region: process.env.COS_REGION,
    Key,
    Body: createReadStream(backupFile),
    ContentType: "application/gzip",
    ContentDisposition: `attachment; filename="${basename(backupFile)}"`,
  }, (error) => error ? reject(error) : resolve());
});
console.log(JSON.stringify({ event: "postgres_backup_uploaded", key: Key }));
