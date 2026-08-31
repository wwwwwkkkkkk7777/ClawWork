import { z } from "zod";

export const FileStatusSchema = z.enum(["uploading", "uploaded", "failed"]);

export const FileRecordSchema = z.object({
  fileId: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  uploadedAt: z.string().nullable(),
  status: FileStatusSchema,
  storageKey: z.string(),
  downloadUrl: z.string().url().optional()
});

export const ArtifactKindSchema = z.enum(["excel", "pdf", "docx"]);

export const ArtifactResultSchema = z.object({
  type: z.literal("artifact"),
  artifact: z.object({
    kind: ArtifactKindSchema,
    fileName: z.string(),
    mimeType: z.string(),
    artifactId: z.string().optional(),
    downloadUrl: z.string().url().optional(),
    previewText: z.string(),
    sizeBytes: z.number().int().nonnegative().optional()
  })
});

export type FileRecord = z.infer<typeof FileRecordSchema>;
export type ArtifactResult = z.infer<typeof ArtifactResultSchema>;
