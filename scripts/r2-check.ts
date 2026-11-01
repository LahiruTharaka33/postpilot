// Checks the R2 settings in .env: uploads a small file, reads it back publicly, then deletes it.
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { deleteObject, headObject, publicUrl, r2Config } from "../src/lib/r2";

async function main() {
  const config = r2Config();
  if (!config) throw new Error("R2 settings are incomplete in .env");
  const key = `${config.prefix}r2-check-${Date.now()}.txt`;
  const s3 = new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
  await s3.send(new PutObjectCommand({ Bucket: config.bucket, Key: key, Body: "ok", ContentType: "text/plain" }));
  console.log("upload with keys: ok");
  console.log("read back:", JSON.stringify(await headObject(config, key)));
  const res = await fetch(publicUrl(config, key));
  console.log("public address:", res.status, res.ok ? "ok" : "NOT reachable");
  await deleteObject(config, key);
  console.log("delete: ok");
}

main().catch((e) => {
  console.error("FAILED:", e.name, "-", e.message);
  process.exit(1);
});
