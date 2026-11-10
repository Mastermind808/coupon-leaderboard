#!/usr/bin/env node
/**
 * Rebuild data.json from the GoHighLevel Payments API.
 *
 * GET https://services.leadconnectorhq.com/payments/orders
 *   ?altId=<locationId>&altType=location&limit=&offset=
 * Headers: Authorization: Bearer $GHL_API_KEY, Version: 2021-07-28, Accept: application/json
 *
 * Public reference:
 * https://marketplace.gohighlevel.com/docs/ghl/payments/list-orders/index.html
 *
 * Each paid/completed events_management order counts once for its couponCode.
 * Coupon.usageCount is global across events and is ignored.
 * Contact names, emails, and other buyer fields are never written.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ORDERS_URL = "https://services.leadconnectorhq.com/payments/orders";
const API_VERSION = "2021-07-28";
const DEFAULT_LOCATION_ID = "LFGGW386YaVHK0GGieC7";

const PAID_ORDER_STATUSES = new Set(["paid", "completed"]);
const BLOCKED_ORDER_STATUSES = new Set([
  "unpaid",
  "refunded",
  "partially_refunded",
  "void",
  "cancelled",
  "canceled",
  "failed",
]);
const BLOCKED_PAYMENT_STATUSES = new Set([
  "unpaid",
  "refunded",
  "partially_paid",
  "partially_refunded",
]);
const PERSONAL_KEY = /email|phone|contact|address|firstname|first_name|lastname|last_name|fullname|full_name/i;

export function normalizeToken(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

export function isPaidOrder(order) {
  if (!order || typeof order !== "object") return false;
  const status = normalizeToken(order.status);
  const payment = normalizeToken(order.paymentStatus ?? order.payment_status);
  if (BLOCKED_ORDER_STATUSES.has(status)) return false;
  if (payment && BLOCKED_PAYMENT_STATUSES.has(payment)) return false;
  if (PAID_ORDER_STATUSES.has(status)) return true;
  return payment === "paid";
}

export function isEventOrder(order, sourceTypes = ["events_management"]) {
  const allowed = new Set((sourceTypes || []).map((type) => normalizeToken(type)));
  const sourceType = normalizeToken(order?.sourceType ?? order?.source_type);
  return Boolean(sourceType) && allowed.has(sourceType);
}

function cleanCode(value) {
  if (value == null) return "";
  return String(value).trim().replace(/\s+/g, " ").toUpperCase();
}

/**
 * Order-level coupon code only. An empty couponCode stays empty.
 * coupon.code is a fallback when the flat field is missing.
 * coupon.usageCount is never read.
 */
export function couponCodeOf(order) {
  if (!order || typeof order !== "object") return "";
  if ("couponCode" in order || "coupon_code" in order) {
    return cleanCode(order.couponCode ?? order.coupon_code);
  }
  return cleanCode(order.coupon?.code);
}

export function slugify(name) {
  const slug = String(name || "event")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "event";
}

