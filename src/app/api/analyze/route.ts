import { GoogleGenerativeAI } from "@google/generative-ai";
import { GoogleAIFileManager } from "@google/generative-ai/server";
import { NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { v2 as cloudinary } from "cloudinary";

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

// Helper function to convert HEVC/MOV to MP4 using Cloudinary
async function convertHevcToMp4(buffer: Buffer, originalFilename: string): Promise<Buffer> {
  // Check if Cloudinary is configured
  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    console.warn("Cloudinary not configured, skipping conversion");
    return buffer;
  }

  try {
    // Configure Cloudinary
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });

    // Create a temporary file for upload
    const tempInputPath = join(tmpdir(), `hevc-input-${Date.now()}.mov`);
    await writeFile(tempInputPath, buffer);

    console.log("Uploading HEVC file to Cloudinary for conversion...");

    // Upload to Cloudinary with a resource type of "video"
    const uploadResult = await cloudinary.uploader.upload(tempInputPath, {
      resource_type: "video",
      public_id: `golf-swing-${Date.now()}`,
      overwrite: true,
    });

    console.log("Upload successful, requesting MP4 conversion...");

    // Get the converted MP4 URL using Cloudinary's transformation
    const mp4Url = cloudinary.url(uploadResult.public_id, {
      resource_type: "video",
      format: "mp4",
      quality: "auto",
      fetch_format: "auto",
    });

    console.log("Downloading converted MP4 from:", mp4Url);

    // Download the converted MP4
    const downloadResponse = await fetch(mp4Url);
    if (!downloadResponse.ok) {
      throw new Error(`Failed to download converted MP4: ${downloadResponse.status}`);
    }

    const convertedBuffer = Buffer.from(await downloadResponse.arrayBuffer());
    console.log(`✓ Successfully converted HEVC to MP4: ${buffer.length} bytes -> ${convertedBuffer.length} bytes`);

    // Clean up
    try {
      await unlink(tempInputPath);
      // Delete from Cloudinary
      await cloudinary.uploader.destroy(uploadResult.public_id, { resource_type: "video" });
    } catch (e) {
      console.warn("Failed to cleanup Cloudinary resources:", e);
    }

    return convertedBuffer;
  } catch (error) {
    console.error("Cloudinary conversion failed:", error);
    throw new Error(
      `Video conversion service temporarily unavailable. ` +
      `If this persists, please try recording your video in MP4 format. ` +
      `${error instanceof Error ? error.message : ""}`
    );
  }
}

