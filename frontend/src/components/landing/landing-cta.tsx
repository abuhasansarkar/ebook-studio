import Link from "next/link";
import { ArrowRight, Sparkles, CheckCircle2 } from "lucide-react";

export function LandingCTA() {
  return (
    <section className="py-20 bg-background relative overflow-hidden">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-tr from-[#e8603c] via-[#f06e49] to-[#ff7854] px-6 py-16 text-center text-white shadow-2xl shadow-[#e8603c]/25 sm:px-12 sm:py-20 transition-all duration-300 hover:shadow-[#e8603c]/35">
          {/* Subtle Floating Background Orbs with Keyframe Float */}
          <div
            className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/15 blur-2xl animate-float"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute -left-16 -bottom-16 h-64 w-64 rounded-full bg-black/15 blur-2xl animate-float-reverse"
            aria-hidden
          />

          <div className="relative z-10 max-w-2xl mx-auto">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3.5 py-1 text-xs font-semibold backdrop-blur-md transition-transform hover:scale-105">
              <Sparkles className="h-3 w-3" />
              CREATE YOUR FIRST TITLE TODAY
            </div>

            <h2 className="mt-5 text-3xl font-black tracking-tight sm:text-5xl text-white">
              Your knowledge is worth more than you think.
            </h2>

            <p className="mt-4 text-base text-white/90 sm:text-lg leading-relaxed">
              Join 12,000+ creators turning ideas into automated digital income streams.
              Write, illustrate, and publish in minutes.
            </p>

            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                href="/signup"
                className="shimmer-mask w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-white px-8 py-4 text-base font-bold text-[#e8603c] shadow-lg transition-all duration-200 hover:bg-white/95 hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 active:scale-98 cursor-pointer group"
              >
                <span>Start writing for free</span>
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
              </Link>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-4 text-xs text-white/85">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-white" />
                100 Free credits included
              </span>
              <span>•</span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-white" />
                No credit card required
              </span>
              <span>•</span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-white" />
                Cancel anytime
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
