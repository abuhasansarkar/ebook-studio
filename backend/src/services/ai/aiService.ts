import { z } from "zod";
import { outlineSchema, type AssistAction, type BookBrief, type Outline } from "@ebook/shared";
import { env } from "../../config/env.js";
import { openaiProvider, type AiUsage } from "./openaiClient.js";
import { assistPrompt, outlinePrompt, sectionPrompt, summaryPrompt, type SectionPromptInput } from "./prompts.js";

/**
 * Structured-output schema sent to OpenAI. Strict mode requires every field to be
 * required and default-free, so it is separate from the shared (lenient) outlineSchema.
 */
const aiOutlineSchema = z.object({
  title: z.string(),
  subtitle: z.string(),
  chapters: z.array(
    z.object({
      title: z.string(),
      goal: z.string(),
      keyPoints: z.array(z.string()),
      targetWords: z.number().int(),
    }),
  ),
});

const useMock = () => env.AI_MOCK;
const mockUsage: AiUsage = { model: "mock", inputTokens: 0, outputTokens: 0 };

export const aiService = {
  async generateOutline(brief: BookBrief): Promise<{ outline: Outline; usage: AiUsage }> {
    if (useMock()) return { outline: mock.outline(brief), usage: mockUsage };
    const prompt = outlinePrompt(brief);
    const { data, usage } = await openaiProvider.json({ ...prompt, schema: aiOutlineSchema, name: "book_outline", maxOutputTokens: 8000 });
    // Normalize through the shared schema (clamps lengths, applies defaults).
    const outline = outlineSchema.parse({
      ...data,
      chapters: data.chapters.map((c) => ({
        ...c,
        keyPoints: c.keyPoints.slice(0, 6),
        targetWords: Math.min(6000, Math.max(200, c.targetWords || brief.wordsPerChapter)),
      })),
    });
    return { outline, usage };
  },

  async writeSection(input: SectionPromptInput) {
    if (useMock()) return { text: mock.section(input), usage: mockUsage };
    const prompt = sectionPrompt(input);
    // Non-Latin scripts use more tokens per word; leave headroom for reasoning tokens too.
    const maxOutputTokens = Math.min(16000, Math.max(2500, input.targetWords * 5));
    return openaiProvider.text({ ...prompt, maxOutputTokens });
  },

  async summarizeChapter(title: string, content: string, language: string) {
    if (useMock()) return { text: `Mock summary of "${title}".`, usage: mockUsage };
    return openaiProvider.text({ ...summaryPrompt(title, content, language), maxOutputTokens: 1500 });
  },

  async assist(action: AssistAction, text: string, language: string, instruction?: string) {
    if (useMock()) return { text: mock.assist(action, text), usage: mockUsage };
    return openaiProvider.text({ ...assistPrompt(action, text, language, instruction), maxOutputTokens: Math.max(1500, text.length) });
  },
};

// ---------------------------------------------------------------------------
// Deterministic mock (AI_MOCK=1) for tests and keyless local development.
// ---------------------------------------------------------------------------
const mock = {
  outline(brief: BookBrief): Outline {
    const topic = brief.topic.replace(/\.$/, "");
    const chapters = Array.from({ length: brief.chapterCount }, (_, i) => {
      const n = i + 1;
      const title = i === 0 ? "Introduction" : i === brief.chapterCount - 1 ? "Conclusion and Next Steps" : `Part ${n}: Core Idea ${n - 1}`;
      return {
        title,
        goal: `Help the reader understand step ${n} of ${topic}.`,
        keyPoints: ["Why it matters", "How it works", "Putting it into practice"],
        targetWords: brief.wordsPerChapter,
      };
    });
    return { title: brief.title || `The Practical Guide to ${topic}`.slice(0, 120), subtitle: `A clear, step-by-step book for ${brief.targetAudience}`, chapters };
  },
  section(i: SectionPromptInput): string {
    const para = `This section explains "${i.sectionTopic}" as part of ${i.chapter.title}. It gives the reader practical guidance, a concrete example, and a clear next action.`;
    const isLeadMagnet = i.brief.bookType === "lead_magnet";
    const lines = [`## ${i.sectionTopic}`, "", para];
    if (isLeadMagnet) {
      lines.push(
        "",
        `> [!EXAMPLE] Exemple concret\n> Imagine that you are applying ${i.sectionTopic} in real life. You take action, test the result, and see immediate progress.`,
        "",
        `> [!MISTAKE] Common Trap\n> Waiting too long to start or thinking you need perfect conditions before taking the first step.`,
        "",
        "👉 Key action step for this section",
        "👉 Simple daily routine to keep momentum"
      );
    } else {
      lines.push("", para, "", "- First practical step", "- Second practical step", "- Third practical step");
    }
    if (i.sectionIndex === i.sectionCount - 1) {
      if (isLeadMagnet) {
        lines.push("", "> [!SUMMARY]\n> - Use what you already have\n> - Build 3-4 initial test projects\n> - Reach out with confidence");
      } else {
        lines.push("", "### Key takeaways", "", "- Takeaway one", "- Takeaway two", "- Takeaway three");
      }
    }
    return lines.join("\n");
  },
  assist(action: AssistAction, text: string): string {
    return action === "to_bullets" ? text.split(/(?<=\.)\s+/).map((s) => `- ${s}`).join("\n") : `${text} (${action})`;
  },
};
