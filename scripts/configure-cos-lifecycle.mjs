import COS from "cos-nodejs-sdk-v5";

const required = ["COS_BUCKET", "COS_REGION", "COS_SECRET_ID", "COS_SECRET_KEY"];
for (const name of required) if (!process.env[name]) throw new Error(`${name} is required`);

const cos = new COS({ SecretId: process.env.COS_SECRET_ID, SecretKey: process.env.COS_SECRET_KEY });
const options = { Bucket: process.env.COS_BUCKET, Region: process.env.COS_REGION };
const managedRules = [
  { ID: "aigc-temporary-expire-1d", Status: "Enabled", Filter: { Prefix: "temporary/" }, Expiration: { Days: "1" } },
  { ID: "aigc-postgres-backups-expire-30d", Status: "Enabled", Filter: { Prefix: "backups/postgres/" }, Expiration: { Days: "30" } },
];

function getLifecycle() {
  return new Promise((resolve, reject) => {
    cos.getBucketLifecycle(options, (error, data) => {
      if (error?.Code === "NoSuchLifecycleConfiguration" || error?.code === "NoSuchLifecycleConfiguration") resolve([]);
      else if (error) reject(error);
      else resolve(data?.Rules || []);
    });
  });
}

function putLifecycle(Rules) {
  return new Promise((resolve, reject) => {
    cos.putBucketLifecycle({ ...options, Rules }, (error) => error ? reject(error) : resolve());
  });
}

const existingRules = await getLifecycle();
const managedIds = new Set(managedRules.map((rule) => rule.ID));
const rules = [...existingRules.filter((rule) => !managedIds.has(rule.ID)), ...managedRules];
await putLifecycle(rules);
console.log(JSON.stringify({ event: "cos_lifecycle_configured", managedRuleIds: managedRules.map((rule) => rule.ID), totalRules: rules.length }));
