"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A radio group that behaves the way the ARIA pattern requires.
 *
 * The role alone is not enough: a screen-reader user is told these are radios,
 * and then the arrow keys do nothing. This implements the roving tabindex —
 * the group is one tab stop, and the arrow keys move between the options and
 * select them, which is what a radio group is supposed to do.
 */
export function RadioGroup<T extends string>({ label, value, options, onChange, className, itemClassName }: {
  label: string;
  value: T;
  options: readonly { value: T; label: ReactNode; title?: string }[];
  onChange: (value: T) => void;
  className?: string;
  /** Applied per option, so the selected one can be styled differently. */
  itemClassName?: string | ((option: { value: T; label: ReactNode; title?: string }, selected: boolean) => string);
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const move = (from: number, delta: number) => {
    const next = (from + delta + options.length) % options.length;
    const option = options[next];
    onChange(option.value);
    // Move the focus with the selection, so the keyboard user stays on the
    // option they just chose.
    refs.current[next]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        move(index, 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        move(index, -1);
        break;
      case "Home":
        event.preventDefault();
        move(0, 0);
        break;
      case "End":
        event.preventDefault();
        move(options.length - 1, 0);
        break;
    }
  };

  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex", className)}>
      {options.map((option, index) => {
        const selected = option.value === value;
        const classes = typeof itemClassName === "function" ? itemClassName(option, selected) : itemClassName;
        return (
          <button
            key={option.value}
            ref={(el) => { refs.current[index] = el; }}
            type="button"
            role="radio"
            aria-checked={selected}
            // Roving tabindex: only the selected radio is in the tab order, so
            // the group costs one Tab stop rather than one per option.
            tabIndex={selected ? 0 : -1}
            title={option.title}
            onClick={() => onChange(option.value)}
            onKeyDown={(e) => onKeyDown(e, index)}
            className={cn(classes)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
