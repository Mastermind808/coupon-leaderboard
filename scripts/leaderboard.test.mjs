import assert from "node:assert/strict";
import test from "node:test";
import {
  barScale,
  eventIdFromLocation,
  formatTotal,
  formatUpdated,
  mergeEvents,
  rankLeaderboard,
  resolveEventId,
  totalUses,
} from "../js/leaderboard.js";

test("ranks by uses, shares dense rank, and breaks ties A to Z", () => {
  const ranked = rankLeaderboard([
    { code: "zeta", uses: 2 },
    { code: "CONNOR", uses: 3 },
    { code: "bwp", uses: 3 },
    { code: "LEVI", uses: 1 },
    { code: "ZERO", uses: 0 },
    { code: "  ", uses: 4 },
  ]);
  assert.deepEqual(
    ranked.map((row) => [row.rank, row.code, row.uses]),
    [
      [1, "BWP", 3],
      [1, "CONNOR", 3],
      [2, "ZETA", 2],
      [3, "LEVI", 1],
    ],
  );
});

test("scales bars to the leader", () => {
  assert.equal(barScale(17, 17), 1);
  assert.equal(barScale(1, 17), 1 / 17);
  assert.equal(barScale(5, 0), 0);
});

test("formats the Hawaii timestamp and ticket total", () => {
  const stamp = formatUpdated("2026-11-10T02:26:00-10:00");
  assert.match(stamp, /^UPDATED NOV 10, 2026, 2:26 AM HST$/);
  assert.equal(formatTotal(23), "23 TOTAL TICKETS");
  assert.equal(formatTotal(1), "1 TOTAL TICKET");
  assert.equal(formatTotal(null), "");
  assert.equal(totalUses([{ uses: 17 }, { uses: 3 }, { uses: 2 }, { uses: 1 }]), 23);
  assert.equal(totalUses(null), null);
});

test("reads the event from the query string before the path", () => {
  assert.equal(eventIdFromLocation("/repo/index.html", "?event=pool-10-11"), "pool-10-11");
  assert.equal(eventIdFromLocation("/repo/costume-party", ""), "costume-party");
  assert.equal(eventIdFromLocation("/repo/", ""), "");
  assert.equal(eventIdFromLocation("/", ""), "");
});

test("falls back when the requested event is unknown", () => {
  const events = [{ id: "black-white-party" }, { id: "costume-party" }];
  assert.deepEqual(resolveEventId(events, "costume-party", "black-white-party"), {
    id: "costume-party",
    unknown: false,
  });
  assert.deepEqual(resolveEventId(events, "missing", "black-white-party"), {
    id: "black-white-party",
    unknown: true,
  });
  assert.deepEqual(resolveEventId(events, "", "black-white-party"), {
    id: "black-white-party",
    unknown: false,
  });
});

test("merges config presentation with data counts and keeps discovery behind configured events", () => {
  const merged = mergeEvents(
    {
      includeDiscoveredEvents: true,
      events: [
        { id: "black-white-party", shortName: "Black & White", titleLines: ["THE", "PARTY"], hidden: false },
        { id: "hidden-night", hidden: true, name: "Hidden" },
        { id: "havana-after-dark", name: "Havana After Dark" },
      ],
    },
    {
      events: [
        { id: "black-white-party", leaderboard: [{ code: "BWP", uses: 17 }] },
        { id: "hidden-night", leaderboard: [{ code: "SECRET", uses: 9 }] },
        { id: "havana-after-dark", leaderboard: null },
        { id: "new-years", name: "New Years", leaderboard: [{ code: "NYE", uses: 4 }] },
      ],
    },
  );
  assert.deepEqual(
    merged.map((event) => event.id),
    ["black-white-party", "havana-after-dark", "new-years"],
  );
  assert.equal(merged[0].shortName, "Black & White");
  assert.deepEqual(merged[0].titleLines, ["THE", "PARTY"]);
  assert.deepEqual(merged[0].leaderboard, [{ code: "BWP", uses: 17 }]);
  assert.equal(merged[1].leaderboard, null);
  assert.equal(merged[2].shortName, "New Years");
});
