import { GoogleGenerativeAI } from "@google/generative-ai";
import { GoogleAIFileManager } from "@google/generative-ai/server";
import { NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

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

    // Download video with retries
    console.log("Downloading video from:", videoUrl);

    let videoBuffer: Buffer | null = null;
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`Download attempt ${attempt}/${maxRetries}`);

        // Add delay between retries
        if (attempt > 1) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }

        const response = await fetch(videoUrl, {
          headers: {
            'Accept': '*/*',
          },
        });

        console.log(`Attempt ${attempt} response:`, response.status, response.statusText);

        if (response.ok) {
          videoBuffer = Buffer.from(await response.arrayBuffer());
          console.log("Download successful, size:", videoBuffer.length);
          break;
        }

        // If 404, the blob might not be ready yet
        if (response.status === 404 && attempt < maxRetries) {
          console.log("Blob not found, retrying...");
          continue;
        }

        throw new Error(`Download failed: ${response.status} ${response.statusText}`);
      } catch (err) {
        console.error(`Attempt ${attempt} error:`, err);
        if (attempt === maxRetries) {
          throw err;
        }
      }
    }

    if (!videoBuffer) {
      throw new Error("Failed to download video after all retries");
    }

    console.log("Downloaded video size:", videoBuffer.length);
    tempFilePath = join(tmpdir(), `golf-swing-${Date.now()}.mp4`);
    await writeFile(tempFilePath, videoBuffer);
    console.log("File saved to:", tempFilePath);

    // Upload to Gemini File API
    const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY);
    const uploadResult = await fileManager.uploadFile(tempFilePath, {
      mimeType: mimeType || "video/mp4",
      displayName: "golf-swing",
    });

    console.log("File uploaded to Gemini:", uploadResult.file.uri, "state:", uploadResult.file.state);

    // Wait for file to be processed
    let geminiFile = uploadResult.file;
    while (geminiFile.state === "PROCESSING") {
      console.log("Waiting for Gemini to process file...");
      await new Promise((resolve) => setTimeout(resolve, 2000));
      geminiFile = await fileManager.getFile(geminiFile.name);
      console.log("File state:", geminiFile.state);
    }

    if (geminiFile.state === "FAILED") {
      console.error("Gemini file processing failed:", JSON.stringify(geminiFile, null, 2));
      throw new Error(`Gemini failed to process video: ${geminiFile.state}`);
    }

    console.log("Gemini file ready:", geminiFile.state, geminiFile.mimeType);

    // Generate content using the uploaded file
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

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
    // Clean up temp file
    if (tempFilePath) {
      try {
        await unlink(tempFilePath);
      } catch (e) {
        console.warn("Failed to delete temp file:", e);
      }
    }
    // Clean up Vercel Blob
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
