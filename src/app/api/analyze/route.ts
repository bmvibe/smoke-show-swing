import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

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

export const maxDuration = 60; // Allow up to 60 seconds for Vercel Pro, 10 for free

export async function POST(request: Request) {
  try {
    const { video, mimeType } = await request.json();

    if (!video || !mimeType) {
      return NextResponse.json(
        { error: "Missing video or mimeType" },
        { status: 400 }
      );
    }

    if (!process.env.GEMINI_API_KEY) {
      console.error("GEMINI_API_KEY is not set");
      return NextResponse.json(
        { error: "API key not configured" },
        { status: 500 }
      );
    }

    // Try gemini-1.5-flash as it's widely available
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    console.log("Starting video analysis, mimeType:", mimeType, "video length:", video.length);

    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: mimeType,
          data: video,
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
      // Remove any potential markdown code blocks
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

    return NextResponse.json(analysis);
  } catch (error) {
    console.error("Analysis error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Analysis failed: ${errorMessage}` },
      { status: 500 }
    );
  }
}
