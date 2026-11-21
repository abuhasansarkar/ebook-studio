"use client";

import { useRef } from "react";

/** Six single-digit boxes with paste support and keyboard navigation. */
export function OtpInput({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length: 6 }, (_, i) => value[i] ?? "");

  const setAt = (i: number, d: string) => {
    const arr = digits.slice();
    arr[i] = d;
    onChange(arr.join("").slice(0, 6));
  };

  return (
    <div className="flex justify-between gap-2" role="group" aria-label="6-digit verification code">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={d}
          disabled={disabled}
          inputMode="numeric"
          // No maxLength: an autofilled or typed-over value arrives whole and is
          // split here. A one-character limit would cut a 6-digit autofill to 1.
          autoComplete={i === 0 ? "one-time-code" : "off"}
          aria-label={`Digit ${i + 1}`}
          className="h-14 w-full rounded-xl border border-border bg-surface text-center text-xl font-semibold focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "");
            if (!v) return setAt(i, "");
            if (v.length > 2) {
              // A whole code (SMS/keychain autofill) lands in one box: spread it out.
              const filled = (value.slice(0, i) + v).slice(0, 6);
              onChange(filled);
              refs.current[Math.min(filled.length, 5)]?.focus();
              return;
            }
            // Typing over a filled box gives two digits; the newest one wins.
            setAt(i, v[v.length - 1]);
            refs.current[i + 1]?.focus();
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !d) refs.current[i - 1]?.focus();
            if (e.key === "ArrowLeft") refs.current[i - 1]?.focus();
            if (e.key === "ArrowRight") refs.current[i + 1]?.focus();
          }}
          onPaste={(e) => {
            const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
            if (!pasted) return;
            e.preventDefault();
            onChange(pasted);
            refs.current[Math.min(pasted.length, 5)]?.focus();
          }}
        />
      ))}
    </div>
  );
}