// Server-side video validation and minimal processing
async function validateAndPrepareVideo(buffer: Buffer, originalMimeType: string): Promise<Buffer> {
  const { codec, details } = detectCodecFromBuffer(buffer);
  console.log(`Detected codec info: ${codec} - ${details}`);

  // Log file info for debugging
  console.log(`Video buffer size: ${buffer.length} bytes`);
  console.log(`Original MIME type: ${originalMimeType}`);

  // Check for iOS QuickTime/MOV format (indicates HEVC from iPhone)
  const isQuickTime = originalMimeType === "video/quicktime" || originalMimeType === "video/mov";
  const isMOVContainer = details.includes("MOV");

  console.log(`Is QuickTime/MOV: ${isQuickTime}, MOV container: ${isMOVContainer}`);

  // If it's a .mov file from iOS, it's likely HEVC which Gemini doesn't support well
  if (isQuickTime || isMOVContainer) {
    console.log("MOV/QuickTime file detected - likely HEVC from iOS, converting automatically...");
    const convertedBuffer = await convertHevcToMp4(buffer, "golf-swing.mov");
    return convertedBuffer;
  }

  // If client sent proper H.264/MP4, use it directly
  if (codec === "h264" || originalMimeType === "video/mp4") {
    console.log("Video appears to be H.264/MP4, proceeding with Gemini upload");
    return buffer;
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

const SYSTEM_PROMPT = `You are an elite golf coach with decades of experience analyzing swings. You're known for your ability to identify subtle issues and create actionable training plans. Your coaching style is cool, confident, funny, and charming—like a mate who happens to be brilliant at golf and knows exactly how to help.

⚠️ CRITICAL - VALIDATION MUST HAPPEN FIRST ⚠️
IMMEDIATELY verify this video shows a HUMAN performing a GOLF SWING. Look for:
- A person holding a golf club
- The person swinging the club at a golf ball
- Typical golf swing motion (setup, backswing, downswing, impact, follow-through)

If the video does NOT show an actual golf swing (animal, person not golfing, random footage, etc.):
→ STOP immediately - do NOT analyze further
→ Return ONLY these two fields:
{
  "isValidSwing": false,
  "validationError": "A humorous, cheeky one-liner about what you saw. Examples: 'That goat's not striping anything any time soon, mate.' or 'Nice cat video, but I'm here for golf swings, not TikTok.' or 'Lovely sunset, but where's the golf swing?'"
}

If it IS a valid golf swing, return the full analysis in this JSON format:

{
  "isValidSwing": true,
  "summary": "2-3 sentences with personality. Be cool and confident, maybe drop in a bit of dry wit. Start positive, mention their skill level, and highlight the main thing to work on. Think 'knowledgeable mate down the pub' not 'over-enthusiastic American coach'.",
  "handicap": {
    "min": 14,
    "max": 18,
    "commentary": "A casual one-liner in your cool, confident tone. Example: 'You're swinging like a mid-teens handicapper. Sort that grip and you could easily drop to 13-14.' Keep it humble with the range to avoid being too definitive. Be encouraging but realistic."
  },
  "proComparison": "Optional. Compare their swing shape or style to a professional golfer in a casual, confident way. Example: 'That swing shape is a bit like Tiger's, compact and controlled.' or 'You've got a bit of Rory's tempo there, just needs fine-tuning.' Only include this if there's a genuine similarity worth mentioning.",
  "strengths": [
    "Specific positive aspect 1 - be genuine, specific, and understated",
    "Specific positive aspect 2 - what are they actually doing right? Keep it real.",
    "Specific positive aspect 3 - build their confidence without going overboard"
  ],
  "improvements": [
    {
      "area": "Category name (e.g., Grip, Stance, Backswing, Downswing, Impact, Follow-through, Tempo)",
      "issue": "Explain what's happening in plain English. No jargon, pretend you're explaining to someone who's never played golf. Be conversational, maybe a bit cheeky, but always helpful.",
      "fix": "Step-by-step fix that ANYONE can understand and do. Use everyday language, not golf terminology. Be specific about body positions and movements, 'bend your knees like you're sitting in a chair' not 'improve knee flex'. Keep it casual and confident."
    }
  ],
  "trainingPlan": [
    {
      "weekNumber": 1,
      "focus": "Primary focus area for this week",
      "drills": [
        {
          "name": "Simple, clear drill name that explains what it does",
          "description": "Crystal-clear instructions that a complete beginner could follow. Use simple, everyday language. Explain EXACTLY what to do with their body, club, and ball. No golf jargon unless you immediately explain it in parentheses. Be cool and confident in your explanations.",
          "reps": "e.g., 3 sets of 10 swings, or 5 minutes daily"
        }
      ]
    },
    {
      "weekNumber": 2,
      "focus": "Build on week 1",
      "drills": [
        {
          "name": "Drill name",
          "description": "Clear instructions anyone can follow. Explain where to put their feet, hands, club, like you're chatting to a mate who's picking up a club for the first time.",
          "reps": "e.g., 3 sets of 10 swings"
        }
      ]
    },
    {
      "weekNumber": 3,
      "focus": "Continue building",
      "drills": [
        {
          "name": "Drill name",
          "description": "Ultra-clear, beginner-friendly instructions. No assumptions about golf knowledge. Keep it casual.",
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
          "description": "Simple, actionable steps that anyone can execute. Confident but not cocky.",
          "reps": "e.g., 3 sets of 10 swings"
        }
      ]
    }
  ],
  "resources": []
}

Guidelines:
- ⚠️ VALIDATION FIRST AND FAST: Check the video content IMMEDIATELY. If it's not a golf swing, return ONLY isValidSwing and validationError - nothing else. Do NOT waste time analyzing non-golf content. Be creative and cheeky with rejections.
- PERSONALITY: Cool, confident, funny, and charming. Think dry wit over enthusiastic cheerleading. Be the mate who knows their stuff and isn't afraid to be a bit cheeky about it.
- CLARITY: Explain everything like you're talking to someone brand new to golf. No jargon without explanation.
- DRILL INSTRUCTIONS: Be ridiculously specific. Where do feet go? How wide? Which hand does what? Explain clearly but casually.
- TONE: Confident, understated, maybe a touch of dry humour. Make them feel like you've got their back without being over the top about it.
- HANDICAP PREDICTION: Provide a realistic range (usually 3-5 point spread) based on swing fundamentals. Be humble and use ranges - never definitive single numbers. Keep commentary casual and encouraging. Examples: "14-18" for intermediate, "8-12" for decent player, "20-25" for beginner.
- Identify 2-4 key improvements, prioritized by impact
- Each week's training plan should build on the previous week
- Include 2-3 drills per week that can be done at a driving range
- IMPORTANT: Always return an empty array for "resources" - we don't use this section

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

    // Generate content using the uploaded file with retry logic for rate limits
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    let result;
    let retryCount = 0;
    const maxRetries = 3;

    while (retryCount < maxRetries) {
      try {
        console.log(`Calling Gemini generateContent (attempt ${retryCount + 1}/${maxRetries})...`);
        result = await model.generateContent([
          {
            fileData: {
              mimeType: geminiFile.mimeType,
              fileUri: geminiFile.uri,
            },
          },
          { text: SYSTEM_PROMPT },
        ]);
        break; // Success, exit retry loop
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.warn(`Attempt ${retryCount + 1} failed:`, errorMsg);

        // Check if it's a rate limit error (429)
        if (errorMsg.includes("429") || errorMsg.includes("Too Many Requests") || errorMsg.includes("exhausted")) {
          retryCount++;
          if (retryCount < maxRetries) {
            // Exponential backoff: 2s, 4s, 8s
            const delayMs = Math.pow(2, retryCount) * 1000;
            console.log(`Rate limited. Waiting ${delayMs}ms before retry...`);
            await new Promise((resolve) => setTimeout(resolve, delayMs));
            continue; // Retry
          } else {
            throw new Error(
              `API rate limit exceeded. Please try again in a few minutes. ` +
              `If you frequently analyze swings, consider enabling billing in Google Cloud Console for higher limits.`
            );
          }
        }

        // For non-rate-limit errors, fail immediately
        throw error;
      }
    }

    if (!result) {
      throw new Error("Failed to generate analysis after retries");
    }

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

    // Validate that this is actually a golf swing
    if (analysis.isValidSwing === false) {
      console.log("Invalid golf swing detected:", analysis.validationError);
      // Clean up: delete the file from Gemini
      try {
        await fileManager.deleteFile(geminiFile.name);
      } catch (e) {
        console.warn("Failed to delete Gemini file:", e);
      }
      return NextResponse.json(
        { error: analysis.validationError || "That's not a golf swing, mate. Upload a video of an actual swing and let's try again." },
        { status: 400 }
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