function unique(values) {
  const out = [];
  const seen = new Set();
  for (const value of values) {
    if (value == null || value === "") continue;
    const key = String(value);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

function leaderboardFromCodes(codes) {
  return [...codes.entries()]
    .filter(([, uses]) => uses >= 1)
    .map(([code, uses]) => ({ code, uses }))
    .sort((a, b) => b.uses - a.uses || a.code.localeCompare(b.code));
}

function bucketKey(order) {
  const sourceId = String(order.sourceId ?? order.source_id ?? "").trim();
  if (sourceId) return `id:${sourceId}`;
  const sourceName = String(order.sourceName ?? order.source_name ?? "").trim();
  if (sourceName) return `name:${sourceName.toLowerCase()}`;
  return "";
}

function eventNames(configEvent) {
  return [configEvent.name, ...(configEvent.sourceNames || [])]
    .filter(Boolean)
    .map((name) => name.trim().toLowerCase());
}

function matchesEvent(configEvent, bucket) {
  const ids = new Set((configEvent.sourceIds || []).map((id) => String(id)));
  if (bucket.sourceId && ids.has(String(bucket.sourceId))) return true;
  const bucketName = (bucket.sourceName || "").trim().toLowerCase();
  return Boolean(bucketName) && eventNames(configEvent).includes(bucketName);
}

export function aggregateOrders(orders, config = {}) {
  const sourceTypes = config.sourceTypes?.length ? config.sourceTypes : ["events_management"];
  const excludeTest = Boolean(config.excludeTestOrders);
  const buckets = new Map();

  for (const order of orders || []) {
    if (!isPaidOrder(order) || !isEventOrder(order, sourceTypes)) continue;
    if (excludeTest && order.liveMode === false) continue;
    const key = bucketKey(order);
    if (!key) continue;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        key,
        sourceId: String(order.sourceId ?? order.source_id ?? "").trim() || null,
        sourceName: String(order.sourceName ?? order.source_name ?? "").trim() || null,
        codes: new Map(),
      };
      buckets.set(key, bucket);
    } else if (!bucket.sourceName) {
      const sourceName = String(order.sourceName ?? order.source_name ?? "").trim();
      if (sourceName) bucket.sourceName = sourceName;
    }
    const code = couponCodeOf(order);
    if (!code) continue;
    bucket.codes.set(code, (bucket.codes.get(code) || 0) + 1);
  }

  const bucketList = [...buckets.values()];
  const claimed = new Set();
  const events = [];

  for (const configEvent of config.events || []) {
    if (!configEvent?.id) continue;
    const matched = bucketList.filter((bucket) => matchesEvent(configEvent, bucket));
    for (const bucket of matched) claimed.add(bucket.key);
    if (configEvent.hidden) continue;
    const codes = new Map();
    for (const bucket of matched) {
      for (const [code, uses] of bucket.codes) {
        codes.set(code, (codes.get(code) || 0) + uses);
      }
    }
    const leaderboard = leaderboardFromCodes(codes);
    const sourceIds = unique([
      ...(configEvent.sourceIds || []),
      ...matched.map((bucket) => bucket.sourceId),
    ]);
    const totalTickets = leaderboard.reduce((sum, row) => sum + row.uses, 0);
    events.push({
      id: configEvent.id,
      name: configEvent.name || matched.find((bucket) => bucket.sourceName)?.sourceName || configEvent.id,
      orderSourceId: sourceIds[0] || null,
      orderSourceIds: sourceIds,
      productId: configEvent.productId || null,
      leaderboard: leaderboard.length ? leaderboard : null,
      totalTickets: leaderboard.length ? totalTickets : null,
    });
  }

  if (config.includeDiscoveredEvents !== false) {
    const usedIds = new Set([
      ...events.map((event) => event.id),
      ...(config.events || []).map((event) => event?.id).filter(Boolean),
    ]);
    const discovered = [];
    for (const bucket of bucketList) {
      if (claimed.has(bucket.key)) continue;
      const base = slugify(bucket.sourceName || bucket.sourceId || "event");
      let id = base;
      let suffix = 2;
      while (usedIds.has(id)) id = `${base}-${suffix++}`;
      usedIds.add(id);
      const leaderboard = leaderboardFromCodes(bucket.codes);
      const totalTickets = leaderboard.reduce((sum, row) => sum + row.uses, 0);
      discovered.push({
        id,
        name: bucket.sourceName || bucket.sourceId || id,
        orderSourceId: bucket.sourceId,
        orderSourceIds: bucket.sourceId ? [bucket.sourceId] : [],
        productId: null,
        leaderboard: leaderboard.length ? leaderboard : null,
        totalTickets: leaderboard.length ? totalTickets : null,
      });
    }
    discovered.sort((a, b) => a.name.localeCompare(b.name));
    events.push(...discovered);
  }

  return events;
}

