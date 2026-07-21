import COS from "cos-nodejs-sdk-v5";

let client: COS | undefined;

function config() {
  const Bucket = process.env.COS_BUCKET;
  const Region = process.env.COS_REGION;
  const SecretId = process.env.COS_SECRET_ID;
  const SecretKey = process.env.COS_SECRET_KEY;
  if (!Bucket || !Region || !SecretId || !SecretKey) {
    throw new Error("COS is not configured");
  }
  return { Bucket, Region, SecretId, SecretKey };
}

export function getCosClient() {
  if (!client) {
    const { SecretId, SecretKey } = config();
    client = new COS({ SecretId, SecretKey });
  }
  return client;
}

export function createSignedObjectUrl(Key: string, Method: "GET" | "PUT", expires = 600) {
  const { Bucket, Region } = config();
  return new Promise<string>((resolve, reject) => {
    getCosClient().getObjectUrl({ Bucket, Region, Key, Method, Sign: true, Expires: expires }, (error, data) => {
      if (error || !data?.Url) reject(error || new Error("COS did not return a signed URL"));
      else resolve(data.Url);
    });
  });
}

export async function inspectObject(Key: string) {
  const { Bucket, Region } = config();
  return new Promise<{ contentLength: number; contentType: string }>((resolve, reject) => {
    getCosClient().getObject({ Bucket, Region, Key, Range: "bytes=0-0" }, (error, data) => {
      if (error) {
        reject(error);
        return;
      }
      const headers = data.headers as Record<string, string>;
      const contentRange = headers["content-range"];
      resolve({
        contentLength: contentRange ? Number(contentRange.split("/").pop()) : Number(headers["content-length"] || 0),
        contentType: String(headers["content-type"] || "").split(";")[0],
      });
    });
  });
}

export async function removeObject(Key: string) {
  const { Bucket, Region } = config();
  return new Promise<void>((resolve, reject) => {
    getCosClient().deleteObject({ Bucket, Region, Key }, (error) => error ? reject(error) : resolve());
  });
}
