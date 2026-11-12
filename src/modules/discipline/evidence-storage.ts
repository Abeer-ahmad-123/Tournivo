import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { AppError, invariant } from "@/lib/errors";
const maxSize = 10 * 1024 * 1024;
const mimeExtensions: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "application/pdf": "pdf",
  "video/mp4": "mp4",
};
export function validateEvidence(bytes: Uint8Array, mimeType: string) {
  invariant(
    bytes.length > 0 && bytes.length <= maxSize,
    422,
    "Evidence files must be between 1 byte and 10 MB.",
  );
  invariant(mimeType in mimeExtensions, 422, "Use PNG, JPEG, WebP, PDF or MP4 evidence.");
  const header = Buffer.from(bytes.subarray(0, 16));
  const matches =
    mimeType === "image/png"
      ? header.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : mimeType === "image/jpeg"
        ? header[0] === 255 && header[1] === 216 && header[2] === 255
        : mimeType === "application/pdf"
          ? header.subarray(0, 5).toString() === "%PDF-"
          : mimeType === "image/webp"
            ? header.subarray(0, 4).toString() === "RIFF" &&
              header.subarray(8, 12).toString() === "WEBP"
            : header.subarray(4, 8).toString() === "ftyp";
  invariant(matches, 422, "The file content does not match its declared type.");
}
function driver() {
  if (process.env.EVIDENCE_DRIVER === "local" && process.env.NODE_ENV !== "production")
    return "local";
  if (process.env.EVIDENCE_DRIVER === "s3" && process.env.S3_BUCKET && process.env.S3_REGION)
    return "s3";
  throw new AppError(503, "Private evidence storage is not configured.");
}
function client() {
  return new S3Client({
    region: process.env.S3_REGION,
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: !!process.env.S3_ENDPOINT,
  });
}
const localPath = (key: string) => {
  invariant(
    /^evidence\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.(png|jpg|webp|pdf|mp4)$/.test(key),
    422,
    "Invalid evidence identity.",
  );
  return resolve(".local/private-objects", key);
};
export function evidenceStorageConfigured() {
  try {
    driver();
    return true;
  } catch {
    return false;
  }
}
export async function putEvidence(caseId: string, bytes: Uint8Array, mimeType: string) {
  validateEvidence(bytes, mimeType);
  const key = `evidence/${caseId}/${randomUUID()}.${mimeExtensions[mimeType]}`;
  if (driver() === "local") {
    const path = localPath(key);
    await mkdir(resolve(path, ".."), { recursive: true, mode: 0o700 });
    await writeFile(path, bytes, { mode: 0o600, flag: "wx" });
  } else
    await client().send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET!,
        Key: key,
        Body: bytes,
        ContentType: mimeType,
        CacheControl: "private, no-store",
      }),
    );
  return key;
}
export async function readEvidence(key: string) {
  if (driver() === "local") return new Uint8Array(await readFile(localPath(key)));
  const result = await client().send(
    new GetObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: key }),
  );
  invariant(result.Body, 404, "Evidence file not found.");
  return result.Body.transformToByteArray();
}
export async function removeEvidence(key: string) {
  if (driver() === "local") await unlink(localPath(key));
  else await client().send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: key }));
}
