"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { upload } from "@vercel/blob/client";
import { processVideoFile } from "@/lib/videoProcessor";

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

    // Create preview from original file
    const previewUrl = URL.createObjectURL(file);
    setVideoPreview(previewUrl);
    setError(null);
    setState("uploading");

    try {
      // Step 0: Process video (convert HEVC to H.264 for Gemini compatibility)
      console.log("===== Starting video processing =====");
      console.log("Original file:", { name: file.name, size: file.size, type: file.type });

      const { blob: processedBlob, filename: processedFilename } = await processVideoFile(file, (progress) => {
        console.log(`Video processing progress: ${progress}%`);
      });

      console.log(`✓ Video processed: ${processedFilename} (${processedBlob.size} bytes, ${(processedBlob.size / (1024 * 1024)).toFixed(2)}MB)`);

      // Create a File object from the processed blob
      const processedFile = new File([processedBlob], processedFilename, {
        type: "video/mp4",
      });

      // Step 1: Upload processed video to Vercel Blob (bypasses serverless function limit)
      const blob = await upload(processedFile.name, processedFile, {
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
      const errorMsg = err instanceof Error ? err.message : "Something went wrong";
      console.error("===== Upload Error =====");
      console.error("Error message:", errorMsg);
      console.error("Full error:", err);
      console.error("=======================");
      setError(errorMsg);
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
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#C5A059] to-[#A0815A] border border-[#C5A059]/60 flex items-center justify-center shadow-lg text-white">
              <GolfIcon />
            </div>
            <div>
              <h1 className="text-lg font-bold text-[#E1E4E8]">Smoke Show</h1>
              <p className="text-xs text-[#a8adb5]">Golf swing analysis</p>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-4">
        {state === "idle" && (
          <>
            {/* Hero */}
            <section className="text-center mb-16 py-8">
              <h2 className="text-4xl font-bold mb-6 text-white leading-tight">
                Fix your golf swing in a minute
              </h2>
              <p className="text-muted text-xl max-w-2xl mx-auto leading-relaxed">
                Simply upload a video of your swing and we'll show you what needs to be fixed.
              </p>
            </section>

            {/* Upload */}
            <section className="mb-10">
              <h3 className="text-base font-bold mb-3 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-accent/30 text-[#E1E4E8] flex items-center justify-center text-xs font-bold border border-accent/50">1</span>
                Upload your swing here
              </h3>
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all enhanced-card shadow-lg hover:shadow-xl hover:border-[#C5A059]/40"
                style={{ borderColor: 'rgba(0, 51, 160, 0.3)' }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*"
                  onChange={handleInputChange}
                  className="hidden"
                />
                <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-accent/10 border border-accent/40 flex items-center justify-center shadow-lg">
                  <UploadIcon />
                </div>
                <p className="font-semibold mb-2 text-sm text-[#E1E4E8]">Drop your video here or click to browse</p>
                <p className="text-xs text-[#a8adb5]">Under 20 seconds will get the best results</p>
              </div>
              {error && (
                <p className="mt-6 text-red-300 text-sm text-center bg-red-500/10 border border-red-500/30 rounded-xl py-3 px-4">{error}</p>
              )}

              {/* How to Film - Part of Step 1 */}
              <div className="mt-6">
                <h4 className="text-sm font-bold mb-3 text-[#E1E4E8]">How to Film</h4>
                <TipCarousel
                  tips={[
                    {
                      icon: "camera",
                      title: "Camera setup",
                      description: "Film at waist height and keep the phone steady or use a tripod. Film from behind about 10 foot away"
                    },
                    {
                      icon: "sun",
                      title: "Lighting",
                      description: "Film outdoors in daylight or in a well-lit indoor space. Avoid backlighting (don't face the sun)."
                    },
                    {
                      icon: "film",
                      title: "Framing",
                      description: "Make sure your full body and the club are visible throughout the entire swing. Leave some space above and below."
                    },
                    {
                      icon: "clock",
                      title: "Video Length",
                      description: "Keep it under 30 seconds. Trim to just your swing - setup, backswing, impact, and follow-through."
                    }
                  ]}
                />
              </div>
            </section>

            {/* What to Expect */}
            <section>
              <h3 className="text-base font-bold mb-3 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-accent/30 text-[#E1E4E8] flex items-center justify-center text-xs font-bold border border-accent/50">2</span>
                What You'll Get
              </h3>
              <div className="grid gap-4 sm:grid-cols-3">
                <ExpectCard
                  icon="chart"
                  title="Swing Analysis"
                  description="Detailed breakdown of your posture, grip, backswing, downswing, impact, and follow-through."
                />
                <ExpectCard
                  icon="target"
                  title="Key Improvements"
                  description="Specific issues identified with clear explanations of what to fix and why."
                />
                <ExpectCard
                  icon="clipboard"
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
          <div className="text-center py-8">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center shadow-lg text-red-400">
              <ErrorIcon />
            </div>
            <h2 className="text-xl font-bold mb-2 text-white">Upload Failed</h2>
            <p className="text-muted mb-4 text-xs">{error || "We couldn't process your video. Please try again."}</p>
            <button
              onClick={reset}
              className="px-6 py-2 bg-accent text-black font-semibold rounded-full hover:bg-accent-dim accent-button shadow-lg text-sm"
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
      className="space-y-8"
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
  const iconMap: { [key: string]: JSX.Element } = {
    camera: <CameraIcon />,
    sun: <SunIcon />,
    film: <FilmIcon />,
    clock: <ClockIcon />,
  };

  return (
    <div className="glass-card rounded-xl p-4 hover:bg-card-hover hover:border-accent/40 cursor-default flex flex-col w-full h-full">
      <div className="text-white mb-2">{iconMap[icon]}</div>
      <h4 className="font-semibold mb-1 text-white text-sm">{title}</h4>
      <p className="text-xs text-muted leading-tight flex-1">{description}</p>
    </div>
  );
}

function ExpectCard({ icon, title, description }: { icon: string; title: string; description: string }) {
  const iconMap: { [key: string]: JSX.Element } = {
    chart: <ChartIcon />,
    target: <TargetIcon />,
    clipboard: <ClipboardIcon />,
  };

  return (
    <div className="glass-card rounded-xl p-4 text-center hover:bg-card-hover hover:border-accent/40 cursor-default">
      <div className="text-white mb-2 flex justify-center">{iconMap[icon]}</div>
      <h4 className="font-semibold mb-1 text-white text-sm">{title}</h4>
      <p className="text-xs text-muted leading-tight">{description}</p>
    </div>
  );
}

function LoadingState({ state, videoPreview }: { state: "uploading" | "analyzing"; videoPreview: string | null }) {
  const messages = {
    uploading: "Uploading your video...",
    analyzing: "Analyzing your swing...",
  };

  const subMessages = {
    uploading: "Please wait while we upload to the cloud",
    analyzing: "Processing your video for analysis",
  };

  return (
    <div className="py-8">
      <div className="max-w-md mx-auto text-center">
        {videoPreview && (
          <div className="mb-4 rounded-2xl overflow-hidden border border-accent/30 shadow-lg enhanced-card">
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

        <div className="mb-4">
          <div className="w-16 h-16 mx-auto mb-3 relative">
            <div className="absolute inset-0 rounded-full border-4 border-accent/20"></div>
            <div className="absolute inset-0 rounded-full border-4 border-accent border-t-transparent animate-spin"></div>
          </div>
        </div>

        <h2 className="text-2xl font-bold mb-2 text-white">{messages[state]}</h2>
        <p className="text-muted text-sm">{subMessages[state]}</p>

        {state === "analyzing" && (
          <div className="mt-4 space-y-2">
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-white">Your Analysis</h2>
        <button
          onClick={onReset}
          className="px-4 py-2 text-xs font-medium border border-accent/40 bg-accent/10 rounded-full hover:bg-accent/20 hover:border-accent text-white"
        >
          Analyze Another
        </button>
      </div>

      {/* Video + Summary */}
      <div className="grid gap-4 md:grid-cols-2">
        {videoPreview && (
          <div className="rounded-2xl overflow-hidden border border-accent/30 shadow-lg enhanced-card">
            <video
              src={videoPreview}
              className="w-full aspect-video object-cover"
              controls
              playsInline
            />
          </div>
        )}
        <div className="glass-card rounded-2xl p-4 shadow-lg">
          <h3 className="font-bold text-white text-sm mb-2">Summary</h3>
          <p className="text-muted text-xs">{analysis.summary}</p>

          {analysis.strengths.length > 0 && (
            <div className="mt-2">
              <h4 className="text-xs font-medium text-accent mb-1">Strengths</h4>
              <ul className="space-y-0.5">
                {analysis.strengths.map((strength, i) => (
                  <li key={i} className="text-xs text-muted flex items-start gap-2">
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
        <h3 className="text-base font-bold mb-3 text-white">Areas to Improve</h3>
        <div className="space-y-4">
          {analysis.improvements.map((item, i) => (
            <div key={i} className="glass-card rounded-xl p-4 shadow-lg hover:shadow-xl hover:border-accent/40">
              <div className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-accent/30 text-[#E1E4E8] flex items-center justify-center text-xs font-bold border border-accent/50 shrink-0">
                  {i + 1}
                </span>
                <div className="flex-1">
                  <h4 className="font-semibold mb-1 text-white text-sm">{item.area}</h4>
                  <p className="text-xs text-muted mb-2">{item.issue}</p>
                  <div className="bg-accent/15 border border-accent/30 rounded-lg p-2">
                    <p className="text-xs text-white"><span className="font-semibold text-[#E1E4E8]">Fix:</span> {item.fix}</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Training Plan */}
      <section>
        <h3 className="text-base font-bold mb-3 text-white">Training Plan</h3>
        <div className="space-y-4">
          {analysis.trainingPlan.map((week) => (
            <div key={week.weekNumber} className="glass-card rounded-xl p-3 shadow-lg">
              <div className="flex items-center gap-2 mb-2">
                <span className="px-2 py-1 bg-accent/30 text-[#E1E4E8] text-xs font-semibold rounded-full border border-accent/50">
                  W{week.weekNumber}
                </span>
                <span className="text-xs text-muted font-medium">{week.focus}</span>
              </div>
              <div className="space-y-2">
                {week.drills.map((drill, i) => (
                  <div key={i} className="border-l-2 border-accent/40 pl-2">
                    <h5 className="font-semibold text-white text-xs">{drill.name}</h5>
                    <p className="text-xs text-muted">{drill.description}</p>
                    <p className="text-xs text-accent/80 font-medium">{drill.reps}</p>
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
          <h3 className="text-base font-bold mb-3 text-white">Learning Resources</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {analysis.resources.map((resource, i) => (
              <a
                key={i}
                href={resource.url}
                target="_blank"
                rel="noopener noreferrer"
                className="glass-card rounded-xl p-3 hover:bg-card-hover hover:border-accent/50 block shadow-lg hover:shadow-xl transition-all"
              >
                <h4 className="font-semibold mb-1 flex items-center gap-2 text-white text-sm">
                  <span className="text-red-400"><PlayIcon /></span>
                  {resource.title}
                </h4>
                <p className="text-xs text-muted">{resource.description}</p>
              </a>
            ))}
          </div>
        </section>
      )}

      {/* CTA */}
      <div className="text-center py-4 border-t border-accent/20">
        <p className="text-muted mb-3 text-xs">Analyze another swing</p>
        <button
          onClick={onReset}
          className="px-6 py-2 bg-accent text-black font-semibold rounded-full hover:bg-accent-dim accent-button shadow-lg hover:shadow-xl transition-all text-sm"
        >
          Upload Another Video
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

function GolfIcon() {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3l14 9-9 1-5-10z" />
      <circle cx="7" cy="20" r="2" strokeWidth={2} />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
      <circle cx="12" cy="13" r="3" strokeWidth={2} />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="4" strokeWidth={2} />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32l1.41-1.41" />
    </svg>
  );
}

function FilmIcon() {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" strokeWidth={2} />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6l4 2" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  );
}

function TargetIcon() {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" strokeWidth={2} />
      <circle cx="12" cy="12" r="6" strokeWidth={2} />
      <circle cx="12" cy="12" r="2" strokeWidth={2} />
    </svg>
  );
}

function ClipboardIcon() {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" strokeWidth={2} />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 9l-6 6m0-6l6 6" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

