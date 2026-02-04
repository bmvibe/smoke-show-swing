import { GoogleGenerativeAI } from "@google/generative-ai";
import { GoogleAIFileManager } from "@google/generative-ai/server";
import { NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

// Helper function to detect video codec from file
function detectCodecFromBuffer(buffer: Buffer): { codec: string; details: string } {
  // Check for ftypisom (MP4 file signature)
  if (buffer.toString("hex", 4, 8) === "66747970") {
    // It's an MP4 container, codec detection is more complex
    // For now, we trust the client has done proper H.264 conversion
    return { codec: "h264", details: "MP4 container (client-converted)" };
  }

  // Check for common video file signatures
  const hex = buffer.toString("hex", 0, 12);
  console.log("File signature:", hex);

  // HEVC signature is harder to detect without parsing
  // but MOV files often have 'ftyp' with mdat
  if (hex.includes("6674797070") || hex.includes("6d646174")) {
    return { codec: "unknown", details: "MOV container detected" };
  }

  return { codec: "unknown", details: "Could not determine codec" };
}

// Server-side video validation and minimal processing
async function validateAndPrepareVideo(buffer: Buffer, originalMimeType: string): Promise<Buffer> {
  const { codec, details } = detectCodecFromBuffer(buffer);
  console.log(`Detected codec info: ${codec} - ${details}`);

  // Log file info for debugging
  console.log(`Video buffer size: ${buffer.length} bytes`);
  console.log(`Original MIME type: ${originalMimeType}`);

  // If client sent proper H.264/MP4, use it directly
  // If we detect issues, we'd need client-side processing (which we now have)
  if (codec === "h264" || originalMimeType === "video/mp4") {
    console.log("Video appears to be H.264/MP4, proceeding with Gemini upload");
    return buffer;
  }

  // If we still have non-MP4 format, it's likely a .mov file with HEVC codec from iOS
  if (codec === "unknown" && details.includes("MOV")) {
    console.log("MOV file detected - likely HEVC from iOS, suggesting desktop conversion");
    throw new Error(
      `Your iPhone video uses a format (HEVC) that requires conversion. ` +
      `Quick fix: Use an online converter (search "convert MOV to MP4") or convert on your Mac/PC before uploading. ` +
      `We're working on fixing this for iOS users.`
    );
  }

  if (codec === "unknown") {
    throw new Error(
      `Unexpected video format detected: ${details}. ` +
      `Please ensure you're uploading a video from your device and try again. ` +
      `If the issue persists, try recording a new video.`
    );
  }

  return buffer;
}

const SYSTEM_PROMPT = `You are an elite golf coach with decades of experience analyzing swings. You're known for your ability to identify subtle issues and create actionable training plans.

Analyze this golf swing video and provide feedback in the following JSON format. Be specific and actionable in your recommendations.

{
  "summary": "A 2-3 sentence overall assessment of the swing, mentioning skill level estimate and primary focus area",
  "strengths": [
    "Specific positive aspect 1",
    "Specific positive aspect 2",
    "Specific positive aspect 3"
  ],
  "improvements": [
    {
      "area": "Category name (e.g., Grip, Stance, Backswing, Downswing, Impact, Follow-through, Tempo)",
      "issue": "Clear description of what's wrong and why it matters",
      "fix": "Specific instruction on how to correct it"
    }
  ],
  "trainingPlan": [
    {
      "weekNumber": 1,
      "focus": "Primary focus area for this week",
      "drills": [
        {
          "name": "Drill name",
          "description": "How to perform the drill",
          "reps": "e.g., 3 sets of 10 swings"
        }
      ]
    },
    {
      "weekNumber": 2,
      "focus": "Primary focus area for this week",
      "drills": [
        {
          "name": "Drill name",
          "description": "How to perform the drill",
          "reps": "e.g., 3 sets of 10 swings"
        }
      ]
    },
    {
      "weekNumber": 3,
      "focus": "Primary focus area for this week",
      "drills": [
        {
          "name": "Drill name",
          "description": "How to perform the drill",
          "reps": "e.g., 3 sets of 10 swings"
        }
      ]
    },
    {
      "weekNumber": 4,
      "focus": "Integration and practice",
      "drills": [
        {
          "name": "Drill name",
          "description": "How to perform the drill",
          "reps": "e.g., 3 sets of 10 swings"
        }
      ]
    }
  ],
  "resources": [
    {
      "title": "Video title",
      "url": "https://youtube.com/watch?v=...",
      "description": "Why this video is helpful for them"
    }
  ]
}

Guidelines:
- Identify 2-4 key improvements, prioritized by impact
- Each week's training plan should build on the previous week
- Include 2-3 drills per week that can be done at a driving range
- Recommend 2-4 real YouTube tutorial videos from well-known golf instructors (Rick Shiels, Me and My Golf, Athletic Motion Golf, etc.)
- Be encouraging but honest
- Use technical golf terminology but explain it briefly

IMPORTANT: Return ONLY valid JSON, no markdown formatting or code blocks.`;

export const maxDuration = 60;

export async function POST(request: Request) {
  let tempFilePath: string | null = null;
  let blobUrl: string | null = null;

  try {
    const { videoUrl, mimeType } = await request.json();

    if (!videoUrl) {
      return NextResponse.json(
        { error: "No video URL provided" },
        { status: 400 }
      );
    }

    blobUrl = videoUrl;

    if (!process.env.GEMINI_API_KEY) {
      console.error("GEMINI_API_KEY is not set");
      return NextResponse.json(
        { error: "API key not configured" },
        { status: 500 }
      );
    }

    // Download video (client should have verified it's accessible)
    console.log("Downloading video from:", videoUrl);

    const downloadResponse = await fetch(videoUrl, {
      headers: {
        'Accept': '*/*',
        'Cache-Control': 'no-cache',
      },
    });

    console.log("Download response:", downloadResponse.status, downloadResponse.statusText);

    if (!downloadResponse.ok) {
      throw new Error(`Download failed: ${downloadResponse.status} ${downloadResponse.statusText}`);
    }

    const videoBuffer = Buffer.from(await downloadResponse.arrayBuffer());
    console.log("Download successful, size:", videoBuffer.length);

    // Validate and prepare video (ensure it's H.264/MP4)
    console.log("Validating video format...");
    const validatedBuffer = await validateAndPrepareVideo(videoBuffer, mimeType || "video/mp4");

    // Save file for Gemini upload
    tempFilePath = join(tmpdir(), `golf-swing-${Date.now()}.mp4`);
    await writeFile(tempFilePath, validatedBuffer);
    console.log("Video file saved to:", tempFilePath);

    // Always use video/mp4 for Gemini (client has already converted to this)
    const uploadMimeType = "video/mp4";
    console.log("Uploading to Gemini as:", uploadMimeType);

    // Upload to Gemini File API
    const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY);
    const uploadResult = await fileManager.uploadFile(tempFilePath, {
      mimeType: uploadMimeType,
      displayName: "golf-swing",
    });

    console.log("File uploaded to Gemini:", uploadResult.file.uri, "state:", uploadResult.file.state);

    // Wait for file to be processed
    let geminiFile = uploadResult.file;
    let processingAttempts = 0;
    const maxProcessingAttempts = 60; // Max 2 minutes (60 * 2 seconds)

    while (geminiFile.state === "PROCESSING" && processingAttempts < maxProcessingAttempts) {
      processingAttempts++;
      console.log(`Waiting for Gemini to process file (attempt ${processingAttempts}/${maxProcessingAttempts})...`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
      geminiFile = await fileManager.getFile(geminiFile.name);
      console.log("File state:", geminiFile.state);
    }

    if (geminiFile.state === "PROCESSING") {
      throw new Error(
        "Video processing took too long. Gemini is still analyzing. Please wait a moment and try again."
      );
    }

    if (geminiFile.state === "FAILED") {
      console.error("Gemini file processing failed:", JSON.stringify(geminiFile, null, 2));
      throw new Error(
        `Gemini failed to process your video. This might be due to video quality or format issues. ` +
        `Please try recording another swing with better lighting and a clearer view of your full body.`
      );
    }

    console.log("Gemini file ready:", geminiFile.state, geminiFile.mimeType);

    // Generate content using the uploaded file
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const result = await model.generateContent([
      {
        fileData: {
          mimeType: geminiFile.mimeType,
          fileUri: geminiFile.uri,
        },
      },
      { text: SYSTEM_PROMPT },
    ]);

    const response = result.response;
    const text = response.text();

    console.log("Gemini response received, length:", text.length);

    // Parse the JSON response
    let analysis;
    try {
      const cleanedText = text
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();
      analysis = JSON.parse(cleanedText);
    } catch (parseError) {
      console.error("Failed to parse Gemini response:", text);
      console.error("Parse error:", parseError);
      return NextResponse.json(
        { error: "Failed to parse analysis results" },
        { status: 500 }
      );
    }

    // Clean up: delete the file from Gemini
    try {
      await fileManager.deleteFile(geminiFile.name);
    } catch (e) {
      console.warn("Failed to delete Gemini file:", e);
    }

    return NextResponse.json(analysis);
  } catch (error) {
    console.error("Analysis error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Analysis failed: ${errorMessage}` },
      { status: 500 }
    );
  } finally {
    // Clean up temporary video file
    if (tempFilePath) {
      try {
        await unlink(tempFilePath);
        console.log("Cleaned up temporary file:", tempFilePath);
      } catch (e) {
        console.warn("Failed to delete temporary video file:", e);
      }
    }
    // Clean up Vercel Blob (the source file)
    if (blobUrl) {
      try {
        await del(blobUrl);
        console.log("Deleted blob:", blobUrl);
      } catch (e) {
        console.warn("Failed to delete blob:", e);
      }
    }
  }
}
