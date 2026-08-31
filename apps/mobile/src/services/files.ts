import * as DocumentPicker from "expo-document-picker";
import type { FileRecord } from "@clawwork/shared-types";
import { API_BASE_URL, apiRequest } from "./api/client";
import { authStore } from "../store/authStore";

type UploadUrlPayload = {
  fileId: string;
  uploadUrl: string;
  storageKey: string;
};

export type PickedAttachment = {
  uri: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
};

const SUPPORTED_ATTACHMENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/markdown",
  "text/plain",
  "text/csv"
];

function inferMimeType(filename: string) {
  const lower = filename.toLowerCase();

  if (lower.endsWith(".md")) {
    return "text/markdown";
  }

  if (lower.endsWith(".csv")) {
    return "text/csv";
  }

  if (lower.endsWith(".txt")) {
    return "text/plain";
  }

  if (lower.endsWith(".doc")) {
    return "application/msword";
  }

  if (lower.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }

  if (lower.endsWith(".xls")) {
    return "application/vnd.ms-excel";
  }

  if (lower.endsWith(".xlsx")) {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }

  if (lower.endsWith(".pdf")) {
    return "application/pdf";
  }

  if (lower.endsWith(".png")) {
    return "image/png";
  }

  if (lower.endsWith(".webp")) {
    return "image/webp";
  }

  return "image/jpeg";
}

function normalizePickedAttachment(
  asset: DocumentPicker.DocumentPickerAsset
): PickedAttachment {
  return {
    uri: asset.uri,
    filename: asset.name,
    mimeType: asset.mimeType || inferMimeType(asset.name),
    sizeBytes: asset.size ?? 0
  };
}

function rewriteLoopbackUploadUrl(rawUrl: string) {
  if (rawUrl.startsWith("/")) {
    return `${API_BASE_URL}${rawUrl}`;
  }

  const uploadUrl = new URL(rawUrl);
  if (
    uploadUrl.hostname !== "localhost" &&
    uploadUrl.hostname !== "127.0.0.1" &&
    uploadUrl.hostname !== "0.0.0.0"
  ) {
    return rawUrl;
  }

  const apiBase = new URL(API_BASE_URL);
  uploadUrl.hostname = apiBase.hostname;
  uploadUrl.protocol = apiBase.protocol;
  return uploadUrl.toString();
}

async function uploadBinary(file: PickedAttachment, uploadUrl: string) {
  const localFileResponse = await fetch(file.uri);
  const blob = await localFileResponse.blob();
  const resolvedUploadUrl = rewriteLoopbackUploadUrl(uploadUrl);
  const isApiUpload = new URL(resolvedUploadUrl).origin === new URL(API_BASE_URL).origin;
  const response = await fetch(resolvedUploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": file.mimeType,
      ...(isApiUpload && authStore.getState().accessToken
        ? { Authorization: `Bearer ${authStore.getState().accessToken}` }
        : {})
    },
    body: blob
  });

  if (!response.ok) {
    throw new Error(`upload failed: ${response.status}`);
  }
}

export async function pickAttachments(): Promise<PickedAttachment[]> {
  const result = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
    multiple: true,
    type: SUPPORTED_ATTACHMENT_TYPES
  });

  if (result.canceled) {
    return [];
  }

  return result.assets.map(normalizePickedAttachment);
}

export async function uploadAttachment(file: PickedAttachment): Promise<FileRecord> {
  const uploadMeta = await apiRequest<UploadUrlPayload>("/files/upload-url", {
    method: "POST",
    body: JSON.stringify({
      filename: file.filename,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes
    })
  });

  await uploadBinary(file, uploadMeta.uploadUrl);

  return apiRequest<FileRecord>("/files/complete", {
    method: "POST",
    body: JSON.stringify({
      fileId: uploadMeta.fileId,
      filename: file.filename,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      storageKey: uploadMeta.storageKey
    })
  });
}

export async function deleteUploadedFile(fileId: string) {
  return apiRequest<{ deleted: boolean; fileId: string }>(`/files/${fileId}`, {
    method: "DELETE"
  });
}

export { rewriteLoopbackUploadUrl };
