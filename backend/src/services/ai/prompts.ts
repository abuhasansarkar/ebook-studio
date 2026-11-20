import { BOOK_TYPE_LABELS, getLanguage, type AssistAction, type BookBrief, type OutlineChapter } from "@ebook/shared";

const QUALITY_RULES = `
Quality rules (mandatory):
- Be specific and practical. Every paragraph must teach, show, or move the reader forward. No filler.
- Never invent statistics, studies, quotations, named experts, or citations. If a number is illustrative, say so ("for example").
- Clearly separate facts, opinions, estimates, and examples.
- Do not repeat explanations already covered in earlier chapters (their summaries are provided).
- Vary sentence structure and examples. Avoid clichés such as "in today's fast-paced world", "delve", "unlock", "game-changer", "navigate the landscape".
- Do not imitate the distinctive style of any living author and do not reproduce copyrighted text.
`.trim();

export function languageInstruction(code: string): string {
  const lang = getLanguage(code);
  if (lang.code === "en") return "Write in clear, natural English.";
  return `Write ENTIRELY in ${lang.name} (${lang.nativeName}), using natural, idiomatic phrasing a native reader would expect. Do not mix in English except for unavoidable technical terms.`;
}

export function briefContext(brief: BookBrief): string {
  return [
    `Book type: ${BOOK_TYPE_LABELS[brief.bookType]}`,
    `Topic / idea: ${brief.topic}`,
    brief.title ? `Working title: ${brief.title}` : null,
    `Target audience: ${brief.targetAudience} (knowledge level: ${brief.knowledgeLevel})`,
    brief.readerProblem ? `Reader's main problem: ${brief.readerProblem}` : null,
    brief.readerOutcome ? `Desired reader outcome: ${brief.readerOutcome}` : null,
    `Tone: ${brief.tone}. Depth: ${brief.depth.replace("_", " ")}.`,
    brief.extraInstructions ? `Author's extra instructions: ${brief.extraInstructions}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export function outlinePrompt(brief: BookBrief) {
  const isFiction = brief.bookType === "fiction";
  return {
    system: `You are a senior non-fiction and fiction book editor who designs commercially successful, well-structured books.
${languageInstruction(brief.language)}
Return only the requested JSON.`,
    user: `Design the complete outline for this book.

${briefContext(brief)}

Requirements:
- Exactly ${brief.chapterCount} chapters.${isFiction ? "" : " The first chapter is an introduction that hooks the reader and sets expectations; the last chapter is a conclusion with next steps."}
- Each chapter has a distinct purpose — no overlapping chapters.
- "goal": one or two sentences describing what the reader ${isFiction ? "experiences / what happens" : "will learn or be able to do"} after this chapter.
- "keyPoints": 3 to 5 ${isFiction ? "scene beats" : "section topics"}, each a short phrase. These become the chapter's sections.
- "targetWords": about ${brief.wordsPerChapter} (intro/conclusion may be shorter).
- "title": ${brief.title ? `use or improve "${brief.title}"` : "a compelling, specific, marketable title"}. "subtitle": a clear promise to the reader.
- All titles and text in the book's language.`,
  };
}

export interface SectionPromptInput {
  brief: BookBrief;
  bookTitle: string;
  allChapterTitles: string[];
  chapter: Pick<OutlineChapter, "title" | "goal" | "keyPoints">;
  chapterIndex: number;
  previousSummaries: string[];
  sectionTopic: string;
  sectionIndex: number;
  sectionCount: number;
  writtenSoFar: string;
  targetWords: number;
}

