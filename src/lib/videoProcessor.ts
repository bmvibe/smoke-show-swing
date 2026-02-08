"use client";

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";

let ffmpeg: FFmpeg | null = null;
let ffmpegInitialized = false;

async function initFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInitialized && ffmpeg) {
    return ffmpeg;
  }

  const ffmpegInstance = new FFmpeg();

  try {
    const baseURL = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm";

    await ffmpegInstance.load({
      coreURL: `${baseURL}/ffmpeg-core.js`,
      wasmURL: `${baseURL}/ffmpeg-core.wasm`,
    });

    ffmpeg = ffmpegInstance;
    ffmpegInitialized = true;
    return ffmpegInstance;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to initialize video processing: ${errorMsg}`);
  }
}

async function detectAndConvertVideo(
  file: File,
  onProgress?: (progress: number) => void
): Promise<Blob> {
  const instance = await initFFmpeg();

  try {
    const inputName = `input.${file.name.split(".").pop()}`;
    const outputName = "output.mp4";

    const fileData = await fetchFile(file);
    await instance.writeFile(inputName, fileData);

    await instance.exec([
      "-i", inputName,
      "-c:v", "libx264",
      "-preset", "medium",
      "-crf", "24",
      "-vf", "scale=1280:-1",
      "-c:a", "aac",
      "-b:a", "128k",
      "-movflags", "faststart",
      outputName,
    ]);

    const outputData = await instance.readFile(outputName);

    const uint8Array = new Uint8Array(outputData as any);
    const outputBlob = new Blob([uint8Array.buffer.slice(
      uint8Array.byteOffset,
      uint8Array.byteOffset + uint8Array.byteLength
    )], { type: "video/mp4" });

    try {
      await instance.deleteFile(inputName);
      await instance.deleteFile(outputName);
    } catch {
      // Cleanup is best-effort
    }

    if (onProgress) {
      onProgress(100);
    }

    return outputBlob;
  } catch (error) {
    throw new Error(
      `Failed to convert video: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

function isWebAssemblySupported(): boolean {
  try {
    return typeof WebAssembly === "object" && typeof WebAssembly.instantiate === "function";
  } catch {
    return false;
  }
}

export async function processVideoFile(
  file: File,
  onProgress?: (progress: number) => void
): Promise<{ blob: Blob; filename: string }> {
  let convertedBlob: Blob | File = file;

  if (isWebAssemblySupported()) {
    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("FFmpeg initialization timed out")), 30000)
      );

      convertedBlob = await Promise.race([
        detectAndConvertVideo(file, onProgress),
        timeoutPromise,
      ]);
    } catch {
      // Client-side conversion failed — server will handle HEVC via Cloudinary
      convertedBlob = file;
    }
  }

  const filename = `swing-${Date.now()}.${file.name.split('.').pop()}`;

  return { blob: convertedBlob, filename };
}
