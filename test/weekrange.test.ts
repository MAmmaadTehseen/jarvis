import { describe, expect, it } from "vitest";

process.env.DISCORD_APP_ID = "1";
process.env.DISCORD_PUBLIC_KEY = "ab".repeat(32);
process.env.DISCORD_BOT_TOKEN = "t";
process.env.LOCAL_CRON = "false";
process.env.START_DATE = "2026-09-14";

const { weekRange } = await import("../src/service.js");

describe("weekRange", () => {
  it("spans Monday to Sunday of the given week", () => {
    expect(weekRange(1)).toBe("14 Sep - 20 Sep 2026");
    expect(weekRange(2)).toBe("21 Sep - 27 Sep 2026");
  });

  it("crosses month and year boundaries", () => {
    expect(weekRange(3)).toBe("28 Sep - 4 Oct 2026");
    expect(weekRange(16)).toBe("28 Dec - 3 Jan 2027");
  });
});
