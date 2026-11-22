import { documentError } from "@ebook/shared";

export interface ChapterBackup {
  title?: string;
  contentJson?: Record<string, unknown>;
}

/**
 * Parses a chapter backup file (as written by the editor's Backup button).
 * Throws with a user-facing message when the file cannot be restored, so the
 * editor never loads a document the server would reject (or silently replace
 * an invalid one with an empty doc while the raw JSON gets saved).
 */
export function parseChapterBackup(text: string): ChapterBackup {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("The file is not valid JSON.");
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Invalid backup format.");
  const { title, contentJson } = data as Record<string, unknown>;
  const backup: ChapterBackup = {};
  if (title !== undefined && title !== null) {
    if (typeof title !== "string") throw new Error("The backup title is not text.");
    const trimmed = title.trim();
    if (trimmed.length > 200) throw new Error("The backup title is longer than 200 characters.");
    if (trimmed) backup.title = trimmed;
  }
  if (contentJson !== undefined && contentJson !== null) {
    const problem = documentError(contentJson);
    if (problem) throw new Error(`The backup content is not a valid chapter: ${problem}.`);
    backup.contentJson = contentJson as Record<string, unknown>;
  }
  if (!backup.title && !backup.contentJson) throw new Error("The backup has no title or content.");
  return backup;
}
