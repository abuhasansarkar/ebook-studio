import { describe, expect, it } from "vitest";
import { parseChapterBackup } from "../chapter-backup";

const doc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hello" }] }] };

describe("parseChapterBackup", () => {
  it("accepts a title-only backup", () => {
    expect(parseChapterBackup(JSON.stringify({ title: "  Chapter one " }))).toEqual({ title: "Chapter one" });
  });

  it("accepts title and content", () => {
    expect(parseChapterBackup(JSON.stringify({ title: "A", contentJson: doc }))).toEqual({ title: "A", contentJson: doc });
  });

  it("rejects content the server would refuse", () => {
    expect(() => parseChapterBackup(JSON.stringify({ contentJson: { type: "doc", content: [{ type: "iframe" }] } }))).toThrow(/not a valid chapter/);
  });

  it.each([
    ["not JSON", "{"],
    ["an array", "[]"],
    ["empty", "{}"],
    ["a numeric title", JSON.stringify({ title: 3 })],
    ["a too-long title", JSON.stringify({ title: "x".repeat(201) })],
  ])("rejects %s", (_label, text) => {
    expect(() => parseChapterBackup(text)).toThrow();
  });
});
