import { storage } from "@/shared/api/legacy-firebase/firebaseConfig";
import { ref, uploadString, getDownloadURL } from "firebase/storage";
import { getErrorMessage } from "@/shared/utils/errorUtils";

export interface StorageResponse {
  url: string | null;
  error: string | null;
}

export const uploadBase64FileToStorage = async (
  folder: string,
  fileName: string,
  base64Data: string
): Promise<StorageResponse> => {
  const response: StorageResponse = { url: null, error: null };

  try {
    const fileRef = ref(storage, `${folder}/${fileName}`);

    // Remove prefix if present like: "data:application/pdf;base64,"
    const cleanedBase64 = base64Data.includes("base64,")
      ? base64Data.split("base64,")[1]
      : base64Data;

    // Set content type metadata to help browsers recognize the file
    const metadata = {
      contentType: getContentType(fileName),
      cacheControl: 'public, max-age=31536000',
    };

    await uploadString(fileRef, cleanedBase64, "base64", metadata);

    // Get download URL with access token
    const url = await getDownloadURL(fileRef);
    response.url = url;
  } catch (err: unknown) {
    response.error = getErrorMessage(err);
    console.error("[Storage] Error uploading file:", err);
  }

  return response;
};

// Helper function to determine content type
function getContentType(fileName: string): string {
  const extension = fileName.split('.').pop()?.toLowerCase();
  const contentTypes: Record<string, string> = {
    pdf: 'application/pdf',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
  return contentTypes[extension || ''] || 'application/octet-stream';
}
