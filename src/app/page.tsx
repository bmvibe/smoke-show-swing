"use client";

import { useState, useRef, useCallback, useEffect, ReactElement } from "react";
import { upload } from "@vercel/blob/client";
import { processVideoFile } from "@/lib/videoProcessor";
import { motion, AnimatePresence } from "framer-motion";

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
  const [logoVisible, setLogoVisible] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastScrollY = useRef(0);

  // Handle logo visibility on scroll
  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;

      if (currentScrollY < 10) {
        // Always show at top of page
        setLogoVisible(true);
      } else if (currentScrollY > lastScrollY.current) {
        // Scrolling down - hide logo
        setLogoVisible(false);
      } else {
        // Scrolling up - show logo
        setLogoVisible(true);
      }

      lastScrollY.current = currentScrollY;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

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
      {/* Floating Glass Logo */}
      <div
        className="fixed top-6 left-6 z-50 px-6 py-3 rounded-full backdrop-blur-xl bg-white/10 border border-white/20 shadow-[0_8px_32px_rgba(0,0,0,0.3)]"
        style={{
          transform: logoVisible ? 'translateY(0)' : 'translateY(-120px)',
          opacity: logoVisible ? 1 : 0,
          transition: 'transform 1500ms ease-in-out, opacity 1500ms ease-in-out'
        }}
      >
        <span className="text-white text-lg font-light tracking-wide">striped.</span>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-4">
        {state === "idle" && (
          <>
            {/* Hero */}
            <section className="text-center mb-16 pt-16 pb-8">
              <h2 className="text-[3.6rem] mb-8 text-white leading-tight font-[200] tracking-wide uppercase">
                Fix your golf swing in a minute
              </h2>
              <p className="text-muted text-xl max-w-2xl mx-auto leading-relaxed font-light">
                Simply upload a video of your swing and we'll show you what needs to be fixed.
              </p>
            </section>

            {/* Upload */}
            <section className="mb-10">
              <h3 className="text-base font-light tracking-wide uppercase mb-3 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-accent/30 text-[#E1E4E8] flex items-center justify-center text-xs font-light border border-accent/50">1</span>
                Upload your swing here
              </h3>
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all enhanced-card shadow-lg hover:shadow-xl hover:border-[#C5A059]/40"
                style={{ borderColor: 'rgba(255, 255, 255, 0.3)' }}
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
                <p className="font-light mb-2 text-sm text-[#E1E4E8]">Drop your video here or click to browse</p>
                <p className="text-xs text-[#a8adb5] font-light">Under 20 seconds will get the best results</p>
              </div>
              {error && (
                <p className="mt-6 text-red-300 text-sm text-center bg-red-500/10 border border-red-500/30 rounded-xl py-3 px-4">{error}</p>
              )}

              {/* How to Film - Part of Step 1 */}
              <div className="mt-6">
                <h4 className="text-sm font-light tracking-wide uppercase mb-3 text-[#E1E4E8]">Video tips</h4>
                <TipCarousel
                  tips={[
                    {
                      icon: "camera",
                      title: "Camera setup",
                      description: "Phone at waist height, kept steady. Film from behind, about 10 feet back."
                    },
                    {
                      icon: "sun",
                      title: "Lighting",
                      description: "Daylight's your mate here. Film outside or somewhere bright. Don't stand facing the sun—you'll just be a silhouette."
                    },
                    {
                      icon: "film",
                      title: "Framing",
                      description: "Make sure we can see all of you and the club throughout. Leave a bit of space top and bottom so nothing gets cut off."
                    },
                    {
                      icon: "clock",
                      title: "Video Length",
                      description: "Keep it around 20 seconds. Just the good stuff—your setup, swing back, hit, and follow through. No need for the walk-up."
                    }
                  ]}
                />
              </div>
            </section>

            {/* What to Expect */}
            <section>
              <h3 className="text-base font-light tracking-wide uppercase mb-3 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-accent/30 text-[#E1E4E8] flex items-center justify-center text-xs font-light border border-accent/50">2</span>
                What You'll Get
              </h3>
              <div className="grid gap-4 sm:grid-cols-3">
                <ExpectCard
                  icon="chart"
                  title="Swing Analysis"
                  description="A proper look at everything—how you stand, hold the club, swing back, come through, and finish. The full story."
                />
                <ExpectCard
                  icon="target"
                  title="Key Improvements"
                  description="The exact bits that need sorting, explained in plain English. No jargon, just what to change and why it matters."
                />
                <ExpectCard
                  icon="clipboard"
                  title="Training Plan"
                  description="A week-by-week game plan with drills you can actually do at the range. Video guides included so you know you're doing it right."
                />
              </div>
            </section>
          </>
        )}

        <AnimatePresence>
          {(state === "uploading" || state === "analyzing") && (
            <LoadingState key="loading" state={state} videoPreview={videoPreview} />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {state === "complete" && analysis && (
            <ResultsView key="results" analysis={analysis} videoPreview={videoPreview} onReset={reset} />
          )}
        </AnimatePresence>

        {state === "error" && (
          <div className="text-center py-8">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center shadow-lg text-red-400">
              <ErrorIcon />
            </div>
            <h2 className="text-xl font-light tracking-wide uppercase mb-2 text-white">Upload Failed</h2>
            <p className="text-muted mb-4 text-xs font-light">{error || "We couldn't process your video. Please try again."}</p>
            <button
              onClick={reset}
              className="px-6 py-2 bg-accent text-black font-light tracking-wide uppercase rounded-full hover:bg-accent-dim accent-button shadow-lg text-sm"
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

  const goToNextSlide = () => {
    setCurrentIndex((prev) => (prev + 1) % tips.length);
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
          <TipCard
            icon={tips[currentIndex].icon}
            title={tips[currentIndex].title}
            description={tips[currentIndex].description}
            onClick={goToNextSlide}
          />
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
        <div className="text-center mt-4 text-sm text-muted font-light">
          {currentIndex + 1} of {tips.length}
        </div>
      </div>
    </div>
  );
}

function TipCard({ icon, title, description, onClick }: { icon: string; title: string; description: string; onClick?: () => void }) {
  const iconMap: { [key: string]: ReactElement } = {
    camera: <CameraIcon />,
    sun: <SunIcon />,
    film: <FilmIcon />,
    clock: <ClockIcon />,
  };

  return (
    <div
      className={`glass-card rounded-xl p-4 hover:bg-card-hover hover:border-accent/40 flex flex-col w-full h-full ${
        onClick ? 'cursor-pointer' : 'cursor-default'
      }`}
      onClick={onClick}
    >
      <div className="text-white mb-2">{iconMap[icon]}</div>
      <h4 className="font-light tracking-wide uppercase mb-1 text-white text-sm">{title}</h4>
      <p className="text-xs text-muted leading-tight flex-1 font-light">{description}</p>
    </div>
  );
}

function ExpectCard({ icon, title, description }: { icon: string; title: string; description: string }) {
  const iconMap: { [key: string]: ReactElement } = {
    chart: <ChartIcon />,
    target: <TargetIcon />,
    clipboard: <ClipboardIcon />,
  };

  return (
    <div className="glass-card rounded-xl p-4 text-center hover:bg-card-hover hover:border-accent/40 cursor-default">
      <div className="text-white mb-2 flex justify-center">{iconMap[icon]}</div>
      <h4 className="font-light tracking-wide uppercase mb-1 text-white text-sm">{title}</h4>
      <p className="text-xs text-muted leading-tight font-light">{description}</p>
    </div>
  );
}

function LoadingState({ state, videoPreview }: { state: "uploading" | "analyzing"; videoPreview: string | null }) {
  const [currentStep, setCurrentStep] = useState(0);

  const steps = [
    "Checking grip and stance",
    "Scanning backswing",
    "Verifying impact",
    "Identifying swing fixes",
    "Compiling training plan"
  ];

  useEffect(() => {
    if (state === "analyzing") {
      // Reset to first step when starting
      setCurrentStep(0);

      const stepDuration = 3000; // 3 seconds per step
      const interval = setInterval(() => {
        setCurrentStep((prev) => {
          // Move to next step if not on the last one
          if (prev < steps.length - 1) {
            return prev + 1;
          }
          return prev; // Stay on last step
        });
      }, stepDuration);

      return () => clearInterval(interval);
    }
  }, [state, steps.length]);

  const messages = {
    uploading: "Uploading your video...",
    analyzing: "Analyzing your swing...",
  };

  const subMessages = {
    uploading: "Please wait while we upload to the cloud",
    analyzing: "Processing your video for analysis",
  };

  return (
    <motion.div
      className="py-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1.0 }}
    >
      <div className="max-w-md mx-auto">
        {videoPreview && (
          <motion.div
            className="mb-4 rounded-2xl overflow-hidden border border-accent/30 shadow-lg enhanced-card"
            exit={{ height: "120px" }}
            transition={{ duration: 1.0, ease: "easeInOut", delay: 1.0 }}
          >
            <video
              src={videoPreview}
              className="w-full object-cover"
              style={{ minHeight: "500px", maxHeight: "600px" }}
              autoPlay
              loop
              muted
              playsInline
            />
          </motion.div>
        )}

        <motion.div
          className="text-left px-16"
          exit={{ opacity: 0 }}
          transition={{ duration: 1.0 }}
        >
          <h2 className="text-2xl font-light tracking-wide uppercase text-white mb-2">{messages[state]}</h2>
          <p className="text-muted text-sm mb-4 font-light">{subMessages[state]}</p>

          {state === "analyzing" && (
            <div className="mt-4 space-y-2 max-w-xs">
              {steps.map((text, index) => (
                <LoadingStep
                  key={text}
                  text={text}
                  done={index < currentStep}
                  active={index === currentStep}
                />
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </motion.div>
  );
}

function LoadingStep({ text, done, active }: { text: string; done?: boolean; active?: boolean }) {
  return (
    <div className={`flex items-center gap-3 font-light ${done ? "text-white" : !active ? "text-muted" : "text-white"}`}>
      {done ? (
        <span className="text-accent shrink-0">✓</span>
      ) : active ? (
        <span className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin shrink-0"></span>
      ) : (
        <span className="w-4 h-4 shrink-0"></span>
      )}
      <span className="text-left">{text}</span>
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
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      {/* Header */}
      <motion.div
        className="flex items-center justify-between gap-4"
        initial={{ opacity: 0, y: 200 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          duration: 0.6,
          ease: [0.25, 0.1, 0.25, 1],
          delay: 2.0
        }}
        style={{ willChange: "transform, opacity" }}
      >
        <h2 className="text-2xl font-light tracking-wide uppercase text-white">Your Analysis</h2>
        <button
          onClick={onReset}
          className="px-4 py-2 text-xs font-light tracking-wide uppercase border border-accent/40 bg-accent/10 rounded-full hover:bg-accent/20 hover:border-accent text-white"
        >
          Analyze Another
        </button>
      </motion.div>

      {/* Video + Summary */}
      <motion.div
        className="grid gap-4 md:grid-cols-2"
        initial={{ opacity: 0, y: 200 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          duration: 0.6,
          ease: [0.25, 0.1, 0.25, 1],
          delay: 2.0
        }}
        style={{ willChange: "transform, opacity" }}
      >
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
          <h3 className="font-light tracking-wide uppercase text-white text-sm mb-2">Summary</h3>
          <p className="text-muted text-xs font-light">{analysis.summary}</p>

          {analysis.strengths.length > 0 && (
            <div className="mt-2">
              <h4 className="text-xs font-light tracking-wide uppercase text-accent mb-1">What You're Doing Right 🔥</h4>
              <ul className="space-y-0.5">
                {analysis.strengths.map((strength, i) => (
                  <li key={i} className="text-xs text-muted flex items-start gap-2 font-light">
                    <span className="text-accent mt-0.5">✓</span>
                    {strength}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </motion.div>

      {/* Improvements */}
      <motion.section
        initial={{ opacity: 0, y: 150 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          duration: 0.6,
          ease: [0.25, 0.1, 0.25, 1],
          delay: 2.2
        }}
        style={{ willChange: "transform, opacity" }}
      >
        <h3 className="text-base font-light tracking-wide uppercase mb-3 text-white">Areas to Improve</h3>
        <p className="text-xs text-muted mb-4 font-light">These are the money shots—fix these and you'll be striping it down the fairway in no time. 🎯</p>
        <div className="space-y-4">
          {analysis.improvements.map((item, i) => (
            <div key={i} className="glass-card rounded-xl p-4 shadow-lg hover:shadow-xl hover:border-accent/40">
              <div className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-accent/30 text-[#E1E4E8] flex items-center justify-center text-xs font-light border border-accent/50 shrink-0">
                  {i + 1}
                </span>
                <div className="flex-1">
                  <h4 className="font-light tracking-wide uppercase mb-1 text-white text-sm">{item.area}</h4>
                  <p className="text-xs text-muted mb-2 font-light">{item.issue}</p>
                  <div className="bg-accent/15 border border-accent/30 rounded-lg p-2">
                    <p className="text-xs text-white font-light"><span className="font-light tracking-wide uppercase text-[#E1E4E8]">Fix:</span> {item.fix}</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </motion.section>

      {/* Training Plan */}
      <motion.section
        initial={{ opacity: 0, y: 150 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          duration: 0.6,
          ease: [0.25, 0.1, 0.25, 1],
          delay: 2.4
        }}
        style={{ willChange: "transform, opacity" }}
      >
        <h3 className="text-base font-light tracking-wide uppercase mb-3 text-white">Training Plan</h3>
        <p className="text-xs text-muted mb-4 font-light">Your personalized roadmap to crushing it on the course. Stick with this and watch your handicap drop. 💪</p>
        <div className="space-y-4">
          {analysis.trainingPlan.map((week) => (
            <div key={week.weekNumber} className="glass-card rounded-xl p-3 shadow-lg">
              <div className="flex items-center gap-2 mb-2">
                <span className="px-2 py-1 bg-accent/30 text-[#E1E4E8] text-xs font-light tracking-wide uppercase rounded-full border border-accent/50">
                  W{week.weekNumber}
                </span>
                <span className="text-xs text-muted font-light">{week.focus}</span>
              </div>
              <div className="space-y-2">
                {week.drills.map((drill, i) => (
                  <div key={i} className="border-l-2 border-accent/40 pl-2">
                    <h5 className="font-light tracking-wide uppercase text-white text-xs">{drill.name}</h5>
                    <p className="text-xs text-muted mb-1 font-light">{drill.description}</p>
                    <p className="text-xs text-accent/80 font-light mb-2">{drill.reps}</p>
                    <a
                      href={`https://www.youtube.com/results?search_query=golf+${encodeURIComponent(drill.name)}+drill+tutorial`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 transition-colors font-light"
                    >
                      <PlayIcon />
                      <span>Watch tutorial videos</span>
                    </a>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </motion.section>

      {/* CTA */}
      <motion.div
        className="text-center py-4 border-t border-accent/20"
        initial={{ opacity: 0, y: 100 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          duration: 0.6,
          ease: [0.25, 0.1, 0.25, 1],
          delay: 2.6
        }}
        style={{ willChange: "transform, opacity" }}
      >
        <p className="text-muted mb-3 text-xs font-light">Got more swings to analyze? Let's keep the momentum going!</p>
        <button
          onClick={onReset}
          className="px-6 py-2 bg-accent text-black font-light tracking-wide uppercase rounded-full hover:bg-accent-dim accent-button shadow-lg hover:shadow-xl transition-all text-sm"
        >
          Upload Another Video
        </button>
      </motion.div>
    </motion.div>
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

function FlameIcon() {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2c.8 2.2 2 4.2 4 6-1 1-1.5 2.5-1.5 4 0 2.5 2 4.5 4.5 4.5.3 0 .5 0 .8-.1-1.1 2.8-3.8 4.6-7.3 4.6-4.1 0-7.5-3.4-7.5-7.5 0-2.4 1.2-4.6 3-6C9 5 10.2 3.5 12 2z" />
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

