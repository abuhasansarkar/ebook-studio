import { describe, expect, it } from "vitest";
import { DEFAULT_PLANNING_SCOPE, PLANNING_DRAFT_MAX_AGE_MS, isExpiredPlanningDraft, parseStoredPlanningDraft, planningDraftKey } from "../planning-draft";

const brief = { topic: "Meal prep", title: "Prep" };

describe("planning drafts", () => {
  it("keys drafts by owner, scope and tab", () => {
    expect(planningDraftKey("u1", "new-book", "t1")).toBe("u1:new-book:t1");
  });

  it("reads current records of the owner", () => {
    const draft = parseStoredPlanningDraft("u1:new-book:t1", { v: 2, ownerId: "u1", scope: "new-book", updatedAt: 10, value: brief }, "u1");
    expect(draft).toMatchObject({ key: "u1:new-book:t1", scope: "new-book", updatedAt: 10, legacy: false, value: { topic: "Meal prep" } });
  });

  it("ignores other owners and damaged values", () => {
    expect(parseStoredPlanningDraft("u2:new-book:t1", { v: 2, ownerId: "u2", scope: "new-book", updatedAt: 10, value: brief }, "u1")).toBeNull();
    expect(parseStoredPlanningDraft("u1:new-book:t1", { v: 2, ownerId: "u1", scope: "new-book", updatedAt: 10, value: { topic: 5 } }, "u1")).toBeNull();
    // A user id that merely starts with the same characters is a different owner.
    expect(parseStoredPlanningDraft("u10:t1", brief, "u1")).toBeNull();
  });

  it("reads legacy per-tab records as drafts to migrate", () => {
    const draft = parseStoredPlanningDraft("u1:123-456", brief, "u1", 99);
    expect(draft).toMatchObject({ scope: DEFAULT_PLANNING_SCOPE, updatedAt: 99, legacy: true });
  });

  it("expires old records only", () => {
    const now = 1_000_000_000_000;
    expect(isExpiredPlanningDraft({ v: 2, updatedAt: now - PLANNING_DRAFT_MAX_AGE_MS - 1 }, now)).toBe(true);
    expect(isExpiredPlanningDraft({ v: 2, updatedAt: now - 1000 }, now)).toBe(false);
    expect(isExpiredPlanningDraft(brief, now)).toBe(false);
  });
});
