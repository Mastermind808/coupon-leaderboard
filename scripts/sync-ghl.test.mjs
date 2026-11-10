import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregateOrders,
  buildDataFile,
  couponCodeOf,
  fetchAllOrders,
  formatGeneratedAt,
  isPaidOrder,
  ordersUrl,
} from "./sync-ghl.mjs";

const config = {
  timezone: "Pacific/Honolulu",
  includeDiscoveredEvents: true,
  sourceTypes: ["events_management"],
  events: [
    {
      id: "black-white-party",
      name: "The Black & White Party",
      sourceIds: ["src-bwp"],
      sourceNames: ["The Black & White Party"],
      productId: "prod-bwp",
    },
    {
      id: "havana-after-dark",
      name: "Havana After Dark - Ilikai Hotel (Fri Nov 20, 2026)",
      sourceNames: ["Havana After Dark - Ilikai Hotel (Fri Nov 20, 2026)"],
      productId: "prod-havana",
    },
    {
      id: "quiet-night",
      name: "Quiet Night",
      hidden: true,
      sourceIds: ["src-quiet"],
    },
  ],
};

function order(overrides) {
  return {
    _id: overrides._id,
    status: "completed",
    paymentStatus: "paid",
    sourceType: "events_management",
    sourceId: "src-bwp",
    sourceName: "The Black & White Party",
    couponCode: "BWP",
    contactName: "Should Not Appear",
    contactEmail: "secret@example.com",
    coupon: { code: "IGNORED", usageCount: 9000 },
    ...overrides,
  };
}

test("keeps paid and completed event orders and drops everything else", () => {
  assert.equal(isPaidOrder({ status: "completed" }), true);
  assert.equal(isPaidOrder({ status: "paid" }), true);
  assert.equal(isPaidOrder({ status: "pending", paymentStatus: "paid" }), true);
  assert.equal(isPaidOrder({ status: "completed", paymentStatus: "refunded" }), false);
  assert.equal(isPaidOrder({ status: "completed", paymentStatus: "partially_paid" }), false);
  assert.equal(isPaidOrder({ status: "unpaid" }), false);
  assert.equal(isPaidOrder({ paymentStatus: "unpaid" }), false);
});

test("reads the order coupon code and ignores the global usage count", () => {
  assert.equal(couponCodeOf({ couponCode: "bwp", coupon: { code: "OTHER", usageCount: 50 } }), "BWP");
  assert.equal(couponCodeOf({ coupon: { code: "levi", usageCount: 50 } }), "LEVI");
  assert.equal(couponCodeOf({ coupon: { usageCount: 50 } }), "");
});

