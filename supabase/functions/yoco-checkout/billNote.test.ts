import { describe, expect, it } from "vitest";
import {
  BILL_NOTE_MAX_LENGTH,
  buildBillNote,
  classTitleFromLookup,
  memberShortName,
} from "./billNote.ts";

describe("buildBillNote", () => {
  it("formats a normal class booking", () => {
    const note = buildBillNote({
      id: "abcdef01-2222-3333-4444-555566667777",
      kind: "class",
      classTitle: "Yoga: Power",
      // 06:00 SAST (UTC+2, no DST)
      startsAt: "2026-08-10T04:00:00.000Z",
      firstName: "Jane",
      lastName: "Smith",
    });
    expect(note).toBe("abcdef01 | Yoga: Power 06:00 | J Smith");
  });

  it("formats a package / credit-bundle purchase", () => {
    const note = buildBillNote({
      id: "packuuid-aaaa-bbbb-cccc-ddddeeeeffff",
      kind: "package",
      packageName: "10-class pack",
      firstName: "Amara",
      lastName: "Naidoo",
    });
    expect(note).toBe("packuuid | 10-class pack | A Naidoo");
  });

  it("uses Member when the member name is missing", () => {
    const note = buildBillNote({
      id: "aaaaaaaa-bbbb-cccc-dddd-eeeeffff0000",
      kind: "class",
      classTitle: "Sculpt: HIIT",
      startsAt: "2026-08-10T05:30:00.000Z",
      firstName: null,
      lastName: null,
    });
    expect(note).toBe("aaaaaaaa | Sculpt: HIIT 07:30 | Member");
    expect(memberShortName(undefined, undefined)).toBe("Member");
    expect(memberShortName("  ", "")).toBe("Member");
  });

  it("truncates over-length notes from the end without splitting a token", () => {
    const longTitle = "Yoga: " + "FlowStateMeditationRecovery".repeat(8);
    const note = buildBillNote({
      id: "12345678-aaaa-bbbb-cccc-ddddeeeeffff",
      kind: "class",
      classTitle: `${longTitle}\nWorkshop`,
      startsAt: "2026-08-10T04:00:00.000Z",
      firstName: "Jane",
      lastName: "Smith-With-A-Very-Long-Hyphenated-Surname",
    });
    expect(note.includes("\n")).toBe(false);
    expect(note.length).toBeLessThanOrEqual(BILL_NOTE_MAX_LENGTH);
    expect(note.startsWith("12345678 |")).toBe(true);
    expect(note.endsWith(" ")).toBe(false);
    // Cut landed on a space, so the last character is not mid-token.
    expect(note).not.toMatch(/\s$/);
    const lastToken = note.slice(note.lastIndexOf(" ") + 1);
    expect(lastToken.length).toBeGreaterThan(0);
    expect(longTitle.startsWith(lastToken) || note.includes("|")).toBe(true);
  });
});

describe("classTitleFromLookup", () => {
  it("prefers override, then Category: Type from the class_types lookup", () => {
    expect(
      classTitleFromLookup({
        titleOverride: "Full Moon Sauna",
        storedName: "ignored",
        categoryName: "Wellzone",
        typeName: "Unguided",
      }),
    ).toBe("Full Moon Sauna");
    expect(
      classTitleFromLookup({
        titleOverride: null,
        storedName: "old row name",
        categoryName: "Yoga",
        typeName: "Power",
      }),
    ).toBe("Yoga: Power");
  });
});
