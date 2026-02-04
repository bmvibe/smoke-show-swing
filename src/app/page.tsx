"use client";

import { useState, useRef, useCallback } from "react";
import { upload } from "@vercel/blob/client";

type AnalysisState = "idle" | "uploading" | "analyzing" | "complete" | "error";

interface SwingAnalysis {
  summary: string;
  strengths: string[];
  improvements: {
    area: string;
    issue: string;
    fix: string;
  }[];
  trainingPlan: {
    weekNumber: number;
    focus: string;
    drills: {
      name: string;
      description: string;
      reps: string;
    }[];
  }[];
  resources: {
    title: string;
    url: string;
    description: string;
  }[];
}

export default function Home() {
  const [state, setState] = useState<AnalysisState>("idle");
  const [analysis, setAnalysis] = useState<SwingAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(async (file: File) => {
    // Validate file
    if (!file.type.startsWith("video/")) {
      setError("Please upload a video file");
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      setError("Video must be under 50MB");
      return;
    }

    // Create preview
    const previewUrl = URL.createObjectURL(file);
    setVideoPreview(previewUrl);
    setError(null);
    setState("uploading");

    try {
      // Step 1: Upload video directly to Vercel Blob (bypasses serverless function limit)
      const blob = await upload(file.name, file, {
        access: "public",
        handleUploadUrl: "/api/upload",
      });

      setState("analyzing");

      // Step 2: Send blob URL to analyze endpoint
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoUrl: blob.url,
          mimeType: file.type,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Analysis failed. Please try again.");
      }

      const result = await response.json();
      setAnalysis(result);
      setState("complete");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setState("error");
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) handleFileSelect(file);
    },
    [handleFileSelect]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFileSelect(file);
    },
    [handleFileSelect]
  );

  const reset = () => {
    setState("idle");
    setAnalysis(null);
    setError(null);
    setVideoPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <main className="min-h-screen">
      {/* Header */}
      <header className="border-b border-border">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center">
              <span className="text-xl">🏌️</span>
            </div>
            <div>
              <h1 className="text-xl font-bold">Smoke Show Golf</h1>
              <p className="text-sm text-muted">The coach you need to smoke your drive</p>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {state === "idle" && (
          <>
            {/* Hero */}
            <section className="text-center mb-12">
              <h2 className="text-3xl font-bold mb-4">
                Analyze Your Swing with AI
              </h2>
              <p className="text-muted text-lg max-w-xl mx-auto">
                Upload a video of your golf swing and get instant feedback from our
                AI coach, plus a personalized training plan to improve your game.
              </p>
            </section>

            {/* How to Film */}
            <section className="mb-12">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-accent/20 text-accent flex items-center justify-center text-sm">1</span>
                How to Film Your Swing
              </h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <TipCard
                  title="Camera Position"
                  description="Place your phone on a tripod or prop it up at waist height, about 10 feet away. Film from directly behind or face-on for best results."
                />
                <TipCard
                  title="Lighting"
                  description="Film outdoors in daylight or in a well-lit indoor space. Avoid backlighting (don't face the sun)."
                />
                <TipCard
                  title="Framing"
                  description="Make sure your full body and the club are visible throughout the entire swing. Leave some space above and below."
                />
                <TipCard
                  title="Video Length"
                  description="Keep it under 30 seconds. Trim to just your swing - setup, backswing, impact, and follow-through."
                />
              </div>
            </section>

            {/* Upload */}
            <section className="mb-12">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-accent/20 text-accent flex items-center justify-center text-sm">2</span>
                Upload Your Video
              </h3>
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-border rounded-xl p-12 text-center cursor-pointer hover:border-accent hover:bg-card transition-colors"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*"
                  onChange={handleInputChange}
                  className="hidden"
                />
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-card flex items-center justify-center">
                  <UploadIcon />
                </div>
                <p className="font-medium mb-2">Drop your video here or tap to browse</p>
                <p className="text-sm text-muted">MP4, MOV, or WebM • Max 50MB • Under 30 seconds</p>
              </div>
              {error && (
                <p className="mt-4 text-red-400 text-sm text-center">{error}</p>
              )}
            </section>

            {/* What to Expect */}
            <section>
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-accent/20 text-accent flex items-center justify-center text-sm">3</span>
                What You&apos;ll Get
              </h3>
              <div className="grid gap-4 sm:grid-cols-3">
                <ExpectCard
                  icon="📊"
                  title="Swing Analysis"
                  description="Detailed breakdown of your posture, grip, backswing, downswing, impact, and follow-through."
                />
                <ExpectCard
                  icon="🎯"
                  title="Key Improvements"
                  description="Specific issues identified with clear explanations of what to fix and why."
                />
                <ExpectCard
                  icon="📋"
                  title="Training Plan"
                  description="Multi-week schedule with drills you can do at the driving range, plus video tutorials."
                />
              </div>
            </section>
          </>
        )}

        {(state === "uploading" || state === "analyzing") && (
          <LoadingState state={state} videoPreview={videoPreview} />
        )}

        {state === "complete" && analysis && (
          <ResultsView analysis={analysis} videoPreview={videoPreview} onReset={reset} />
        )}

        {state === "error" && (
          <div className="text-center py-20">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/10 flex items-center justify-center">
              <span className="text-2xl">❌</span>
            </div>
            <h2 className="text-xl font-bold mb-2">Analysis Failed</h2>
            <p className="text-muted mb-6">{error || "Something went wrong. Please try again."}</p>
            <button
              onClick={reset}
              className="px-6 py-3 bg-accent text-black font-medium rounded-full hover:bg-accent-dim"
            >
              Try Again
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

function TipCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <h4 className="font-medium mb-1">{title}</h4>
      <p className="text-sm text-muted">{description}</p>
    </div>
  );
}

function ExpectCard({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <div className="bg-card border border-border rounded-lg p-4 text-center">
      <div className="text-2xl mb-2">{icon}</div>
      <h4 className="font-medium mb-1">{title}</h4>
      <p className="text-sm text-muted">{description}</p>
    </div>
  );
}

function LoadingState({ state, videoPreview }: { state: "uploading" | "analyzing"; videoPreview: string | null }) {
  const messages = {
    uploading: "Uploading your video...",
    analyzing: "Analyzing your swing...",
  };

  const subMessages = {
    uploading: "This should only take a moment",
    analyzing: "Our AI coach is reviewing your technique",
  };

  return (
    <div className="py-20">
      <div className="max-w-md mx-auto text-center">
        {videoPreview && (
          <div className="mb-8 rounded-xl overflow-hidden border border-border">
            <video
              src={videoPreview}
              className="w-full aspect-video object-cover"
              autoPlay
              loop
              muted
              playsInline
            />
          </div>
        )}

        <div className="mb-6">
          <div className="w-16 h-16 mx-auto mb-4 relative">
            <div className="absolute inset-0 rounded-full border-4 border-border"></div>
            <div className="absolute inset-0 rounded-full border-4 border-accent border-t-transparent animate-spin"></div>
          </div>
        </div>

        <h2 className="text-xl font-bold mb-2">{messages[state]}</h2>
        <p className="text-muted">{subMessages[state]}</p>

        {state === "analyzing" && (
          <div className="mt-8 space-y-3">
            <LoadingStep text="Detecting swing phases" done />
            <LoadingStep text="Analyzing body position" active />
            <LoadingStep text="Evaluating club path" />
            <LoadingStep text="Generating training plan" />
          </div>
        )}
      </div>
    </div>
  );
}

function LoadingStep({ text, done, active }: { text: string; done?: boolean; active?: boolean }) {
  return (
    <div className={`flex items-center gap-3 justify-center ${!done && !active ? "text-muted" : ""}`}>
      {done ? (
        <span className="text-accent">✓</span>
      ) : active ? (
        <span className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin"></span>
      ) : (
        <span className="w-4 h-4 rounded-full border border-muted"></span>
      )}
      <span>{text}</span>
    </div>
  );
}

function ResultsView({
  analysis,
  videoPreview,
  onReset
}: {
  analysis: SwingAnalysis;
  videoPreview: string | null;
  onReset: () => void;
}) {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Your Swing Analysis</h2>
        <button
          onClick={onReset}
          className="px-4 py-2 text-sm border border-border rounded-full hover:bg-card"
        >
          Analyze Another
        </button>
      </div>

      {/* Video + Summary */}
      <div className="grid gap-6 md:grid-cols-2">
        {videoPreview && (
          <div className="rounded-xl overflow-hidden border border-border">
            <video
              src={videoPreview}
              className="w-full aspect-video object-cover"
              controls
              playsInline
            />
          </div>
        )}
        <div className="bg-card border border-border rounded-xl p-6">
          <h3 className="font-semibold mb-3">Summary</h3>
          <p className="text-muted">{analysis.summary}</p>

          {analysis.strengths.length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-medium text-accent mb-2">Strengths</h4>
              <ul className="space-y-1">
                {analysis.strengths.map((strength, i) => (
                  <li key={i} className="text-sm text-muted flex items-start gap-2">
                    <span className="text-accent mt-0.5">✓</span>
                    {strength}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Improvements */}
      <section>
        <h3 className="text-lg font-semibold mb-4">Areas for Improvement</h3>
        <div className="space-y-4">
          {analysis.improvements.map((item, i) => (
            <div key={i} className="bg-card border border-border rounded-xl p-6">
              <div className="flex items-start gap-4">
                <span className="w-8 h-8 rounded-full bg-accent/20 text-accent flex items-center justify-center text-sm font-medium shrink-0">
                  {i + 1}
                </span>
                <div>
                  <h4 className="font-medium mb-1">{item.area}</h4>
                  <p className="text-sm text-muted mb-3">{item.issue}</p>
                  <div className="bg-accent/10 border border-accent/20 rounded-lg p-3">
                    <p className="text-sm"><span className="font-medium text-accent">Fix:</span> {item.fix}</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Training Plan */}
      <section>
        <h3 className="text-lg font-semibold mb-4">Your Training Plan</h3>
        <div className="space-y-4">
          {analysis.trainingPlan.map((week) => (
            <div key={week.weekNumber} className="bg-card border border-border rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <span className="px-3 py-1 bg-accent/20 text-accent text-sm font-medium rounded-full">
                  Week {week.weekNumber}
                </span>
                <span className="text-sm text-muted">{week.focus}</span>
              </div>
              <div className="space-y-3">
                {week.drills.map((drill, i) => (
                  <div key={i} className="border-l-2 border-border pl-4">
                    <h5 className="font-medium text-sm">{drill.name}</h5>
                    <p className="text-sm text-muted">{drill.description}</p>
                    <p className="text-xs text-accent mt-1">{drill.reps}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Resources */}
      {analysis.resources.length > 0 && (
        <section>
          <h3 className="text-lg font-semibold mb-4">Recommended Videos</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {analysis.resources.map((resource, i) => (
              <a
                key={i}
                href={resource.url}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-card border border-border rounded-xl p-4 hover:bg-card-hover hover:border-accent/50 block"
              >
                <h4 className="font-medium mb-1 flex items-center gap-2">
                  <span className="text-red-500">▶</span>
                  {resource.title}
                </h4>
                <p className="text-sm text-muted">{resource.description}</p>
              </a>
            ))}
          </div>
        </section>
      )}

      {/* CTA */}
      <div className="text-center py-8 border-t border-border">
        <p className="text-muted mb-4">Ready to see your improvement?</p>
        <button
          onClick={onReset}
          className="px-8 py-3 bg-accent text-black font-medium rounded-full hover:bg-accent-dim"
        >
          Upload Another Swing
        </button>
      </div>
    </div>
  );
}

function UploadIcon() {
  return (
    <svg
      className="w-8 h-8 text-muted"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
      />
    </svg>
  );
}

