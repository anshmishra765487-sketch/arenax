import { describe, expect, it } from "vitest";

import { filterProfanity, isProfane } from "./moderation";

describe("profanity filter", () => {
  it("masks blocked words and keeps the rest of the message", () => {
    expect(filterProfanity("you are a noob but gg")).toBe("you are a **** but gg");
  });

  it("is case-insensitive", () => {
    expect(filterProfanity("STUPID play")).toBe("****** play");
  });

  it("does not mangle innocent words that contain a blocked substring", () => {
    expect(filterProfanity("classic trashcan")).toBe("classic trashcan");
  });

  it("detects profanity", () => {
    expect(isProfane("what a cheat")).toBe(true);
    expect(isProfane("good luck team")).toBe(false);
  });
});
