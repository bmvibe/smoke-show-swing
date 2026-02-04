"use client";

import { useState, useRef, useCallback, useEffect } from "react";
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
      for (let i = 0; i < 30; i++) {
        console.log(`Checking blob accessibility, attempt ${i + 1}/30`);
        try {
          const checkResponse = await fetch(blob.url, {
            method: "GET",
            headers: { "Range": "bytes=0-1" }
          });
          if (checkResponse.status >= 200 && checkResponse.status < 300) {
            blobAccessible = true;
            console.log("Blob is accessible");
            break;
          }
        } catch (err) {
          console.log(`Attempt ${i + 1} failed, retrying...`);
        }
        // Wait 1 second between checks
        await new Promise(resolve => setTimeout(resolve, 1000));
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
    <main className="min-h-screen">
      {/* Header */}
      <header className="backdrop-blur-sm border-b border-border">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#C5A059] to-[#A0815A] border border-[#C5A059]/60 flex items-center justify-center shadow-lg">
              <span className="text-3xl">🏌️</span>
            </div>
            <div>
              <h1 className="text-3xl font-bold text-[#E1E4E8]">Smoke Show Golf</h1>
              <p className="text-base text-[#a8adb5]">The science of the strike. The soul of the game.</p>
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
                Show Your Swing
              </h2>
              <p className="text-muted text-xl max-w-2xl mx-auto leading-relaxed">
                Upload a video. Get the verdict. Refine the ritual.
              </p>
            </section>

            {/* How to Film */}
            <section className="mb-16">
              <h3 className="text-2xl font-bold mb-6 flex items-center gap-3">
                <span className="w-8 h-8 rounded-full bg-accent/30 text-[#E1E4E8] flex items-center justify-center text-sm font-bold border border-accent/50">1</span>
                The Setup
              </h3>
              <TipCarousel
                tips={[
                  {
                    icon: "📱",
                    title: "Camera Position",
                    description: "Place your phone on a tripod or prop it up at waist height, about 10 feet away. Film from directly behind or face-on for best results."
                  },
                  {
                    icon: "☀️",
                    title: "Lighting",
                    description: "Film outdoors in daylight or in a well-lit indoor space. Avoid backlighting (don't face the sun)."
                  },
                  {
                    icon: "🎬",
                    title: "Framing",
                    description: "Make sure your full body and the club are visible throughout the entire swing. Leave some space above and below."
                  },
                  {
                    icon: "⏱️",
                    title: "Video Length",
                    description: "Keep it under 30 seconds. Trim to just your swing - setup, backswing, impact, and follow-through."
                  }
                ]}
              />
            </section>

            {/* Upload */}
            <section className="mb-16">
              <h3 className="text-2xl font-bold mb-6 flex items-center gap-3">
                <span className="w-8 h-8 rounded-full bg-accent/30 text-[#E1E4E8] flex items-center justify-center text-sm font-bold border border-accent/50">2</span>
                The Move
              </h3>
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed rounded-3xl p-16 text-center cursor-pointer transition-all enhanced-card shadow-lg hover:shadow-xl hover:border-[#C5A059]/40"
                style={{ borderColor: 'rgba(0, 51, 160, 0.3)' }}
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
                <p className="font-semibold mb-3 text-xl text-[#E1E4E8]">Drop the video.</p>
                <p className="text-sm text-[#a8adb5]">MP4, MOV, or WebM • Max 50MB</p>
              </div>
              {error && (
                <p className="mt-6 text-red-300 text-sm text-center bg-red-500/10 border border-red-500/30 rounded-xl py-3 px-4">{error}</p>
              )}
            </section>

            {/* What to Expect */}
            <section>
              <h3 className="text-2xl font-bold mb-6 flex items-center gap-3">
                <span className="w-8 h-8 rounded-full bg-accent/30 text-[#E1E4E8] flex items-center justify-center text-sm font-bold border border-accent/50">3</span>
                The Arsenal
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
            <h2 className="text-3xl font-bold mb-3 text-white">No Verdict.</h2>
            <p className="text-muted mb-8 text-lg">{error || "The move didn't make it. Show me another."}</p>
            <button
              onClick={reset}
              className="px-8 py-3 bg-accent text-black font-semibold rounded-full hover:bg-accent-dim accent-button shadow-lg"
            >
              Start Over
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

function TipCarousel({ tips }: { tips: Array<{ icon: string; title: string; description: string }> }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);

  // Handle touch swipe
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    setTouchEnd(e.changedTouches[0].clientX);
    if (touchStart !== null) {
      const distance = touchStart - e.changedTouches[0].clientX;
      const isSwipeLeft = distance > 50;
      const isSwipeRight = distance < -50;

      if (isSwipeLeft) {
        setCurrentIndex((prev) => (prev + 1) % tips.length);
      } else if (isSwipeRight) {
        setCurrentIndex((prev) => (prev - 1 + tips.length) % tips.length);
      }
    }
    setTouchStart(null);
  };

  const goToSlide = (index: number) => {
    setCurrentIndex(index);
  };

  return (
    <div
      className="space-y-6"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Carousel on mobile, grid on desktop */}
      <div className="hidden sm:grid gap-4 sm:grid-cols-2" style={{ gridAutoRows: '1fr' }}>
        {tips.map((tip, idx) => (
          <div key={idx} className="flex">
            <TipCard icon={tip.icon} title={tip.title} description={tip.description} />
          </div>
        ))}
      </div>

      {/* Mobile carousel */}
      <div className="sm:hidden">
        <div className="transition-opacity duration-300">
          <TipCard icon={tips[currentIndex].icon} title={tips[currentIndex].title} description={tips[currentIndex].description} />
        </div>

        {/* Navigation dots */}
        <div className="flex justify-center gap-3 mt-6">
          {tips.map((_, idx) => (
            <button
              key={idx}
              onClick={() => goToSlide(idx)}
              className={`h-2 rounded-full transition-all duration-300 ${
                idx === currentIndex ? "w-8 bg-accent" : "w-2 bg-accent/30"
              }`}
              aria-label={`Go to slide ${idx + 1}`}
            />
          ))}
        </div>

        {/* Step indicator */}
        <div className="text-center mt-4 text-sm text-muted">
          {currentIndex + 1} of {tips.length}
        </div>
      </div>
    </div>
  );
}

