import "server-only";
import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ACCEPTED_ATTACHMENT_IMAGE_TYPES,
  CREATE_ATTACHMENT_BUCKET,
  MAX_ATTACHMENT_IMAGE_BYTES,
} from "@/lib/create-attachment-image";
import { logApiError } from "@/lib/log-error";

// Server-side download/resize for Create Anything's optional attached
// image (api/create/route.ts) — same shape as
// lib/website-reference-image-server.ts's downloadReferenceImage, kept as
// a separate small file rather than generalizing that one further since
// the two buckets have different visibility (private vs public) and
// purposes (vision context only vs embeddable-in-output); sharing this
// much logic via copy is an acceptable, honest trade-off given how small
// each file is.

export type AttachmentImage = { base64: string; mediaType: "image/jpeg" | "image/png" };

function isSupportedAttachmentImageType(contentType: string): contentType is "image/jpeg" | "image/png" {
  return (ACCEPTED_ATTACHMENT_IMAGE_TYPES as readonly string[]).includes(contentType);
}

const ATTACHMENT_IMAGE_MAX_DIMENSION = 1568;

async function resizeIfNeeded(buffer: Buffer): Promise<Buffer> {
  try {
    return await sharp(buffer)
      .resize({
        width: ATTACHMENT_IMAGE_MAX_DIMENSION,
        height: ATTACHMENT_IMAGE_MAX_DIMENSION,
        fit: "inside",
        withoutEnlargement: true,
      })
      .toBuffer();
  } catch (err) {
    logApiError("attachment-image-server", err, { stage: "resize" });
    return buffer;
  }
}

export async function downloadAttachmentImages(
  supabase: SupabaseClient,
  paths: string[],
  callerContext: string
): Promise<AttachmentImage[]> {
  const results = await Promise.all(
    paths.map(async (path): Promise<AttachmentImage | null> => {
      try {
        const { data: blob, error } = await supabase.storage.from(CREATE_ATTACHMENT_BUCKET).download(path);
        if (error || !blob) {
          logApiError(callerContext, error, { stage: "attachment_image_download" });
          return null;
        }
        if (blob.size > MAX_ATTACHMENT_IMAGE_BYTES || !isSupportedAttachmentImageType(blob.type)) {
          return null;
        }
        const arrayBuffer = await blob.arrayBuffer();
        const resized = await resizeIfNeeded(Buffer.from(arrayBuffer));
        return { base64: resized.toString("base64"), mediaType: blob.type };
      } catch (err) {
        logApiError(callerContext, err, { stage: "attachment_image_download" });
        return null;
      }
    })
  );
  return results.filter((image): image is AttachmentImage => image !== null);
}
