import JSZip from "jszip";

export const INVALID_EPUB_FILE_ERROR =
  "Invalid EPUB file. Please upload a valid .epub file.";
export const CLOUD_FILE_READ_ERROR =
  "Could not read this file. If it is stored in cloud storage, download it to your device first and try again.";

function isCloudFileReadError(error: unknown) {
  if (error instanceof DOMException && error.name.toLowerCase() === "notreadableerror") {
    return true;
  }

  if (!(error instanceof Error)) {
    return false;
  }

  const normalizedMessage = error.message.toLowerCase();

  return [
    "not readable",
    "notreadable",
    "permission denied",
    "access is denied",
    "network error",
    "networkerror",
    "failed to fetch",
    "could not be read",
    "icloud",
    "google drive",
    "onedrive",
  ].some((keyword) => normalizedMessage.includes(keyword));
}

export async function validateEpubFile(file: File): Promise<{ valid: boolean; error?: string }> {
  let fileBuffer: ArrayBuffer;

  try {
    fileBuffer = await file.arrayBuffer();
  } catch {
    return {
      valid: false,
      error: CLOUD_FILE_READ_ERROR,
    };
  }

  let zip: JSZip;

  try {
    zip = await JSZip.loadAsync(fileBuffer);
  } catch (error) {
    return {
      valid: false,
      error: isCloudFileReadError(error) ? CLOUD_FILE_READ_ERROR : INVALID_EPUB_FILE_ERROR,
    };
  }

  const mimetypeFile = zip.file("mimetype");

  if (!mimetypeFile) {
    return {
      valid: false,
      error: INVALID_EPUB_FILE_ERROR,
    };
  }

  try {
    const mimetype = (await mimetypeFile.async("string")).trim();

    if (mimetype !== "application/epub+zip") {
      return {
        valid: false,
        error: INVALID_EPUB_FILE_ERROR,
      };
    }
  } catch (error) {
    return {
      valid: false,
      error: isCloudFileReadError(error) ? CLOUD_FILE_READ_ERROR : INVALID_EPUB_FILE_ERROR,
    };
  }

  const containerFile = zip.file("META-INF/container.xml");

  if (!containerFile) {
    return {
      valid: false,
      error: INVALID_EPUB_FILE_ERROR,
    };
  }

  return { valid: true };
}