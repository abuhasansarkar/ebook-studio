/**
 * Accessibility regressions.
 *
 * These lock in the accessibility work that was done by hand: the contrast of
 * the design tokens, the ARIA patterns that need keyboard support, the focus
 * ring, and the reduced-motion fallback.
 *
 * The contrast check is a real computation against the tokens in
 * `globals.css` — the same arithmetic an audit tool performs — so a future
 * change to a colour that drops below WCAG AA fails here rather than being
 * discovered by a reader.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const frontend = path.resolve(root, "..", "frontend", "src");

function read(relative: string): string {
  return readFileSync(path.join(frontend, relative), "utf8");
}

// --------------------------------------------------------------------------
// Contrast
// --------------------------------------------------------------------------

function luminance(hex: string): number {
  const c = hex.replace("#", "");
  const rgb = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

function contrast(a: string, b: string): number {
  const l1 = luminance(a);
  const l2 = luminance(b);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/** The colour tokens, read out of the stylesheet so the test cannot drift from it. */
function tokens(): Record<string, string> {
  const css = read("app/globals.css");
  const found: Record<string, string> = {};
  for (const match of css.matchAll(/--color-([a-z-]+):\s*(#[0-9a-fA-F]{3,8})/g)) {
    found[match[1]] = match[2];
  }
  return found;
}

describe("colour contrast", () => {
  it("parses the design tokens", () => {
    const t = tokens();
    expect(t["background"]).toBeDefined();
    expect(t["surface"]).toBeDefined();
    expect(t["foreground"]).toBeDefined();
  });

  // Every pair that renders as text has to clear 4.5:1 (WCAG 2.1 AA for
  // normal-size text). These are the pairs that appear in the product.
  const textPairs: [string, string, string][] = [
    ["body text on background", "foreground", "background"],
    ["body text on surface", "foreground", "surface"],
    ["body text on muted", "foreground", "muted"],
    ["muted text on background", "muted-foreground", "background"],
    ["muted text on surface", "muted-foreground", "surface"],
    ["muted text on muted", "muted-foreground", "muted"],
    ["link text on background", "primary-hover", "background"],
    ["link text on surface", "primary-hover", "surface"],
    ["primary label on primary fill", "primary-foreground", "primary"],
    ["primary label on primary hover", "primary-foreground", "primary-hover"],
    ["primary text on primary soft", "primary-hover", "primary-soft"],
    ["success text on background", "success", "background"],
    ["success text on success soft", "success", "success-soft"],
    ["warning text on background", "warning", "background"],
    ["warning text on warning soft", "warning", "warning-soft"],
    ["danger text on background", "danger", "background"],
    ["danger text on danger soft", "danger", "danger-soft"],
  ];

  for (const [name, fg, bg] of textPairs) {
    it(`${name} clears WCAG AA (4.5:1)`, () => {
      const t = tokens();
      expect(t[fg], `token --color-${fg} is missing`).toBeDefined();
      expect(t[bg], `token --color-${bg} is missing`).toBeDefined();
      const ratio = contrast(t[fg], t[bg]);
      expect(ratio, `${name}: ${t[fg]} on ${t[bg]} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    });
  }

  it("keeps the brand fill bright enough to read as an accent", () => {
    const t = tokens();
    // The fill itself must still be distinguishable from the page, so the
    // primary button reads as a button and not as a tinted rectangle.
    expect(contrast(t["primary"], t["background"])).toBeGreaterThanOrEqual(3);
  });

  it("does not ship a colour that is only decorative", () => {
    const t = tokens();
    // Every text-bearing token must be a real hex colour, so the contrast
    // check above cannot be skipped by a broken value.
    for (const key of ["foreground", "muted-foreground", "primary", "success", "warning", "danger"]) {
      expect(t[key]).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
});

// --------------------------------------------------------------------------
// Focus and motion
// --------------------------------------------------------------------------

describe("focus visibility and reduced motion", () => {
  it("shows a focus ring for keyboard focus", () => {
    const css = read("app/globals.css");
    expect(css).toMatch(/:focus-visible\s*\{[^}]*outline:/);
  });

  it("honours prefers-reduced-motion", () => {
    const css = read("app/globals.css");
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
    const block = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(block).toMatch(/transition-duration:\s*0\.01ms\s*!important/);
    expect(block).toMatch(/animation-duration:\s*0\.01ms\s*!important/);
  });
});

// --------------------------------------------------------------------------
// ARIA patterns
// --------------------------------------------------------------------------

describe("dialog accessibility", () => {
  it("gives every dialog a unique accessible name", () => {
    const dialog = read("components/ui/dialog.tsx");
    // A fixed id would be duplicated across the ten dialogs in the product,
    // and the second one's aria-labelledby would point at the first.
    expect(dialog).not.toMatch(/id="dialog-title"/);
    expect(dialog).toMatch(/useId\(\)/);
    expect(dialog).toMatch(/aria-labelledby=\{titleId\}/);
  });

  it("describes the dialog when there is a description", () => {
    const dialog = read("components/ui/dialog.tsx");
    expect(dialog).toMatch(/aria-describedby=\{description \? descriptionId : undefined\}/);
  });

  it("keeps Escape and the state in step", () => {
    const dialog = read("components/ui/dialog.tsx");
    // Escape on a native dialog closes the element without telling React,
    // which leaves the component believing it is still open.
    expect(dialog).toMatch(/addEventListener\("cancel"/);
    expect(dialog).toMatch(/event\.preventDefault\(\)/);
  });
});

describe("keyboard-operable ARIA widgets", () => {
  it("provides a radio group with arrow-key navigation", () => {
    const radio = read("components/ui/radio-group.tsx");
    expect(radio).toMatch(/role="radiogroup"/);
    expect(radio).toMatch(/ArrowRight/);
    expect(radio).toMatch(/ArrowLeft/);
    // A roving tabindex makes the group one tab stop rather than one per option.
    expect(radio).toMatch(/tabIndex=\{selected \? 0 : -1\}/);
  });

  it("uses the shared radio group wherever a radiogroup is declared", () => {
    // Any remaining hand-rolled radiogroup would not have arrow keys.
    const files = [
      "components/design/design-preview.tsx",
      "app/app/create/page.tsx",
    ];
    for (const file of files) {
      const source = read(file);
      expect(source, `${file} declares a raw radiogroup`).not.toMatch(/role="radiogroup"/);
      expect(source, `${file} does not use the shared RadioGroup`).toMatch(/RadioGroup/);
    }
  });

  it("gives the AI-assist menu arrow keys and Escape", () => {
    const assist = read("components/editor/ai-assist.tsx");
    expect(assist).toMatch(/role="menu"/);
    expect(assist).toMatch(/ArrowDown/);
    expect(assist).toMatch(/Escape/);
    expect(assist).toMatch(/aria-haspopup="menu"/);
  });

  it("lets a keyboard user reorder chapters", () => {
    const outline = read("components/books/outline-screen.tsx");
    expect(outline).toMatch(/KeyboardSensor/);
    expect(outline).toMatch(/sortableKeyboardCoordinates/);
    // The handle must be a real button, so it is in the tab order.
    expect(outline).toMatch(/<button[^>]*aria-label=\{`Reorder chapter/);
  });

  it("lets a keyboard user move between design tabs", () => {
    const design = read("components/design/design-studio.tsx");
    expect(design).toMatch(/role="tablist"/);
    expect(design).toMatch(/ArrowRight/);
    expect(design).toMatch(/tabIndex=\{tab === key \? 0 : -1\}/);
  });
});

// --------------------------------------------------------------------------
// Announcements
// --------------------------------------------------------------------------

describe("status announcements", () => {
  it("announces the editor save state politely", () => {
    const indicator = read("components/editor/save-indicator.tsx");
    expect(indicator).toMatch(/role="status"/);
    expect(indicator).toMatch(/aria-live="polite"/);
    expect(indicator).toMatch(/aria-atomic="true"/);
  });

  it("announces a save failure assertively", () => {
    const indicator = read("components/editor/save-indicator.tsx");
    expect(indicator).toMatch(/role="alert"/);
  });

  it("keeps the visible save label in step with the announcement", () => {
    const indicator = read("components/editor/save-indicator.tsx");
    // The announced text must cover the states a reader needs to hear.
    for (const state of ["Saving", "Unsaved changes", "Edit conflict", "Not saved", "Saved"]) {
      expect(indicator).toContain(state);
    }
  });
});
