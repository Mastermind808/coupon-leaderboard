/** Pure ranking and formatting helpers. No DOM, no network. */

export function formatCount(value) {
  return new Intl.NumberFormat("en-US").format(Number(value) || 0);
}

export function formatTotal(total) {
  if (total == null || total === "") return "";
  const count = Number(total);
  if (!Number.isFinite(count)) return "";
  const label = count === 1 ? "TOTAL TICKET" : "TOTAL TICKETS";
  return `${formatCount(count)} ${label}`;
}

export function formatUpdated(iso, timeZone = "Pacific/Honolulu") {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
  let text = formatted
    .replace(/[\u00a0\u202f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
    .replace(/GMT[\u2212-]10(?::00)?/g, "HST");
  if (!text.includes("HST")) text = `${text} HST`;
  return `UPDATED ${text}`;
}

/**
 * Dense rank: equal counts share a rank, the next count is the next number.
 * Equal counts are ordered by coupon code A–Z.
 */
export function rankLeaderboard(entries) {
  const rows = (entries || [])
    .filter((entry) => entry && String(entry.code || "").trim() && Number(entry.uses) >= 1)
    .map((entry) => ({
      code: String(entry.code).trim().replace(/\s+/g, " ").toUpperCase(),
      uses: Number(entry.uses),
    }));
  rows.sort((a, b) => b.uses - a.uses || a.code.localeCompare(b.code));
  let rank = 0;
  let lastUses = null;
  return rows.map((row) => {
    if (row.uses !== lastUses) {
      rank += 1;
      lastUses = row.uses;
    }
    return { ...row, rank };
  });
}

export function barScale(uses, leaderUses) {
  const max = Number(leaderUses) || 0;
  if (max <= 0) return 0;
  return Math.max(0, Math.min(1, Number(uses) / max));
}

export function placeTone(rank) {
  if (rank === 1) return "gold";
  if (rank === 2) return "silver";
  if (rank === 3) return "bronze";
  return "silver";
}

export function isHighlighted(rank) {
  return rank >= 1 && rank <= 3;
}

export function totalUses(entries) {
  if (!Array.isArray(entries)) return null;
  return entries.reduce((sum, entry) => sum + (Number(entry?.uses) || 0), 0);
}

export function eventIdFromLocation(pathname, search) {
  const rawSearch = String(search || "");
  const params = new URLSearchParams(rawSearch.startsWith("?") || rawSearch === "" ? rawSearch : `?${rawSearch}`);
  const query = params.get("event");
  if (query && query.trim()) {
    try {
      return decodeURIComponent(query.trim());
    } catch {
      return query.trim();
    }
  }
  const path = String(pathname || "");
  if (path.endsWith("/")) return "";
  const parts = path.split("/").filter(Boolean);
  const last = parts[parts.length - 1] || "";
  if (!last || last.includes(".")) return "";
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

export function resolveEventId(events, requested, defaultId) {
  const ids = new Set((events || []).map((event) => event.id));
  if (requested && ids.has(requested)) return { id: requested, unknown: false };
  const fallback = defaultId && ids.has(defaultId) ? defaultId : events?.[0]?.id || "";
  return { id: fallback, unknown: Boolean(requested) && !ids.has(requested) };
}

function presentEvent(configEvent, dataEvent) {
  const name = configEvent.name || dataEvent?.name || configEvent.id;
  return {
    id: configEvent.id,
    name,
    shortName: configEvent.shortName || name,
    title: configEvent.title || name,
    titleLines: configEvent.titleLines || null,
    subtitle: configEvent.subtitle,
    footer: configEvent.footer,
    footerKicker: configEvent.footerKicker,
    boardLabel: configEvent.boardLabel,
    leaderboard: dataEvent ? (dataEvent.leaderboard ?? null) : null,
    maxRows: configEvent.maxRows,
    showBars: configEvent.showBars,
    showTotal: configEvent.showTotal,
    showLastUpdated: configEvent.showLastUpdated,
    backgroundImage: configEvent.backgroundImage,
    logo: configEvent.logo,
    sideLeft: configEvent.sideLeft,
    sideRight: configEvent.sideRight,
    hideSides: configEvent.hideSides,
    colors: configEvent.colors || null,
  };
}

export function mergeEvents(config, data) {
  const byId = new Map((data?.events || []).filter((event) => event?.id).map((event) => [event.id, event]));
  const merged = [];
  const seen = new Set();
  for (const configEvent of config?.events || []) {
    if (!configEvent?.id) continue;
    seen.add(configEvent.id);
    if (configEvent.hidden) continue;
    merged.push(presentEvent(configEvent, byId.get(configEvent.id)));
  }
  if (config?.includeDiscoveredEvents !== false) {
    const extras = (data?.events || [])
      .filter((event) => event?.id && !seen.has(event.id))
      .sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id)));
    for (const event of extras) {
      merged.push({
        id: event.id,
        name: event.name || event.id,
        shortName: event.name || event.id,
        title: event.name || event.id,
        titleLines: null,
        leaderboard: event.leaderboard ?? null,
      });
    }
  }
  return merged;
}
