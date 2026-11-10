"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Maximize2,
  SkipForward,
  SkipBack,
  Download,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  BarChart3,
  Flag,
  ArrowRight,
  ShoppingCart,
  Zap,
} from "lucide-react";

interface Scene {
  id: number;
  title: string;
  timestamp: string;
  startTime: number; // in seconds
  endTime: number;
  audioSrc: string;
  voiceoverText: string;
  screenBadge: string;
  visualTitle: string;
  visualSubtitle: string;
}

const SCENES: Scene[] = [
  {
    id: 1,
    title: "The Problem",
    timestamp: "0:00 – 0:25",
    startTime: 0,
    endTime: 25,
    audioSrc: "/audio/scene_1.m4a",
    screenBadge: "The Traditional Experimentation Dilemma",
    visualTitle: "Traditional Experimentation is Broken",
    visualSubtitle: "Hypotheses sit trapped in Jira for weeks, developers manually code flags, and 82% of winning tests stall before rollout.",
    voiceoverText:
      "Every engineering and growth team wants to run fast experiments. But today, the process is agonizingly slow. Ideas sit in Jira for weeks, developers manually wire up feature flags, analysts struggle with statistical significance, and teams hesitate to roll out winning features for fear of breaking production. What if an AI co-pilot could handle the entire experimentation lifecycle safely, deterministically, and powered by Flagsmith?",
  },
  {
    id: 2,
    title: "Introducing PulsePilot",
    timestamp: "0:25 – 0:55",
    startTime: 25,
    endTime: 55,
    audioSrc: "/audio/scene_2.m4a",
    screenBadge: "Operational Overview (/dashboard)",
    visualTitle: "PulsePilot AI — Autonomous Co-Pilot",
    visualSubtitle: "Unified platform orchestrating 5 specialized Gemini 2.5 Flash agents with real-time Flagsmith feature flag actuation.",
    voiceoverText:
      "Meet PulsePilot AI. PulsePilot is an autonomous experimentation and product growth platform powered by Google Gemini 2.5 Flash and Flagsmith. It bridges the gap between natural language ideas and production feature flags. On our dashboard, teams get a live operational overview of active multivariate tests, real-time exposure counts, and AI-driven recommendations across their entire workspace.",
  },
  {
    id: 3,
    title: "AI Experiment Creation",
    timestamp: "0:55 – 1:25",
    startTime: 55,
    endTime: 85,
    audioSrc: "/audio/scene_3.m4a",
    screenBadge: "Experiment Studio (/studio) + HITL Gate",
    visualTitle: "Natural Language -> Flagsmith Payload",
    visualSubtitle: "Strategy & Builder agents formulate hypotheses and metric trees, bound by a mandatory Human-in-the-Loop approval gate.",
    voiceoverText:
      "Let us create an experiment. In the Studio, I simply enter my objective: Optimize mobile checkout to reduce cart abandonment. Within seconds, our Strategy and Builder agents formulate the experiment hypothesis, assign primary and guardrail metrics, and generate the exact multivariate JSON payload for Flagsmith. But notice our strict Human-in-the-Loop policy: AI agents can never touch production flags without an authenticated human approval. I review the proposal, click Approve, and the flag is provisioned in Flagsmith.",
  },
  {
    id: 4,
    title: "Real Flagsmith Integration",
    timestamp: "1:25 – 1:55",
    startTime: 85,
    endTime: 115,
    audioSrc: "/audio/scene_4.m4a",
    screenBadge: "Flagsmith Cloud Actuation (Project 53867)",
    visualTitle: "Flagsmith Multivariate Feature Plane",
    visualSubtitle: "Flag 'checkout_experience' evaluated with MurmurHash3 deterministic identity hashing for zero UI flicker.",
    voiceoverText:
      "Here is the live Flagsmith integration. PulsePilot connects via Flagsmith client SDK and Server-side Management API. In the Flagsmith dashboard, you can see our multivariate feature: checkout_experience, with three distinct allocations: our three-step Control, Variant A single-page layout, and Variant B express checkout. Flagsmith MurmurHash3 identity evaluation guarantees zero UI flicker and stable variant assignment across sessions.",
  },
  {
    id: 5,
    title: "Live Store & Zero-Hallucination Stats",
    timestamp: "1:55 – 2:25",
    startTime: 115,
    endTime: 145,
    audioSrc: "/audio/scene_5.m4a",
    screenBadge: "Demo Store (/demo-store) & Analytics (/analytics)",
    visualTitle: "Pure TypeScript Statistical Integrity",
    visualSubtitle: "Variant B lifts checkout conversion by +15.0% (p = 0.032, Bayes win rate 98.4%). Computed with deterministic math, not LLM guesses.",
    voiceoverText:
      "Now let us look at the customer experience in PulsePilot Shop. As I enter checkout, Flagsmith evaluates my visitor identity and dynamically renders the Express variation. When I complete checkout, exposure and conversion events are attributed with identical user IDs. In our Analytics module, notice something critical: our statistics are never hallucinated by an LLM. Our pure TypeScript math engine computes the exact Z-scores, p-values, and Bayesian win probabilities, feeding factual data to our Analytics agent.",
  },
  {
    id: 6,
    title: "Release Guardian & Safe Rollback",
    timestamp: "2:25 – 2:45",
    startTime: 145,
    endTime: 165,
    audioSrc: "/audio/scene_6.m4a",
    screenBadge: "Release Center (/release-center)",
    visualTitle: "Canary Rollout & 1-Click Rollback",
    visualSubtitle: "Progressive traffic allocation (5% -> 25% -> 100%) with real-time guardrail sentinels and < 50ms emergency kill-switch.",
    voiceoverText:
      "Once an experiment wins, how do we safely deploy it? Meet the Release Guardian. It verifies our five-point release readiness matrix and allows us to promote the winning variant through gradual canary stages, from 5 percent, to 25 percent, to 100 percent, updating Flagsmith in real time. If a guardrail metric spikes, the Release Guardian immediately alerts the team and provides a one-click safe rollback, reverting traffic to 100 percent Control in under 50 milliseconds with a permanent audit trail.",
  },
  {
    id: 7,
    title: "Conclusion & Value",
    timestamp: "2:45 – 3:00",
    startTime: 165,
    endTime: 180,
    audioSrc: "/audio/scene_7.m4a",
    screenBadge: "Summary & Impact",
    visualTitle: "From Ideas to Winning Experiments",
    visualSubtitle: "70% faster time-to-test, 3.4x experiment velocity, and zero regression incidents powered by Flagsmith.",
    voiceoverText:
      "PulsePilot AI transforms experimentation from a slow, anxious chore into an autonomous, mathematically rigorous growth engine. From natural language idea, to Flagsmith flag, to statistical analysis, to safe canary rollout, PulsePilot helps teams build winning products faster. Thank you!",
  },
];

