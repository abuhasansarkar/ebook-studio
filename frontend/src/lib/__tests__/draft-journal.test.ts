import { describe, expect, it, vi } from "vitest";
import { isValidDraft, usableDrafts } from "../draft-journal";

const doc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hi" }] }] };
const good = (id: string, updatedAt: number) => ({ id, ownerId: "u1", chapterId: "c1", baseVersion: 2, updatedAt, patch: { title: "T", contentJson: doc } });

describe("draft journal records", () => {
  it("accepts a well-formed draft", () => {
    expect(isValidDraft(good("a", 1), "u1", "c1")).toBe(true);
  });

  it.each([
    ["null", null],
    ["other owner", { ...good("a", 1), ownerId: "u2" }],
    ["negative version", { ...good("a", 1), baseVersion: -1 }],
    ["missing patch", { ...good("a", 1), patch: undefined }],
    ["non-text title", { ...good("a", 1), patch: { title: 5 } }],
    ["invalid document", { ...good("a", 1), patch: { contentJson: { type: "doc", content: [{ type: "script" }] } } }],
  ])("rejects %s", (_label, record) => {
    expect(isValidDraft(record, "u1", "c1")).toBe(false);
  });

  it("skips damaged records instead of hiding every draft", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const result = usableDrafts([good("old", 1), { id: 7 }, good("new", 5)], "u1", "c1");
    expect(result.map((d) => d.id)).toEqual(["new", "old"]);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});
