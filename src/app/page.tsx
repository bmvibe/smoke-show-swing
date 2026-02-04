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

      console.log("Upload complete, blob URL:", blob.url);

      // Step 2: Wait for blob to be accessible (CDN propagation)
      setState("analyzing");
      let blobAccessible = false;
      for (let i = 0; i < 10; i++) {
        console.log(`Checking blob accessibility, attempt ${i + 1}/10`);
        try {
          const checkResponse = await fetch(blob.url, { method: "HEAD" });
          if (checkResponse.ok) {
            blobAccessible = true;
            console.log("Blob is accessible");
            break;
          }
        } catch {
          // Ignore errors, keep trying
        }
        // Wait 2 seconds between checks
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      if (!blobAccessible) {
        throw new Error("Video upload succeeded but file is not accessible. Please try again.");
      }

      // Step 3: Send blob URL to analyze endpoint
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
    <main className="min-h-screen bg-gradient-to-b from-blue-600 via-blue-800 to-slate-900">
      {/* Header */}
      <header className="backdrop-blur-sm border-b border-border">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-accent/20 border border-accent/40 flex items-center justify-center shadow-lg">
              <span className="text-3xl">🏌️</span>
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">Smoke Show Golf</h1>
              <p className="text-base text-muted">AI-powered swing analysis and coaching</p>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {state === "idle" && (
          <>
            {/* Hero */}
            <section className="text-center mb-16 py-8">
              <h2 className="text-5xl font-bold mb-6 text-white leading-tight">
                Instant golf swing improvements
              </h2>
              <p className="text-muted text-xl max-w-2xl mx-auto leading-relaxed">
                Simply upload a video of your swing and we'll show you what needs to be fixed.
              </p>
            </section>

            {/* How to Film */}
            <section className="mb-16">
              <h3 className="text-2xl font-bold mb-6 flex items-center gap-3">
                <span className="w-8 h-8 rounded-full bg-accent/30 text-accent flex items-center justify-center text-sm font-bold border border-accent/50">1</span>
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
            <section className="mb-16">
              <h3 className="text-2xl font-bold mb-6 flex items-center gap-3">
                <span className="w-8 h-8 rounded-full bg-accent/30 text-accent flex items-center justify-center text-sm font-bold border border-accent/50">2</span>
                Upload Your Video
              </h3>
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-accent/40 rounded-3xl p-16 text-center cursor-pointer hover:border-accent hover:bg-card/50 transition-all enhanced-card shadow-lg"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*"
                  onChange={handleInputChange}
                  className="hidden"
                />
                <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-accent/10 border border-accent/40 flex items-center justify-center shadow-lg">
                  <UploadIcon />
                </div>
                <p className="font-semibold mb-3 text-xl text-white">Drop your video here or tap to browse</p>
                <p className="text-sm text-muted">MP4, MOV, or WebM • Max 50MB • Under 30 seconds</p>
              </div>
              {error && (
                <p className="mt-6 text-red-300 text-sm text-center bg-red-500/10 border border-red-500/30 rounded-xl py-3 px-4">{error}</p>
              )}
            </section>

            {/* What to Expect */}
            <section>
              <h3 className="text-2xl font-bold mb-6 flex items-center gap-3">
                <span className="w-8 h-8 rounded-full bg-accent/30 text-accent flex items-center justify-center text-sm font-bold border border-accent/50">3</span>
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
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center shadow-lg">
              <span className="text-3xl">❌</span>
            </div>
            <h2 className="text-3xl font-bold mb-3 text-white">Analysis Failed</h2>
            <p className="text-muted mb-8 text-lg">{error || "Something went wrong. Please try again."}</p>
            <button
              onClick={reset}
              className="px-8 py-3 bg-accent text-black font-semibold rounded-full hover:bg-accent-dim accent-button shadow-lg"
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
    <div className="glass-card rounded-2xl p-6 hover:bg-card-hover hover:border-accent/40 cursor-default">
      <h4 className="font-semibold mb-2 text-white text-lg">{title}</h4>
      <p className="text-sm text-muted leading-relaxed">{description}</p>
    </div>
  );
}

function ExpectCard({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <div className="glass-card rounded-2xl p-6 text-center hover:bg-card-hover hover:border-accent/40 cursor-default">
      <div className="text-4xl mb-4">{icon}</div>
      <h4 className="font-semibold mb-2 text-white text-lg">{title}</h4>
      <p className="text-sm text-muted leading-relaxed">{description}</p>
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
    <div className="py-24">
      <div className="max-w-md mx-auto text-center">
        {videoPreview && (
          <div className="mb-10 rounded-3xl overflow-hidden border border-accent/30 shadow-2xl enhanced-card">
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

        <div className="mb-8">
          <div className="w-24 h-24 mx-auto mb-6 relative">
            <div className="absolute inset-0 rounded-full border-4 border-accent/20"></div>
            <div className="absolute inset-0 rounded-full border-4 border-accent border-t-transparent animate-spin"></div>
          </div>
        </div>

        <h2 className="text-3xl font-bold mb-3 text-white">{messages[state]}</h2>
        <p className="text-muted text-lg">{subMessages[state]}</p>

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
    <div className="space-y-10">
      {/* Header */}
      <div className="flex items-center justify-between gap-6">
        <h2 className="text-4xl font-bold text-white">Your Swing Analysis</h2>
        <button
          onClick={onReset}
          className="px-6 py-3 text-sm font-medium border border-accent/40 bg-accent/10 rounded-full hover:bg-accent/20 hover:border-accent text-white"
        >
          Analyze Another
        </button>
      </div>

      {/* Video + Summary */}
      <div className="grid gap-8 md:grid-cols-2">
        {videoPreview && (
          <div className="rounded-3xl overflow-hidden border border-accent/30 shadow-2xl enhanced-card">
            <video
              src={videoPreview}
              className="w-full aspect-video object-cover"
              controls
              playsInline
            />
          </div>
        )}
        <div className="glass-card rounded-3xl p-8 shadow-lg">
          <h3 className="font-bold text-white text-xl mb-4">Summary</h3>
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
        <h3 className="text-2xl font-bold mb-6 text-white">Areas for Improvement</h3>
        <div className="space-y-6">
          {analysis.improvements.map((item, i) => (
            <div key={i} className="glass-card rounded-3xl p-8 shadow-lg hover:shadow-xl hover:border-accent/40">
              <div className="flex items-start gap-6">
                <span className="w-10 h-10 rounded-full bg-accent/30 text-accent flex items-center justify-center text-sm font-bold border border-accent/50 shrink-0">
                  {i + 1}
                </span>
                <div className="flex-1">
                  <h4 className="font-semibold mb-2 text-white text-lg">{item.area}</h4>
                  <p className="text-sm text-muted mb-4">{item.issue}</p>
                  <div className="bg-accent/15 border border-accent/30 rounded-2xl p-4">
                    <p className="text-sm text-white"><span className="font-semibold text-accent">Fix:</span> {item.fix}</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Training Plan */}
      <section>
        <h3 className="text-2xl font-bold mb-6 text-white">Your Training Plan</h3>
        <div className="space-y-6">
          {analysis.trainingPlan.map((week) => (
            <div key={week.weekNumber} className="glass-card rounded-3xl p-8 shadow-lg">
              <div className="flex items-center gap-4 mb-6">
                <span className="px-4 py-2 bg-accent/30 text-accent text-sm font-semibold rounded-full border border-accent/50">
                  Week {week.weekNumber}
                </span>
                <span className="text-base text-muted font-medium">{week.focus}</span>
              </div>
              <div className="space-y-4">
                {week.drills.map((drill, i) => (
                  <div key={i} className="border-l-3 border-accent/40 pl-6">
                    <h5 className="font-semibold text-white text-base">{drill.name}</h5>
                    <p className="text-sm text-muted mt-1">{drill.description}</p>
                    <p className="text-xs text-accent/80 font-medium mt-2">{drill.reps}</p>
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
          <h3 className="text-2xl font-bold mb-6 text-white">Recommended Videos</h3>
          <div className="grid gap-6 sm:grid-cols-2">
            {analysis.resources.map((resource, i) => (
              <a
                key={i}
                href={resource.url}
                target="_blank"
                rel="noopener noreferrer"
                className="glass-card rounded-3xl p-6 hover:bg-card-hover hover:border-accent/50 block shadow-lg hover:shadow-xl transition-all"
              >
                <h4 className="font-semibold mb-2 flex items-center gap-3 text-white text-lg">
                  <span className="text-red-400 text-xl">▶</span>
                  {resource.title}
                </h4>
                <p className="text-sm text-muted leading-relaxed">{resource.description}</p>
              </a>
            ))}
          </div>
        </section>
      )}

      {/* CTA */}
      <div className="text-center py-12 border-t border-accent/20">
        <p className="text-muted mb-6 text-lg">Ready to see your improvement?</p>
        <button
          onClick={onReset}
          className="px-10 py-4 bg-accent text-black font-semibold rounded-full hover:bg-accent-dim accent-button shadow-lg hover:shadow-xl transition-all text-lg"
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
      className="w-10 h-10 text-accent"
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