export function sectionPrompt(i: SectionPromptInput) {
  const isFiction = i.brief.bookType === "fiction";
  const toc = i.allChapterTitles.map((t, idx) => `${idx + 1}. ${t}${idx === i.chapterIndex ? "   <-- current" : ""}`).join("\n");
  const prev = i.previousSummaries.length
    ? i.previousSummaries.map((s, idx) => `Chapter ${idx + 1}: ${s}`).join("\n")
    : "(this is the first chapter)";
  // Keep the in-chapter context bounded: last ~6000 characters are enough for continuity.
  const soFar = i.writtenSoFar ? i.writtenSoFar.slice(-6000) : "(nothing yet — this is the first section of the chapter)";

  const format = isFiction
    ? "Write narrative prose only. No headings, no bullet lists. Use scene breaks (a line with ***) only if needed."
    : `Format as Markdown. Start with a level-2 heading (## ...) naming this section in the book's language. Use ### for sub-points if helpful. Use bullet lists, numbered steps, short tables, or a brief checklist where they genuinely help. Do not add a chapter title (it is added separately).`;

  return {
    system: `You are an expert author writing a high-quality ${BOOK_TYPE_LABELS[i.brief.bookType].toLowerCase()} for publication.
${languageInstruction(i.brief.language)}
${QUALITY_RULES}`,
    user: `BOOK BRIEF
${briefContext(i.brief)}

BOOK TITLE: ${i.bookTitle}

TABLE OF CONTENTS
${toc}

SUMMARIES OF EARLIER CHAPTERS (do not repeat their content)
${prev}

CURRENT CHAPTER ${i.chapterIndex + 1}: ${i.chapter.title}
Chapter goal: ${i.chapter.goal}
All ${isFiction ? "beats" : "sections"} of this chapter: ${i.chapter.keyPoints.join(" | ") || i.sectionTopic}

ALREADY WRITTEN IN THIS CHAPTER
${soFar}

TASK
Write ${isFiction ? "beat" : "section"} ${i.sectionIndex + 1} of ${i.sectionCount}: "${i.sectionTopic}".
Length: about ${i.targetWords} words.
Continue naturally from what is already written; do not restate it.${i.sectionIndex === i.sectionCount - 1 && !isFiction ? "\nEnd the chapter with a short \"Key takeaways\" list (3–5 bullets) under a ### heading." : ""}
${format}
Output only the ${isFiction ? "prose" : "Markdown"} content.`,
  };
}

export function summaryPrompt(chapterTitle: string, content: string, language: string) {
  return {
    system: `You summarize book chapters for an author's continuity notes. ${languageInstruction(language)}`,
    user: `Summarize the chapter "${chapterTitle}" in 3-5 sentences. Capture the key concepts, terms defined, examples used, and any facts or names introduced, so later chapters can stay consistent and avoid repetition.

CHAPTER TEXT:
${content.slice(0, 24000)}`,
  };
}

const ASSIST_INSTRUCTIONS: Record<AssistAction, string> = {
  rewrite: "Rewrite the text to improve flow and clarity while keeping the meaning and length similar.",
  expand: "Expand the text with more depth, a concrete detail or explanation. Roughly double its length.",
  shorten: "Make the text significantly more concise (about half the length) without losing key information.",
  simplify: "Simplify the text so a beginner can understand it. Use shorter sentences and plain words.",
  professional: "Rewrite the text in a polished, professional tone.",
  conversational: "Rewrite the text in a warm, conversational tone, as if talking to the reader.",
  proofread: "Fix spelling, grammar, and punctuation only. Keep wording and style otherwise unchanged.",
  add_example: "Keep the text and add one concrete, realistic example that illustrates the point. Do not invent statistics.",
  to_bullets: "Convert the text into a clear Markdown bullet list.",
  custom: "Follow the user's instruction.",
};

export function assistPrompt(action: AssistAction, text: string, language: string, instruction?: string) {
  return {
    system: `You are a careful book editor. ${languageInstruction(language)} Return ONLY the revised text (Markdown allowed), with no preamble or explanation.`,
    user: `${ASSIST_INSTRUCTIONS[action]}${instruction ? `\nUser instruction: ${instruction}` : ""}

TEXT:
${text}`,
  };
}
