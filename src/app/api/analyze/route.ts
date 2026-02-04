import { GoogleGenerativeAI } from "@google/generative-ai";
import { GoogleAIFileManager } from "@google/generative-ai/server";
import { NextResponse } from "next/server";
import { del, head } from "@vercel/blob";
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

    // Get blob metadata and download URL
    console.log("Getting blob info for:", videoUrl);
    const blobInfo = await head(videoUrl);
    console.log("Blob found - size:", blobInfo.size, "type:", blobInfo.contentType, "downloadUrl:", blobInfo.downloadUrl);

    // Use downloadUrl if available, otherwise use the original URL
    const downloadUrl = blobInfo.downloadUrl || videoUrl;
    console.log("Downloading from:", downloadUrl);

    let videoBuffer: Buffer;
    const videoResponse = await fetch(downloadUrl);
    if (!videoResponse.ok) {
      console.error("Download failed:", videoResponse.status, videoResponse.statusText);
      // Try the original URL as fallback
      console.log("Trying original URL as fallback:", videoUrl);
      const fallbackResponse = await fetch(videoUrl);
      if (!fallbackResponse.ok) {
        throw new Error(`Failed to download video: ${fallbackResponse.status} ${fallbackResponse.statusText}`);
      }
      videoBuffer = Buffer.from(await fallbackResponse.arrayBuffer());
    } else {
      videoBuffer = Buffer.from(await videoResponse.arrayBuffer());
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

    console.log("File uploaded to Gemini:", uploadResult.file.uri);

    // Wait for file to be processed
    let geminiFile = uploadResult.file;
    while (geminiFile.state === "PROCESSING") {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      geminiFile = await fileManager.getFile(geminiFile.name);
    }

    if (geminiFile.state === "FAILED") {
      throw new Error("Gemini failed to process the video file");
    }

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
