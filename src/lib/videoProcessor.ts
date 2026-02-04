"use client";

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";

let ffmpeg: FFmpeg | null = null;
let ffmpegInitialized = false;

export async function initFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInitialized && ffmpeg) {
    console.log("[FFmpeg] Using cached FFmpeg instance");
    return ffmpeg;
  }

  console.log("[FFmpeg] Creating new FFmpeg instance...");
  const ffmpegInstance = new FFmpeg();

  ffmpegInstance.on("log", ({ message }) => {
    console.log("[FFmpeg:log]", message);
  });

  try {
    const baseURL = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm";
    console.log("[FFmpeg] Loading core files from CDN...");
    console.log("[FFmpeg] Base URL:", baseURL);

    const coreURL = `${baseURL}/ffmpeg-core.js`;
    const wasmURL = `${baseURL}/ffmpeg-core.wasm`;

    console.log("[FFmpeg] Core JS URL:", coreURL);
    console.log("[FFmpeg] WASM URL:", wasmURL);

    // Verify URLs are reachable
    console.log("[FFmpeg] Verifying CDN connectivity...");
    try {
      const coreCheck = await fetch(coreURL, { method: "HEAD" });
      console.log("[FFmpeg] Core JS HEAD request status:", coreCheck.status);
      if (!coreCheck.ok) {
        console.warn("[FFmpeg] Core JS HEAD check failed, but continuing...");
      }
    } catch (e) {
      console.warn("[FFmpeg] Core JS connectivity check failed (may be OK):", e instanceof Error ? e.message : e);
    }

    console.log("[FFmpeg] Calling ffmpegInstance.load()...");
    await ffmpegInstance.load({
      coreURL: coreURL,
      wasmURL: wasmURL,
    });

    ffmpeg = ffmpegInstance;
    ffmpegInitialized = true;
    console.log("[FFmpeg] ✓ FFmpeg initialized successfully");
    return ffmpegInstance;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : "N/A";

    console.error("[FFmpeg] ✗ Failed to initialize FFmpeg");
    console.error("[FFmpeg] Error message:", errorMsg);
    console.error("[FFmpeg] Error stack:", errorStack);
    console.error("[FFmpeg] Full error object:", error);

    throw new Error(`Failed to initialize video processing: ${errorMsg}`);
  }
}

export async function detectAndConvertVideo(
  file: File,
  onProgress?: (progress: number) => void
): Promise<Blob> {
  console.log(`[Convert] Processing video: ${file.name} (${file.size} bytes)`);

  // Initialize FFmpeg if not already done
  console.log(`[Convert] Initializing FFmpeg...`);
  const instance = await initFFmpeg();
  console.log(`[Convert] FFmpeg ready`);

  try {
    // Write input file to FFmpeg's file system
    const inputName = `input.${file.name.split(".").pop()}`;
    const outputName = "output.mp4";

    console.log(`[Convert] Writing input file: ${inputName}`);
    const fileData = await fetchFile(file);
    console.log(`[Convert] File data fetched, size: ${fileData instanceof Blob ? fileData.size : (fileData as any).length} bytes`);

    await instance.writeFile(inputName, fileData);
    console.log(`[Convert] Input file written to FFmpeg filesystem`);

    // Run FFmpeg command to convert to H.264 with scaling
    // This ensures compatibility with Gemini API
    console.log("[Convert] Starting FFmpeg conversion...");
    await instance.exec([
      "-i",
      inputName,
      "-c:v",
      "libx264", // H.264 codec (highly compatible)
      "-preset",
      "medium", // Balance between speed and compression
      "-crf",
      "24", // Quality (lower = better, 24 is high quality)
      "-vf",
      "scale=1280:-1", // Scale width to 1280, maintain aspect ratio
      "-c:a",
      "aac", // Audio codec
      "-b:a",
      "128k", // Audio bitrate
      "-movflags",
      "faststart", // Enable streaming (data at beginning)
      outputName,
    ]);

    console.log("[Convert] Conversion completed, reading output file...");

    // Read output file
    const outputData = await instance.readFile(outputName);
    console.log(`[Convert] Output data read, size: ${outputData instanceof Blob ? outputData.size : (outputData as any).length} bytes`);

    // Convert FileData to a proper Blob-compatible format
    const uint8Array = new Uint8Array(outputData as any);
    const outputBlob = new Blob([uint8Array.buffer.slice(
      uint8Array.byteOffset,
      uint8Array.byteOffset + uint8Array.byteLength
    )], { type: "video/mp4" });

    console.log(
      `[Convert] ✓ Conversion successful: ${inputName} -> ${outputName} (${outputBlob.size} bytes, ${(outputBlob.size / (1024 * 1024)).toFixed(2)}MB)`
    );

    // Clean up files from FFmpeg filesystem
    try {
      await instance.deleteFile(inputName);
      await instance.deleteFile(outputName);
      console.log(`[Convert] Cleaned up temporary files`);
    } catch (e) {
      console.warn("[Convert] Failed to clean up FFmpeg files:", e);
    }

    if (onProgress) {
      onProgress(100);
    }

    return outputBlob;
  } catch (error) {
    console.error("[Convert] ✗ FFmpeg conversion error:", error);
    console.error("[Convert] Error details:", error instanceof Error ? error.stack : String(error));
    throw new Error(
      `Failed to convert video: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

export function isLikelyHevc(file: File): boolean {
  // Check file extension
  const isMov = file.name.toLowerCase().endsWith(".mov");
  const isHeic = file.name.toLowerCase().endsWith(".heic");

  // iOS typically uses .mov for HEVC videos
  // HEVC/H.265 is common in modern iOS but check MIME type
  const isHevcMimeType = file.type === "video/mp4" && isMov; // iOS MOV files with mp4 MIME are often HEVC

  return isMov || isHeic || isHevcMimeType;
}

export async function processVideoFile(
  file: File,
  onProgress?: (progress: number) => void
): Promise<{ blob: Blob; filename: string }> {
  // Always convert for consistency and Gemini compatibility
  // This handles both HEVC and H.264 files, ensuring optimal format
  console.log(`[VideoProcessor] Starting video file processing: ${file.name} (${file.size} bytes, type: ${file.type})`);

  try {
    console.log(`[VideoProcessor] Initializing FFmpeg...`);
    const convertedBlob = await detectAndConvertVideo(file, onProgress);
    console.log(`[VideoProcessor] Conversion completed. Output size: ${convertedBlob.size} bytes`);

    // Create new filename for converted file
    const filename = `swing-${Date.now()}.mp4`;
    console.log(`[VideoProcessor] Created output filename: ${filename}`);

    return {
      blob: convertedBlob,
      filename,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[VideoProcessor] Processing failed: ${errorMessage}`);
    console.error(`[VideoProcessor] Stack:`, error instanceof Error ? error.stack : 'N/A');

    // Provide more specific error messages
    if (errorMessage.includes("FFmpeg")) {
      throw new Error(`Video conversion failed (FFmpeg issue). Please check your internet connection and try again. Error: ${errorMessage}`);
    }
    if (errorMessage.includes("wasm")) {
      throw new Error(`Video processing library failed to load. Please refresh the page and try again.`);
    }
    if (errorMessage.includes("file")) {
      throw new Error(`Could not read your video file. Please make sure the file is valid and try again.`);
    }

    throw error;
  }
}