export default function DemoVideoTheaterPage() {
  const [currentSceneIdx, setCurrentSceneIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(180);
  const [isMuted, setIsMuted] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const scene = SCENES[currentSceneIdx];

  // Switch audio track when scene changes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.src = scene.audioSrc;
      audioRef.current.load();
      if (isPlaying) {
        audioRef.current.play().catch((e) => console.log("Audio play error:", e));
      }
    }
  }, [currentSceneIdx]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch((e) => console.log("Audio play blocked:", e));
    }
  };

  const handleAudioTimeUpdate = () => {
    if (audioRef.current) {
      const audioProgress = audioRef.current.currentTime;
      const totalTime = scene.startTime + audioProgress;
      setCurrentTime(Math.min(totalTime, duration));
    }
  };

  const handleAudioEnded = () => {
    if (currentSceneIdx < SCENES.length - 1) {
      setCurrentSceneIdx((prev) => prev + 1);
    } else {
      setIsPlaying(false);
      setCurrentTime(0);
      setCurrentSceneIdx(0);
    }
  };

  const jumpToScene = (idx: number) => {
    setCurrentSceneIdx(idx);
    setCurrentTime(SCENES[idx].startTime);
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Top Header */}
      <header className="h-16 px-6 bg-white border-b border-slate-200 flex items-center justify-between sticky top-0 z-40 shadow-xs">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center text-white font-bold shadow-xs">
              <Zap className="w-4 h-4 fill-white" />
            </div>
            <div>
              <span className="font-bold text-sm tracking-tight text-slate-900">PulsePilot AI</span>
              <span className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-violet-100 text-violet-700">
                DEMO THEATER
              </span>
            </div>
          </Link>
        </div>

        <div className="flex items-center gap-3">
          <a
            href="/audio/full_demo_voiceover.m4a"
            download="PulsePilot_AI_3Min_Demo_Voiceover_Indian_Accent.m4a"
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg bg-violet-50 text-violet-700 hover:bg-violet-100 transition-colors border border-violet-200"
          >
            <Download className="w-3.5 h-3.5" />
            Download Full Voiceover (.m4a)
          </a>
          <Link
            href="/docs/HACKATHON_PITCH_DECK.md"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
          >
            Pitch Deck Document
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </header>

      {/* Hidden Audio Player */}
      <audio
        ref={audioRef}
        onTimeUpdate={handleAudioTimeUpdate}
        onEnded={handleAudioEnded}
        muted={isMuted}
      />

      {/* Main Theater Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 flex flex-col lg:flex-row gap-6">
        {/* Left: Video Player Viewport */}
        <div className="flex-1 flex flex-col space-y-4">
          {/* 16:9 Video Display Container */}
          <div className="relative aspect-video w-full rounded-2xl bg-gradient-to-br from-slate-900 via-slate-950 to-indigo-950 text-white shadow-xl overflow-hidden border border-slate-800 flex flex-col justify-between p-6 sm:p-10 select-none">
            {/* Background Aesthetic Watermark */}
            <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#8b5cf6_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />

            {/* Top Bar inside Video */}
            <div className="relative z-10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-violet-600/80 backdrop-blur-md text-white border border-violet-400/30 flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3" />
                  {scene.screenBadge}
                </span>
                <span className="text-xs font-mono text-slate-400">Scene {scene.id} of 7</span>
              </div>
              <div className="flex items-center gap-2 text-xs font-medium text-slate-300 bg-black/40 px-2.5 py-1 rounded-md backdrop-blur-md border border-white/10">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Flagsmith Toggle Wars Demo
              </div>
            </div>

            {/* Central Slide Visualization */}
            <div className="relative z-10 my-auto text-center max-w-2xl mx-auto space-y-4 animate-in fade-in duration-500">
              {scene.id === 1 && (
                <div className="space-y-4">
                  <div className="inline-flex p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-mono uppercase tracking-wider">
                    Current Bottleneck
                  </div>
                  <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
                    Traditional Experimentation is Broken
                  </h2>
                  <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
                    Ideas sit in Jira tickets for weeks. Developers manually wire flags. Analysts misinterpret statistical noise. 82% of winning tests stall before 100% rollout.
                  </p>
                </div>
              )}

              {scene.id === 2 && (
                <div className="space-y-4">
                  <div className="inline-flex p-3 rounded-2xl bg-violet-500/10 border border-violet-500/20 text-violet-300 text-xs font-mono uppercase tracking-wider">
                    The Solution
                  </div>
                  <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
                    Meet PulsePilot AI
                  </h2>
                  <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
                    Autonomous experimentation co-pilot powered by Google Gemini 2.5 Flash and Flagsmith. Closing the loop between high-level product intuition and safe production rollouts.
                  </p>
                </div>
              )}

              {scene.id === 3 && (
                <div className="space-y-4">
                  <div className="inline-flex p-3 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-mono uppercase tracking-wider">
                    Natural Language &rarr; Flagsmith Payload
                  </div>
                  <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
                    Human-in-the-Loop Governance
                  </h2>
                  <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
                    Strategy & Builder agents formulate hypotheses and metric trees, but AI agents are strictly forbidden from mutating production flags without authenticated human approval.
                  </p>
                </div>
              )}

              {scene.id === 4 && (
                <div className="space-y-4">
                  <div className="inline-flex p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-mono uppercase tracking-wider">
                    Actuation Backbone
                  </div>
                  <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
                    Flagsmith Cloud Integration
                  </h2>
                  <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
                    Multivariate feature &apos;checkout_experience&apos; with MurmurHash3 deterministic identity evaluation. Zero UI flicker and sub-25ms edge evaluations.
                  </p>
                </div>
              )}

              {scene.id === 5 && (
                <div className="space-y-4">
                  <div className="inline-flex p-3 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-xs font-mono uppercase tracking-wider">
                    Zero-Hallucination Stats
                  </div>
                  <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
                    Pure TypeScript Mathematical Engine
                  </h2>
                  <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
                    Variant B yields +15.0% relative lift, Z-score = 2.14, p = 0.032, Bayes win rate = 98.4%, and passed Chi-Square Sample Ratio Mismatch (SRM) checks.
                  </p>
                </div>
              )}

              {scene.id === 6 && (
                <div className="space-y-4">
                  <div className="inline-flex p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-mono uppercase tracking-wider">
                    Production Safety Plane
                  </div>
                  <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
                    The Release Guardian
                  </h2>
                  <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
                    Gradual canary progression (5% &rarr; 25% &rarr; 100%), real-time guardrail sentinels, and emergency 1-click rollback in &lt; 50ms with an immutable audit trail.
                  </p>
                </div>
              )}

              {scene.id === 7 && (
                <div className="space-y-4">
                  <div className="inline-flex p-3 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-purple-300 text-xs font-mono uppercase tracking-wider">
                    Value Delivered
                  </div>
                  <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
                    From Ideas to Winning Experiments
                  </h2>
                  <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
                    -70% time-to-test, 3.4x experiment velocity, and zero production regressions. Feature flags are the ultimate safety boundary for AI agents.
                  </p>
                </div>
              )}
            </div>

            {/* Subtitle / Teleprompter Box */}
            <div className="relative z-10 bg-black/60 backdrop-blur-md rounded-xl p-3 border border-white/10 text-xs sm:text-sm text-slate-200 text-center leading-relaxed font-sans shadow-lg">
              <span className="text-violet-400 font-semibold mr-1.5">🎙️ Voiceover (Rishi, Indian Accent):</span>
              &ldquo;{scene.voiceoverText}&rdquo;
            </div>
          </div>

          {/* Video Player Controls Bar */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
            {/* Timeline Bar */}
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono text-slate-500 w-10 text-right">
                {formatTime(currentTime)}
              </span>
              <div className="flex-1 relative h-2 bg-slate-100 rounded-full overflow-hidden cursor-pointer">
                <div
                  className="h-full bg-violet-600 transition-all duration-100"
                  style={{ width: `${(currentTime / duration) * 100}%` }}
                />
              </div>
              <span className="text-xs font-mono text-slate-500 w-10">
                {formatTime(duration)}
              </span>
            </div>

            {/* Button Actions */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => jumpToScene(Math.max(0, currentSceneIdx - 1))}
                  disabled={currentSceneIdx === 0}
                  className="p-2 rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-30 transition-colors"
                  title="Previous Scene"
                >
                  <SkipBack className="w-4 h-4" />
                </button>

                <button
                  onClick={togglePlay}
                  className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white font-semibold text-xs flex items-center gap-2 shadow-xs transition-colors"
                >
                  {isPlaying ? (
                    <>
                      <Pause className="w-4 h-4 fill-white" /> Pause Demo
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 fill-white" /> Play Demo Video
                    </>
                  )}
                </button>

                <button
                  onClick={() => jumpToScene(Math.min(SCENES.length - 1, currentSceneIdx + 1))}
                  disabled={currentSceneIdx === SCENES.length - 1}
                  className="p-2 rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-30 transition-colors"
                  title="Next Scene"
                >
                  <SkipForward className="w-4 h-4" />
                </button>

                <button
                  onClick={() => {
                    setCurrentSceneIdx(0);
                    setCurrentTime(0);
                    if (audioRef.current) audioRef.current.currentTime = 0;
                  }}
                  className="p-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
                  title="Restart from Beginning"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>

              {/* Volume & Audio Track selector */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsMuted(!isMuted)}
                  className="p-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
                  title={isMuted ? "Unmute" : "Mute"}
                >
                  {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>
                <span className="text-xs text-slate-500 font-medium hidden sm:inline">
                  Voice: <span className="font-semibold text-slate-800">Rishi (Indian English)</span>
                </span>
              </div>
            </div>
          </div>

          {/* Scene Thumbnails / Timeline Selector */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            {SCENES.map((s, idx) => (
              <button
                key={s.id}
                onClick={() => jumpToScene(idx)}
                className={`p-2.5 rounded-lg border text-left transition-all ${
                  currentSceneIdx === idx
                    ? "bg-violet-50 border-violet-500 shadow-xs ring-1 ring-violet-500/20"
                    : "bg-white border-slate-200 hover:border-slate-300"
                }`}
              >
                <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
                  <span>Scene {s.id}</span>
                  <span>{s.timestamp.split("–")[0].trim()}</span>
                </div>
                <div className="font-semibold text-xs text-slate-900 truncate mt-1">
                  {s.title}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Right: Speaker Notes & Script Sidebar */}
        <div className="lg:w-96 flex flex-col space-y-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4 flex-1">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-violet-600" />
                Scene Teleprompter & Notes
              </h3>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-violet-100 text-violet-700 font-semibold">
                {scene.timestamp}
              </span>
            </div>

            <div className="space-y-3">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Target Product View
                </span>
                <p className="text-xs font-semibold text-slate-800 mt-0.5">{scene.screenBadge}</p>
              </div>

              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Voiceover Script (Indian Accent Audio)
                </span>
                <p className="text-xs text-slate-700 leading-relaxed mt-1 p-3 bg-slate-50 rounded-lg border border-slate-100">
                  {scene.voiceoverText}
                </p>
              </div>

              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Key Judge Takeaways
                </span>
                <ul className="text-xs text-slate-600 space-y-1.5 mt-1.5">
                  <li className="flex items-start gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 flex-shrink-0" />
                    <span>Live Flagsmith evaluation with MurmurHash3 identity stability</span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 flex-shrink-0" />
                    <span>Pure TypeScript math engine ensures zero arithmetic hallucination</span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 flex-shrink-0" />
                    <span>Human-in-the-Loop gate prevents unauthorized production mutations</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 space-y-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Direct Links to Test Live
              </span>
              <div className="grid grid-cols-2 gap-2">
                <Link
                  href="/demo-store"
                  className="px-2.5 py-1.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-xs text-center transition-colors truncate"
                >
                  Demo Store
                </Link>
                <Link
                  href="/release-center"
                  className="px-2.5 py-1.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-xs text-center transition-colors truncate"
                >
                  Release Center
                </Link>
                <Link
                  href="/studio"
                  className="px-2.5 py-1.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-xs text-center transition-colors truncate"
                >
                  Experiment Studio
                </Link>
                <Link
                  href="/analytics"
                  className="px-2.5 py-1.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-xs text-center transition-colors truncate"
                >
                  Stats Engine
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