export function assertNoPersonalData(value, trail = "data") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoPersonalData(item, `${trail}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (PERSONAL_KEY.test(key)) {
      throw new Error(`Refusing to write personal data field ${trail}.${key}`);
    }
    assertNoPersonalData(child, `${trail}.${key}`);
  }
}

export function buildDataFile({ config, orders, generatedAt, locationId }) {
  const payload = {
    version: 1,
    generatedAt,
    timezone: config.timezone || "Pacific/Honolulu",
    locationId,
    source: "gohighlevel",
    events: aggregateOrders(orders, config),
  };
  assertNoPersonalData(payload);
  return payload;
}

function offsetFor(date, timeZone) {
  try {
    const name = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "longOffset",
    })
      .formatToParts(date)
      .find((part) => part.type === "timeZoneName")?.value;
    const match = String(name || "").match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/i);
    if (!match) return "Z";
    const hours = match[2].padStart(2, "0");
    const minutes = (match[3] || "00").padStart(2, "0");
    if (hours === "00" && minutes === "00" && match[1] === "+") return "Z";
    return `${match[1]}${hours}:${minutes}`;
  } catch {
    return "Z";
  }
}

export function formatGeneratedAt(date = new Date(), timeZone = "Pacific/Honolulu") {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date);
    const get = (type) => parts.find((part) => part.type === type)?.value || "";
    const year = get("year");
    const month = get("month").padStart(2, "0");
    const day = get("day").padStart(2, "0");
    const hour = get("hour").padStart(2, "0");
    const minute = get("minute").padStart(2, "0");
    const second = get("second").padStart(2, "0");
    if (!year) throw new Error("missing date");
    return `${year}-${month}-${day}T${hour}:${minute}:${second}${offsetFor(date, timeZone)}`;
  } catch {
    return date.toISOString();
  }
}

function pageRows(body) {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body?.orders)) return body.orders;
  return [];
}

function pageTotal(body) {
  const value = body?.totalCount ?? body?.total ?? body?.meta?.total;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function ordersUrl(locationId, offset, limit, variant) {
  const url = new URL(ORDERS_URL);
  url.searchParams.set("altId", locationId);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("offset", String(offset));
  if (variant === "full") {
    url.searchParams.set("altType", "location");
    url.searchParams.set("locationId", locationId);
  }
  return url;
}

export function scrub(text) {
  return String(text || "")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted]")
    .slice(0, 240);
}

function errorDetail(error) {
  const message = error?.body?.message || error?.body?.error || "";
  const text = Array.isArray(message) ? message.join("; ") : message;
  const status = error?.status ? ` (${error.status})` : "";
  const detail = scrub(text);
  return `GoHighLevel orders request failed${status}${detail ? `: ${detail}` : ""}`;
}

async function getJson(url, apiKey, fetchImpl) {
  const response = await fetchImpl(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Version: API_VERSION,
      Accept: "application/json",
    },
  });
  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { message: scrub(text) };
    }
  }
  if (!response.ok) {
    const error = new Error("GoHighLevel orders request failed");
    error.status = response.status;
    const message = body && typeof body === "object" ? body.message || body.error || "" : "";
    error.body = { message };
    throw error;
  }
  return body;
}

async function requestWithRetry(url, apiKey, fetchImpl, sleep) {
  let lastError;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await getJson(url, apiKey, fetchImpl);
    } catch (error) {
      lastError = error;
      const status = error.status;
      const retryable = !status || status === 429 || status >= 500;
      if (!retryable || attempt === 3) throw error;
      await sleep(200 * (attempt + 1));
    }
  }
  throw lastError;
}

export async function fetchAllOrders({
  apiKey,
  locationId,
  fetchImpl = globalThis.fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  pageLimit = 100,
  maxOrders = 20000,
} = {}) {
  if (!apiKey) throw new Error("GHL_API_KEY is not set.");
  if (!locationId) throw new Error("Location id is missing. Set locationId in config.json.");

  const collected = [];
  const seen = new Set();
  let offset = 0;
  let variant = "full";
  let variantNote = "altId, altType=location, locationId";
  let lastTotal = null;
  let capped = false;

  while (collected.length < maxOrders) {
    let body;
    try {
      body = await requestWithRetry(ordersUrl(locationId, offset, pageLimit, variant), apiKey, fetchImpl, sleep);
    } catch (error) {
      if (offset === 0 && variant === "full" && (error.status === 400 || error.status === 422)) {
        variant = "documented";
        variantNote = "altId only, after the altType query was rejected";
        try {
          body = await requestWithRetry(
            ordersUrl(locationId, offset, pageLimit, variant),
            apiKey,
            fetchImpl,
            sleep,
          );
        } catch (retryError) {
          throw new Error(errorDetail(retryError));
        }
      } else {
        throw new Error(errorDetail(error));
      }
    }

    const rows = pageRows(body);
    if (!rows.length) break;
    lastTotal = pageTotal(body);
    let added = 0;
    for (const row of rows) {
      const id = row && (row._id || row.id);
      if (id) {
        if (seen.has(id)) continue;
        seen.add(id);
      }
      collected.push(row);
      added += 1;
      if (collected.length >= maxOrders) {
        capped = true;
        break;
      }
    }
    if (added === 0) break;
    offset += rows.length;
    if (rows.length < pageLimit) break;
    if (lastTotal != null && offset >= lastTotal) break;
    if (capped) break;
  }

  if (capped && !(lastTotal != null && collected.length >= lastTotal)) {
    throw new Error(`Stopped after ${maxOrders} orders so a runaway page loop cannot hide a partial board.`);
  }

  return { orders: collected, variantNote };
}

export async function syncLeaderboard({
  root = ROOT,
  apiKey = process.env.GHL_API_KEY,
  fetchImpl,
  sleep,
  dryRun = false,
  now = new Date(),
} = {}) {
  if (!apiKey) {
    throw new Error("GHL_API_KEY is not set. data.json was not changed.");
  }
  const configPath = path.join(root, "config.json");
  const dataPath = path.join(root, "data.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const locationId = process.env.GHL_LOCATION_ID || config.locationId || DEFAULT_LOCATION_ID;
  const { orders, variantNote } = await fetchAllOrders({
    apiKey,
    locationId,
    fetchImpl,
    sleep,
  });
  const payload = buildDataFile({
    config,
    orders,
    generatedAt: formatGeneratedAt(now, config.timezone || "Pacific/Honolulu"),
    locationId,
  });
  const json = `${JSON.stringify(payload, null, 2)}\n`;
  if (!dryRun) {
    const temporary = `${dataPath}.tmp`;
    fs.writeFileSync(temporary, json);
    fs.renameSync(temporary, dataPath);
  }
  return { payload, ordersRead: orders.length, variantNote, wrote: !dryRun, dataPath };
}

function isMain() {
  const entry = process.argv[1];
  if (!entry) return false;
  return path.resolve(entry) === fileURLToPath(import.meta.url);
}

if (isMain()) {
  const dryRun = process.argv.includes("--dry-run");
  syncLeaderboard({ dryRun })
    .then((result) => {
      console.log(`Read ${result.ordersRead} orders (${result.variantNote}).`);
      for (const event of result.payload.events) {
        const codes = event.leaderboard?.length || 0;
        const total = event.totalTickets ?? 0;
        const useLabel = total === 1 ? "use" : "uses";
        const codeLabel = codes === 1 ? "code" : "codes";
        console.log(`${event.id}: ${total} paid coupon ${useLabel} across ${codes} ${codeLabel}`);
      }
      console.log(dryRun ? "Dry run: data.json was not written." : `Wrote ${result.dataPath}`);
    })
    .catch((error) => {
      console.error(scrub(error?.message || error));
      process.exitCode = 1;
    });
}
