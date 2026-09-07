import { describe, expect, it } from "vitest";
import { addDays, dayInfo, dayNumber, daysBetween, weekdayOf, weekNumber, weekStart } from "../src/domain/time.js";

const START = "2026-09-14"; // a Monday

describe("time", () => {
  it("computes week numbers with week 1 starting on START_DATE", () => {
    expect(weekNumber(START, "2026-09-07")).toBe(0);
    expect(weekNumber(START, "2026-09-13")).toBe(0);
    expect(weekNumber(START, "2026-09-14")).toBe(1);
    expect(weekNumber(START, "2026-09-20")).toBe(1); // Sunday belongs to week 1
    expect(weekNumber(START, "2026-09-21")).toBe(2);
    expect(weekNumber(START, "2026-11-08")).toBe(8);
  });

  it("computes day numbers", () => {
    expect(dayNumber(START, "2026-09-13")).toBe(0);
    expect(dayNumber(START, "2026-09-14")).toBe(1);
    expect(dayNumber(START, "2026-09-21")).toBe(8);
  });

  it("does date arithmetic without a library", () => {
    expect(daysBetween("2026-09-14", "2026-09-21")).toBe(7);
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(weekdayOf("2026-09-14")).toBe(1);
    expect(weekdayOf("2026-09-20")).toBe(0);
    expect(weekStart(START, 3)).toBe("2026-09-28");
  });

  it("resolves today in a timezone", () => {
    // 2026-09-14T20:30Z is already the 15th in Karachi (UTC+5)
    const d = dayInfo("Asia/Karachi", new Date("2026-09-14T20:30:00Z"));
    expect(d.date).toBe("2026-09-15");
    expect(d.weekday).toBe(2);
    expect(d.weekdayName).toBe("Tue");
  });
});
