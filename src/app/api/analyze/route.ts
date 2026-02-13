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
  if (buffer.toString("hex", 4, 8) === "66747970") {
    return { codec: "h264", details: "MP4 container" };
  }

  const hex = buffer.toString("hex", 0, 12);
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

    const tempInputPath = join(tmpdir(), `hevc-input-${Date.now()}.mov`);
    await writeFile(tempInputPath, buffer);

    // Upload to Cloudinary for conversion
    const uploadResult = await cloudinary.uploader.upload(tempInputPath, {
      resource_type: "video",
      public_id: `golf-swing-${Date.now()}`,
      overwrite: true,
    });

    // Get the converted MP4 URL
    const mp4Url = cloudinary.url(uploadResult.public_id, {
      resource_type: "video",
      format: "mp4",
      quality: "auto",
      fetch_format: "auto",
    });

    // Download the converted MP4
    const downloadResponse = await fetch(mp4Url);
    if (!downloadResponse.ok) {
      throw new Error(`Failed to download converted MP4: ${downloadResponse.status}`);
    }

    const convertedBuffer = Buffer.from(await downloadResponse.arrayBuffer());

    // Clean up
    try {
      await unlink(tempInputPath);
      // Delete from Cloudinary
      await cloudinary.uploader.destroy(uploadResult.public_id, { resource_type: "video" });
    } catch {
      // Cleanup is best-effort
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

  const isQuickTime = originalMimeType === "video/quicktime" || originalMimeType === "video/mov";
  const isMOVContainer = details.includes("MOV");

  if (isQuickTime || isMOVContainer) {
    return await convertHevcToMp4(buffer, "golf-swing.mov");
  }

  if (codec === "h264" || originalMimeType === "video/mp4") {
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
  "summary": "2-3 sentences with personality. Be cool and confident, maybe drop in a bit of dry wit. Start positive and highlight the main thing to work on. Think 'knowledgeable mate down the pub' not 'over-enthusiastic American coach'.",
  "score": {
    "overall": "<number 0-100 — weighted average of category scores, NOT a default>",
    "label": "<must match overall: 0-30 Beginner, 31-50 Developing, 51-70 Intermediate, 71-85 Advanced, 86-100 Elite>",
    "categories": [
      { "name": "Setup & Address", "score": "<number 0-100>" },
      { "name": "Backswing", "score": "<number 0-100>" },
      { "name": "Downswing & Impact", "score": "<number 0-100>" },
      { "name": "Follow-through", "score": "<number 0-100>" },
      { "name": "Tempo & Rhythm", "score": "<number 0-100>" }
    ]
  },
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
        },
        {
          "name": "Second drill name",
          "description": "Another clear drill with beginner-friendly instructions.",
          "reps": "e.g., 3 sets of 10 swings"
        }
      ]
    },
    {
      "weekNumber": 2,
      "focus": "Build on week 1",
      "drills": [
        { "name": "Drill name", "description": "Clear instructions anyone can follow.", "reps": "e.g., 3 sets of 10 swings" },
        { "name": "Second drill name", "description": "Another clear drill.", "reps": "e.g., 3 sets of 10 swings" }
      ]
    },
    {
      "weekNumber": 3,
      "focus": "Continue building",
      "drills": [
        { "name": "Drill name", "description": "Ultra-clear, beginner-friendly instructions.", "reps": "e.g., 3 sets of 10 swings" },
        { "name": "Second drill name", "description": "Another clear drill.", "reps": "e.g., 3 sets of 10 swings" }
      ]
    },
    {
      "weekNumber": 4,
      "focus": "Integration and practice",
      "drills": [
        { "name": "Drill name", "description": "Simple, actionable steps.", "reps": "e.g., 3 sets of 10 swings" },
        { "name": "Second drill name", "description": "Another clear drill.", "reps": "e.g., 3 sets of 10 swings" }
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
- SWING SCORE — THIS IS CRITICAL. You MUST actually evaluate the swing you see in the video. DO NOT default to 72 or any fixed number. Every swing is different and must be scored based on what you observe.

  SCORING RANGES:
  0-30 Beginner: Never played before, fundamentals completely absent
  31-50 Developing: Some basics in place but major mechanical flaws
  51-70 Intermediate: Decent fundamentals, inconsistencies in key areas
  71-85 Advanced: Strong mechanics throughout, minor refinements needed
  86-100 Elite: Near-professional or professional quality

  CALIBRATION: A true beginner who barely makes contact = 15-25. A regular weekend golfer = 45-60. A low-handicap club player = 65-75. A scratch golfer = 78-85. A tour pro = 88-95.

  SCORE EACH CATEGORY BY ACTUALLY WATCHING THE VIDEO:
  1. Setup & Address: Evaluate grip (neutral/strong/weak), stance width relative to club, ball position, spine angle at address, weight distribution, and alignment to target. A beginner with a death grip and feet together = 15-25. Textbook setup = 85+.
  2. Backswing: Evaluate takeaway path (inside/outside/on-plane), wrist hinge timing, shoulder turn depth (full 90° = good), hip rotation restraint, arm structure (connected vs flying elbow), and club position at the top (parallel, across the line, or laid off). A beginner who lifts the club with their arms = 20-30. Full coil with on-plane club = 85+.
  3. Downswing & Impact: Evaluate transition (bump/slide vs spin-out), sequencing (hips leading hands), lag retention, shaft lean at impact, clubface angle at impact (open/closed/square), divot location (ball-first contact), and hip clearance. An over-the-top casting motion = 25-40. Proper lag with ball-first contact = 80+.
  4. Follow-through: Evaluate extension through the ball, balance at finish (able to hold finish?), belt buckle facing target, weight fully on front foot, club finishing over the shoulder, and overall body position. Falling off balance = 20-35. Held finish facing target = 80+.
  5. Tempo & Rhythm: Evaluate the ratio of backswing to downswing time (ideal ~3:1), smoothness of transition, any rushing or deceleration, consistency of pace throughout the swing. Jerky rushed swing = 20-35. Smooth Ernie Els tempo = 85+.

  The overall score must be a WEIGHTED average: Downswing & Impact (30%), Backswing (25%), Setup & Address (20%), Follow-through (15%), Tempo & Rhythm (10%). The label MUST match the overall score range exactly. Do NOT round all categories to similar values — most swings have real variation between categories (e.g., good setup but poor impact, or great tempo but weak backswing).
- Identify 2-4 key improvements, prioritized by impact
- Each week's training plan should build on the previous week
- Include exactly 2 drills per week that can be done at a driving range. Use clear, searchable drill names (users will search YouTube for tutorials on each drill)
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

    const downloadResponse = await fetch(videoUrl, {
      headers: { 'Accept': '*/*', 'Cache-Control': 'no-cache' },
    });

    if (!downloadResponse.ok) {
      throw new Error(`Download failed: ${downloadResponse.status} ${downloadResponse.statusText}`);
    }

    const videoBuffer = Buffer.from(await downloadResponse.arrayBuffer());
    const validatedBuffer = await validateAndPrepareVideo(videoBuffer, mimeType || "video/mp4");

    tempFilePath = join(tmpdir(), `golf-swing-${Date.now()}.mp4`);
    await writeFile(tempFilePath, validatedBuffer);

    const uploadMimeType = "video/mp4";

    // Upload to Gemini File API
    const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY);
    const uploadResult = await fileManager.uploadFile(tempFilePath, {
      mimeType: uploadMimeType,
      displayName: "golf-swing",
    });

    // Wait for Gemini to process the file (max 2 minutes)
    let geminiFile = uploadResult.file;
    let processingAttempts = 0;
    const maxProcessingAttempts = 60;

    while (geminiFile.state === "PROCESSING" && processingAttempts < maxProcessingAttempts) {
      processingAttempts++;
      await new Promise((resolve) => setTimeout(resolve, 2000));
      geminiFile = await fileManager.getFile(geminiFile.name);
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

    // Generate analysis with retry logic for rate limits
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    let result;
    let retryCount = 0;
    const maxRetries = 3;

    while (retryCount < maxRetries) {
      try {
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

        // Check if it's a rate limit error (429)
        if (errorMsg.includes("429") || errorMsg.includes("Too Many Requests") || errorMsg.includes("exhausted")) {
          retryCount++;
          if (retryCount < maxRetries) {
            const delayMs = Math.pow(2, retryCount) * 1000;
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

    const text = result.response.text();

    // Parse the JSON response
    let analysis;
    try {
      const cleanedText = text
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();
      analysis = JSON.parse(cleanedText);
    } catch {
      return NextResponse.json(
        { error: "Failed to parse analysis results" },
        { status: 500 }
      );
    }

    // Validate that this is actually a golf swing
    if (analysis.isValidSwing === false) {
      try { await fileManager.deleteFile(geminiFile.name); } catch { /* best-effort */ }
      return NextResponse.json(
        { error: analysis.validationError || "That's not a golf swing, mate. Upload a video of an actual swing and let's try again." },
        { status: 400 }
      );
    }

    try { await fileManager.deleteFile(geminiFile.name); } catch { /* best-effort */ }

    return NextResponse.json(analysis);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Analysis failed: ${errorMessage}` },
      { status: 500 }
    );
  } finally {
    // Clean up temporary video file
    if (tempFilePath) {
      try { await unlink(tempFilePath); } catch { /* best-effort */ }
    }
    if (blobUrl) {
      try { await del(blobUrl); } catch { /* best-effort */ }
    }
  }
}
