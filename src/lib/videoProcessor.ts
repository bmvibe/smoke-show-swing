"use client";

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";

let ffmpeg: FFmpeg | null = null;
let ffmpegInitialized = false;

// Helper function to convert blob URLs
async function toBlobURL(url: string, mimeType: string): Promise<string> {
  const response = await fetch(url);
  const blob = await response.blob();
  return URL.createObjectURL(new Blob([blob], { type: mimeType }));
}

export async function initFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInitialized && ffmpeg) {
    return ffmpeg;
  }

  const ffmpegInstance = new FFmpeg();

  ffmpegInstance.on("log", ({ message }) => {
    console.log("[FFmpeg]", message);
  });

  try {
    const baseURL = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm";
    await ffmpegInstance.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(
        `${baseURL}/ffmpeg-core.wasm`,
        "application/wasm"
      ),
    });

    ffmpeg = ffmpegInstance;
    ffmpegInitialized = true;
    console.log("FFmpeg initialized successfully");
    return ffmpegInstance;
  } catch (error) {
    console.error("Failed to initialize FFmpeg:", error);
    throw error;
  }
}

export async function detectAndConvertVideo(
  file: File,
  onProgress?: (progress: number) => void
): Promise<Blob> {
  console.log(`Processing video: ${file.name} (${file.size} bytes)`);

  // Initialize FFmpeg if not already done
  const instance = await initFFmpeg();

  try {
    // Write input file to FFmpeg's file system
    const inputName = `input.${file.name.split(".").pop()}`;
    const outputName = "output.mp4";

    console.log(`Writing input file: ${inputName}`);
    await instance.writeFile(inputName, await fetchFile(file));

    // Run FFmpeg command to convert to H.264 with scaling
    // This ensures compatibility with Gemini API
    console.log("Starting FFmpeg conversion...");
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

    console.log("Conversion completed, reading output file...");

    // Read output file
    const outputData = await instance.readFile(outputName);
    // Convert FileData to a proper Blob-compatible format
    const uint8Array = new Uint8Array(outputData as any);
    const outputBlob = new Blob([uint8Array.buffer.slice(
      uint8Array.byteOffset,
      uint8Array.byteOffset + uint8Array.byteLength
    )], { type: "video/mp4" });

    console.log(
      `Conversion successful: ${inputName} -> ${outputName} (${outputBlob.size} bytes)`
    );

    // Clean up files from FFmpeg filesystem
    try {
      await instance.deleteFile(inputName);
      await instance.deleteFile(outputName);
    } catch (e) {
      console.warn("Failed to clean up FFmpeg files:", e);
    }

    if (onProgress) {
      onProgress(100);
    }

    return outputBlob;
  } catch (error) {
    console.error("FFmpeg conversion error:", error);
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
  console.log(`Processing video file: ${file.name}`);

  const convertedBlob = await detectAndConvertVideo(file, onProgress);

  // Create new filename for converted file
  const filename = `swing-${Date.now()}.mp4`;

  return {
    blob: convertedBlob,
    filename,
  };
}