test("counts one use per paid order, per event, and never writes buyer details", () => {
  const events = aggregateOrders(
    [
      order({ _id: "1", couponCode: "bwp" }),
      order({ _id: "2", couponCode: "BWP" }),
      order({ _id: "3", couponCode: "connor" }),
      order({ _id: "4", couponCode: "CONNOR" }),
      order({ _id: "5", sourceId: "src-bwp-late", sourceName: "The Black & White Party", couponCode: "MEIGEN" }),
      order({ _id: "6", couponCode: "" }),
      order({ _id: "7", sourceType: "funnel", couponCode: "FUNNEL" }),
      order({ _id: "8", status: "refunded", couponCode: "BWP" }),
      order({ _id: "9", sourceId: "src-quiet", sourceName: "Quiet Night", couponCode: "QUIET" }),
      order({ _id: "10", sourceId: "src-new", sourceName: "Rooftop Session", couponCode: "ROOF" }),
      order({ _id: "11", sourceId: "src-new", sourceName: "Rooftop Session", couponCode: "" }),
      order({
        _id: "12",
        sourceId: "src-havana",
        sourceName: "Havana After Dark - Ilikai Hotel (Fri Nov 20, 2026)",
        couponCode: "",
      }),
    ],
    config,
  );

  const blackAndWhite = events.find((event) => event.id === "black-white-party");
  assert.deepEqual(blackAndWhite.leaderboard, [
    { code: "BWP", uses: 2 },
    { code: "CONNOR", uses: 2 },
    { code: "MEIGEN", uses: 1 },
  ]);
  assert.equal(blackAndWhite.totalTickets, 5);
  assert.equal(blackAndWhite.productId, "prod-bwp");
  assert.ok(blackAndWhite.orderSourceIds.includes("src-bwp"));
  assert.ok(blackAndWhite.orderSourceIds.includes("src-bwp-late"));

  const havana = events.find((event) => event.id === "havana-after-dark");
  assert.equal(havana.leaderboard, null);
  assert.equal(havana.totalTickets, null);

  assert.equal(events.some((event) => event.id === "quiet-night"), false);
  assert.equal(events.some((event) => event.leaderboard?.some((row) => row.code === "QUIET")), false);

  const discovered = events.find((event) => event.id === "rooftop-session");
  assert.equal(discovered.leaderboard[0].code, "ROOF");
  assert.equal(discovered.leaderboard[0].uses, 1);

  const payload = buildDataFile({
    config,
    orders: [order({ _id: "1" })],
    generatedAt: "2026-11-10T02:26:00-10:00",
    locationId: "LFGGW386YaVHK0GGieC7",
  });
  const serialized = JSON.stringify(payload);
  assert.equal(serialized.includes("secret@example.com"), false);
  assert.equal(serialized.includes("Should Not Appear"), false);
  assert.equal(serialized.includes("usageCount"), false);
  assert.equal(serialized.includes("contactEmail"), false);
  assert.equal(payload.source, "gohighlevel");
});

test("formats generatedAt in Hawaii time", () => {
  assert.equal(formatGeneratedAt(new Date("2026-11-10T12:26:00Z"), "Pacific/Honolulu"), "2026-11-10T02:26:00-10:00");
});

test("pages through orders, retries a rejected altType query, and dedupes ids", async () => {
  const pages = {
    0: [order({ _id: "a" }), order({ _id: "b", couponCode: "LEVI" })],
    2: [order({ _id: "b", couponCode: "LEVI" }), order({ _id: "c", couponCode: "MEIGEN" })],
  };
  const calls = [];
  let rejectedAltType = false;
  const fetchImpl = async (url) => {
    const parsed = new URL(url);
    calls.push(parsed.search);
    const offset = Number(parsed.searchParams.get("offset"));
    if (!rejectedAltType && parsed.searchParams.get("altType")) {
      rejectedAltType = true;
      return {
        ok: false,
        status: 422,
        async text() {
          return JSON.stringify({ message: "unexpected altType for secret@example.com" });
        },
      };
    }
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({ data: pages[offset] || [], totalCount: 3 });
      },
    };
  };

  const result = await fetchAllOrders({
    apiKey: "test-key",
    locationId: "LFGGW386YaVHK0GGieC7",
    fetchImpl,
    sleep: async () => {},
    pageLimit: 2,
  });

  assert.deepEqual(result.orders.map((row) => row._id), ["a", "b", "c"]);
  assert.match(result.variantNote, /altType query was rejected/);
  assert.equal(calls.some((query) => query.includes("altType=location")), true);
  assert.equal(calls.some((query) => query.includes("altId=LFGGW386YaVHK0GGieC7") && !query.includes("altType=")), true);
  assert.match(ordersUrl("loc", 0, 100, "full").search, /altType=location/);
});

test("retries a rate limit and then reads the page", async () => {
  let attempts = 0;
  const fetchImpl = async () => {
    attempts += 1;
    if (attempts === 1) {
      return { ok: false, status: 429, async text() { return JSON.stringify({ message: "slow down" }); } };
    }
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({ data: [order({ _id: "only" })], totalCount: 1 });
      },
    };
  };
  const result = await fetchAllOrders({
    apiKey: "test-key",
    locationId: "loc",
    fetchImpl,
    sleep: async () => {},
    pageLimit: 10,
  });
  assert.equal(result.orders.length, 1);
  assert.equal(attempts, 2);
});