function TipCard({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <div className="glass-card rounded-2xl p-6 hover:bg-card-hover hover:border-accent/40 cursor-default flex flex-col w-full h-full">
      <div className="text-3xl mb-3">{icon}</div>
      <h4 className="font-semibold mb-2 text-white text-lg">{title}</h4>
      <p className="text-sm text-muted leading-relaxed flex-1">{description}</p>
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
    uploading: "Decoding the move.",
    analyzing: "The verdict. Pending.",
  };

  const subMessages = {
    uploading: "Getting it from the cloud",
    analyzing: "Reading the strike",
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
            <LoadingStep text="Reading the plane" done />
            <LoadingStep text="Diagnosing the issue" active />
            <LoadingStep text="Plotting the fix" />
            <LoadingStep text="Building your protocol" />
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
        <h2 className="text-4xl font-bold text-white">The Verdict</h2>
        <button
          onClick={onReset}
          className="px-6 py-3 text-sm font-medium border border-accent/40 bg-accent/10 rounded-full hover:bg-accent/20 hover:border-accent text-white"
        >
          Another Move
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
          <h3 className="font-bold text-white text-xl mb-4">The Read</h3>
          <p className="text-muted">{analysis.summary}</p>

          {analysis.strengths.length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-medium text-accent mb-2">Pure.</h4>
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
        <h3 className="text-2xl font-bold mb-6 text-white">Close the Gap</h3>
        <div className="space-y-6">
          {analysis.improvements.map((item, i) => (
            <div key={i} className="glass-card rounded-3xl p-8 shadow-lg hover:shadow-xl hover:border-accent/40">
              <div className="flex items-start gap-6">
                <span className="w-10 h-10 rounded-full bg-accent/30 text-[#E1E4E8] flex items-center justify-center text-sm font-bold border border-accent/50 shrink-0">
                  {i + 1}
                </span>
                <div className="flex-1">
                  <h4 className="font-semibold mb-2 text-white text-lg">{item.area}</h4>
                  <p className="text-sm text-muted mb-4">{item.issue}</p>
                  <div className="bg-accent/15 border border-accent/30 rounded-2xl p-4">
                    <p className="text-sm text-white"><span className="font-semibold text-[#E1E4E8]">Fix:</span> {item.fix}</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Training Plan */}
      <section>
        <h3 className="text-2xl font-bold mb-6 text-white">Refine the Ritual</h3>
        <div className="space-y-6">
          {analysis.trainingPlan.map((week) => (
            <div key={week.weekNumber} className="glass-card rounded-3xl p-8 shadow-lg">
              <div className="flex items-center gap-4 mb-6">
                <span className="px-4 py-2 bg-accent/30 text-[#E1E4E8] text-sm font-semibold rounded-full border border-accent/50">
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
          <h3 className="text-2xl font-bold mb-6 text-white">The Arsenal</h3>
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
        <p className="text-muted mb-6 text-lg">Time to refine.</p>
        <button
          onClick={onReset}
          className="px-10 py-4 bg-accent text-black font-semibold rounded-full hover:bg-accent-dim accent-button shadow-lg hover:shadow-xl transition-all text-lg"
        >
          Show Me Another
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

