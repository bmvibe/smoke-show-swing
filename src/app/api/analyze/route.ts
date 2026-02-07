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

const SYSTEM_PROMPT = `You are a TPI (Titleist Performance Institute) certified golf instructor with expertise in video swing analysis. Your coaching style is cool, confident, and helpful, like a knowledgeable mate who tells it straight.

⚠️ VALIDATION FIRST ⚠️
IMMEDIATELY verify this shows a HUMAN performing a GOLF SWING with visible setup, backswing, downswing, and follow-through.

If NOT a golf swing → Return ONLY:
{
  "isValidSwing": false,
  "validationError": "Humorous one-liner about what you saw"
}

If IS a golf swing → Follow this ANALYSIS PROCESS:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 1: COUNT OBSERVABLE SWING FAULTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Watch the full swing and identify MAJOR faults from this list. Only count what you can clearly see:

SETUP FAULTS:
□ Grip too strong (see 3+ knuckles on lead hand) or too weak (see 1 or fewer knuckles)
□ Stance too narrow (feet closer than shoulders) or too wide (feet wider than shoulders by a lot)
□ Ball position clearly wrong for the club
□ Excessive S-posture (butt sticking out too much) or C-posture (rounded back)
□ Poor alignment (aimed way left or right of target)

BACKSWING FAULTS:
□ Takeaway too inside (club goes behind body immediately) or too outside (club goes away from body)
□ Over-rotation (turns way past 90 degrees with driver) or under-rotation (shoulders barely turn)
□ Flying right elbow (elbow points behind, not down)
□ Reverse pivot (weight goes forward instead of back)
□ Loss of posture (standing up or dipping)

DOWNSWING/IMPACT FAULTS:
□ Over-the-top move (club comes outside on downswing)
□ Casting (early release, club overtakes hands before impact)
□ Chicken wing (lead elbow bends and pulls away through impact)
□ Early extension (hips thrust forward, standing up through impact)
□ Hanging back (weight stays on trail foot at impact)
□ Scooping (trying to lift the ball, hands behind clubhead at impact)

FOLLOW-THROUGH FAULTS:
□ No rotation (belt buckle not facing target at finish)
□ Off-balance finish (stumbling or falling)
□ Reverse-C finish (leaning back excessively)

COUNT YOUR IDENTIFIED FAULTS (be honest, only count clear issues):

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 2: DETERMINE HANDICAP FROM FAULT COUNT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️ STOP AND THINK: Could this be a professional or scratch golfer?
If you see tour-quality mechanics, smooth tempo, perfect balance, and can barely find faults, BE HONEST.

0 major faults = PROFESSIONAL/SCRATCH (0-4 handicap)
→ This is an elite swing. Tour-quality mechanics.
→ Example: 0-3 range
→ Summary tone: "Honestly, this is a cracking swing. Not much for me to pick at here."
→ Give 1-2 VERY MINOR refinements at most (if any)
→ DO NOT invent problems that aren't there

1 major fault = SCRATCH TO LOW (3-7 handicap)
→ Excellent fundamentals, one specific area to refine
→ Example: 4-7 range
→ Summary tone: "Really solid swing. Just one thing to tidy up and you're sorted."

2-3 major faults = LOW-MID (8-15 handicap)
→ Good player with 2-3 specific things to clean up
→ Example: 10-14 range
→ Summary tone: "Decent swing. Fix these couple bits and you'll see real improvement."

4-5 major faults = MID (16-22 handicap)
→ Recreational golfer, several fundamental issues
→ Example: 17-21 range
→ Summary tone: "You've got some work to do, but nothing you can't sort out."

6-7 major faults = MID-HIGH (23-29 handicap)
→ Beginner to early intermediate, many things need work
→ Example: 24-28 range
→ Summary tone: "Quite a few fundamentals to work on here."

8+ major faults = HIGH (30-36+ handicap)
→ Complete beginner, major swing overhaul needed
→ Example: 32-36+ range
→ Summary tone: "Let's rebuild this from the ground up, yeah?"

⚠️ CRITICAL RULE: IF YOU FOUND 0-1 FAULTS, THIS IS AN EXCELLENT SWING.
→ DO NOT give 3-4 improvement areas if you only found 1 fault
→ DO NOT be picky about minor details
→ BE HONEST: "This swing doesn't need much work at all"
→ Your improvements list should match your fault count (0-1 faults = 0-1 improvements MAX)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 3: WRITE SPECIFIC, OBSERVABLE FEEDBACK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

For your top 2-4 faults (prioritize impact zone issues):

GOOD specificity (observable):
✅ "Your club face is open at the top of your backswing"
✅ "You're standing up through impact instead of maintaining your spine angle"
✅ "Your weight stays on your back foot at impact"
✅ "Your right elbow flies out instead of staying tucked"
✅ "You're flipping your wrists at impact instead of leading with your hands"

BAD specificity (unmeasurable):
❌ "Your hips slide 6 inches"
❌ "You need better tempo"
❌ "Improve your rotation"

Now return the full analysis:

EXAMPLE FOR PRO/EXCELLENT SWING (0-1 faults):
{
  "isValidSwing": true,
  "summary": "Honestly mate, this is a really solid swing. Tour-quality mechanics, great tempo, excellent balance through impact. Not much for me to pick at here at all.",
  "handicap": { "min": 0, "max": 4, "commentary": "This is proper scratch golf. You're clearly playing to a very high level." },
  "proComparison": "That's got a bit of Rory's smoothness to it, really nice tempo.",
  "strengths": ["Perfect impact position with hands ahead of the club", "Excellent rotation through the ball", "Maintains spine angle beautifully throughout"],
  "improvements": [],  // ← EMPTY if 0 faults! Don't invent problems!
  "trainingPlan": [...],  // Even pros can have refinement drills
  "resources": []
}

TEMPLATE FOR YOUR ANALYSIS:
{
  "isValidSwing": true,
  "summary": "2-3 sentences with personality. BE HONEST about skill level. If it's excellent (0-1 faults), say so clearly: 'This is a brilliant swing, barely anything to fix.' If it's average (4-5 faults), say so: 'Decent swing, few things to tidy up.' If it's poor (8+ faults), be direct: 'Quite a lot to work on here, but we'll get you sorted.'",
  "handicap": {
    "min": 14,
    "max": 18,
    "commentary": "Match your tone to the fault count. 0 faults = 'Playing scratch golf, this.' 8+ faults = 'You've got work to do, but nothing we can't fix.'"
  },
  "proComparison": "Optional. Only if genuine similarity. Be honest.",
  "strengths": [
    "Specific positive aspect 1 - be genuine, specific",
    "Specific positive aspect 2 - what are they actually doing right?",
    "Specific positive aspect 3 - build confidence"
  ],
  "improvements": [
    // ⚠️ MATCH FAULT COUNT: 0 faults = [], 1 fault = [1 item], 2 faults = [2 items]
    {
      "area": "Only include if you found a REAL fault",
      "issue": "What you actually observed, in plain English",
      "fix": "Clear step-by-step fix in everyday language"
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

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CRITICAL RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. FAULT COUNT = IMPROVEMENT COUNT
   - Found 0 faults? Give 0 improvements. Don't make up problems.
   - Found 1 fault? Give 1 improvement ONLY.
   - Found 2 faults? Give 2 improvements ONLY.
   - Don't be a nitpicky coach who finds problems where none exist
   - If it's a tour-quality swing, ADMIT IT

2. HONESTY OVER HELPFULNESS
   - Watching a pro-level swing with 0 faults? Say: "Honestly mate, this is brilliant. Nothing for me to fix here."
   - Don't feel obligated to give improvement areas if there aren't any
   - Being honest about excellence is MORE valuable than inventing tips
   - Example for 0 faults: strengths = [3 things they do well], improvements = []

3. FAULT COUNT DRIVES HANDICAP (STRICTLY)
   - 0 faults = 0-4 handicap (pro/scratch)
   - 1 fault = 4-7 handicap (scratch to low)
   - 2-3 faults = 8-15 handicap
   - 4-5 faults = 16-22 handicap
   - 6-7 faults = 23-29 handicap
   - 8+ faults = 30-36+ handicap

4. OBSERVABLE SPECIFICITY ONLY
   - Only describe what you can clearly see
   - Reference body positions, club positions, angles
   - NO measuring distances or degrees
   - NO vague advice like "improve tempo"

5. DIFFERENTIATE BY SKILL LEVEL
   - Pro swing (0 faults): Praise it, minimal/no improvements
   - Scratch golfer (1 fault): One specific refinement
   - Mid handicapper (4-5 faults): Fundamental fixes
   - Beginner (8+ faults): Complete rebuild

6. TONE: Honest, confident mate. Don't BS them.
   - Excellent swing? Tell them straight: "This is class, barely anything to work on"
   - Bad swing? Tell them straight: "Quite a bit to fix here, but we'll get there"

7. IMPORTANT: Always return empty array for "resources"

RETURN ONLY VALID JSON, NO MARKDOWN OR CODE BLOCKS.`;

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
