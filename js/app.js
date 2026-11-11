import {
  barScale,
  formatTotal,
  formatUpdated,
  isHighlighted,
  mergeEvents,
  placeTone,
  rankLeaderboard,
  totalUses,
} from "./leaderboard.js";

const METAL = {
  gold: ["#fff6dc", "#f0d48a", "#c4923d", "#7c5a22"],
  silver: ["#ffffff", "#e6e6ee", "#b7b7c2", "#6d6d78"],
  bronze: ["#ffe6cc", "#e2a56c", "#a86b38", "#6b4120"],
};

const stateEl = document.querySelector("#state");
const tableEl = document.querySelector("#table");
const titleEl = document.querySelector("#title");
const boardNameEl = document.querySelector("#board-name");
const footerKickerEl = document.querySelector("#footer-kicker");
const footerTitleEl = document.querySelector("#footer-title");
const metaEl = document.querySelector("#meta");
const noticeEl = document.querySelector("#notice");
const logoEl = document.querySelector("#logo");
const leftImg = document.querySelector("#side-left-img");
const rightImg = document.querySelector("#side-right-img");
const leftFallback = document.querySelector("#side-left-fallback");
const rightFallback = document.querySelector("#side-right-fallback");
const leftAside = document.querySelector(".side-left");
const rightAside = document.querySelector(".side-right");
const liveEl = document.querySelector("#live");

const PUBLIC_EVENT_ID = "black-white-party";

let current = { events: [], config: {}, data: {}, id: PUBLIC_EVENT_ID };

function leafMarkup(x, y, rotation, scale) {
  return `<g transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${rotation.toFixed(2)}) scale(${scale})"><path d="M0 0 C 5.2 -3.2 7.4 -12.4 0 -22 C -7.4 -12.4 -5.2 -3.2 0 0 Z"/><path d="M0 -1.2 C 0.4 -8 0.3 -15 0 -20.5" fill="none" stroke="rgba(0,0,0,0.28)" stroke-width="0.7"/></g>`;
}

function medalMarkup(rank, tone, key) {
  const stops = METAL[tone] || METAL.silver;
  const id = `medal-${tone}-${rank}-${key}`;
  const leaves = [];
  for (const ring of [
    { radius: 15.8, count: 11, scale: 0.7, offset: 0 },
    { radius: 13.2, count: 9, scale: 0.5, offset: 0.34 },
  ]) {
    for (let index = 0; index < ring.count; index += 1) {
      const angle = (index / ring.count) * Math.PI * 2 - Math.PI / 2 + ring.offset;
      const x = 32 + Math.cos(angle) * ring.radius;
      const y = 32 + Math.sin(angle) * ring.radius;
      const rotation = (angle * 180) / Math.PI + 90;
      leaves.push(leafMarkup(x, y, rotation, ring.scale));
    }
  }
  return `<svg class="medal" viewBox="0 0 64 64" aria-hidden="true">
    <defs>
      <linearGradient id="${id}" x1="14" y1="6" x2="50" y2="60" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="${stops[0]}"/>
        <stop offset="42%" stop-color="${stops[1]}"/>
        <stop offset="72%" stop-color="${stops[2]}"/>
        <stop offset="100%" stop-color="${stops[3]}"/>
      </linearGradient>
    </defs>
    <g fill="url(#${id})">${leaves.join("")}</g>
    <text x="32" y="33.5" text-anchor="middle" dominant-baseline="central" font-family="Cinzel, Times New Roman, serif" font-size="15" font-weight="700" fill="url(#${id})">${rank}</text>
  </svg>`;
}

function classifyLines(lines) {
  if (!lines?.length) return [];
  if (lines.length === 1) return [{ text: lines[0], role: "main" }];
  if (lines.length === 2) {
    return [
      { text: lines[0], role: "main" },
      { text: lines[1], role: "tail" },
    ];
  }
  return [
    { text: lines[0], role: "kicker" },
    { text: lines.slice(1, -1).join(" "), role: "main" },
    { text: lines[lines.length - 1], role: "tail" },
  ];
}

function pick(event, key) {
  if (event && event[key] !== undefined && event[key] !== null) return event[key];
  return current.config?.[key];
}

function safeColor(value) {
  const color = String(value || "").trim();
  if (/^[#a-zA-Z0-9(),.%\s-]+$/.test(color)) return color;
  return "";
}

function safeAsset(value) {
  const asset = String(value || "").trim();
  if (!asset) return "";
  if (/^https?:\/\//i.test(asset) || /^[a-zA-Z0-9._~/-]+$/.test(asset)) return asset;
  return "";
}

function cssFamily(name, fallback) {
  const cleaned = String(name || "").replace(/[^a-zA-Z0-9 -]/g, "").trim();
  return cleaned ? `"${cleaned}", ${fallback}` : fallback;
}

function applyTheme(event) {
  const root = document.documentElement;
  const colors = { ...(current.config.colors || {}), ...(event?.colors || {}) };
  const map = {
    background: "--bg",
    silver: "--silver",
    gold: "--gold",
    bronze: "--bronze",
    muted: "--muted",
    table: "--table",
    glow: "--glow",
  };
  for (const [key, variable] of Object.entries(map)) {
    const color = safeColor(colors[key]);
    if (color) root.style.setProperty(variable, color);
  }
  const fonts = current.config.fonts || {};
  root.style.setProperty("--font-display", cssFamily(fonts.display, '"Times New Roman", serif'));
  root.style.setProperty("--font-ui", cssFamily(fonts.ui, "Montserrat, sans-serif"));
  const sheet = safeAsset(fonts.stylesheet);
  const link = document.querySelector("#theme-font");
  if (link && sheet && link.getAttribute("href") !== sheet) link.setAttribute("href", sheet);

  const photo = safeAsset(pick(event, "backgroundImage"));
  document.querySelector(".stage").style.setProperty("--photo", photo ? `url("${photo}")` : "none");

  const hideSides = Boolean(pick(event, "hideSides"));
  leftAside.hidden = hideSides;
  rightAside.hidden = hideSides;
  if (!hideSides) {
    setSide(leftImg, leftFallback, safeAsset(pick(event, "sideLeft")));
    setSide(rightImg, rightFallback, safeAsset(pick(event, "sideRight")));
  }

  const logo = safeAsset(pick(event, "logo"));
  if (logo) {
    logoEl.hidden = false;
    logoEl.src = logo;
  } else {
    logoEl.hidden = true;
    logoEl.removeAttribute("src");
  }
}

function setSide(image, fallback, src) {
  if (!src) {
    image.hidden = true;
    image.removeAttribute("src");
    fallback.hidden = false;
    return;
  }
  if (image.getAttribute("src") !== src) {
    image.onload = () => {
      image.hidden = false;
      fallback.hidden = true;
    };
    image.onerror = () => {
      image.hidden = true;
      fallback.hidden = false;
    };
    image.src = src;
  }
  image.hidden = false;
  fallback.hidden = true;
}

function showState(kind, title, copy) {
  stateEl.hidden = false;
  stateEl.className = `state state-${kind}`;
  stateEl.replaceChildren();
  const heading = document.createElement("p");
  heading.className = "state-title";
  heading.textContent = title;
  const detail = document.createElement("p");
  detail.className = "state-copy";
  detail.textContent = copy;
  stateEl.append(heading, detail);
  tableEl.hidden = true;
}

function renderTitle(event) {
  const lines = event.titleLines?.length ? event.titleLines : [event.title || event.name || "Leaderboard"];
  titleEl.replaceChildren();
  const accessible = document.createElement("span");
  accessible.className = "sr-only";
  accessible.textContent = event.title || lines.join(" ");
  const visual = document.createElement("span");
  visual.className = "title-stack";
  visual.setAttribute("aria-hidden", "true");
  for (const line of classifyLines(lines)) {
    const span = document.createElement("span");
    span.className = `title-line is-${line.role}`;
    span.textContent = line.text;
    visual.append(span);
  }
  titleEl.append(accessible, visual);
}

function renderBoard(event) {
  renderTitle(event);
  boardNameEl.textContent = pick(event, "boardLabel") || "COUPON CODE LEADERBOARD";
  const kicker = pick(event, "footerKicker") || "";
  footerKickerEl.textContent = kicker;
  footerKickerEl.hidden = !kicker;
  footerTitleEl.textContent = pick(event, "footer") || event.title || event.name || "";
  tableEl.setAttribute(
    "aria-label",
    `Coupon code rankings for ${event.shortName || event.name || "this event"}`,
  );
  document.title = `${event.shortName || event.name} · Coupon Leaderboard`;

  noticeEl.hidden = true;
  noticeEl.textContent = "";

  const rows = rankLeaderboard(event.leaderboard);
  const maxRows = Number(pick(event, "maxRows"));
  const visible = Number.isFinite(maxRows) && maxRows > 0 ? rows.slice(0, maxRows) : rows;
  const showBars = pick(event, "showBars") !== false;
  tableEl.classList.toggle("bars-off", !showBars);

  const meta = [];
  if (pick(event, "showTotal") !== false && Array.isArray(event.leaderboard)) {
    const total = formatTotal(totalUses(event.leaderboard));
    if (total) meta.push(total);
  }
  if (pick(event, "showLastUpdated") !== false && current.data.generatedAt) {
    const updated = formatUpdated(current.data.generatedAt, current.config.timezone || "Pacific/Honolulu");
    if (updated) meta.push(updated);
  }
  metaEl.replaceChildren();
  meta.forEach((text, index) => {
    if (index > 0) {
      const dot = document.createElement("span");
      dot.className = "meta-dot";
      dot.setAttribute("aria-hidden", "true");
      dot.textContent = "·";
      metaEl.append(dot);
    }
    const span = document.createElement("span");
    span.textContent = text;
    metaEl.append(span);
  });
  metaEl.hidden = meta.length === 0;

  if (!Array.isArray(event.leaderboard)) {
    showState(
      "soon",
      "Coming soon",
      "Paid ticket totals for this event will appear here after the first coupon is used.",
    );
    liveEl.textContent = `${event.shortName || event.name}. Coming soon.`;
    return;
  }
  if (!visible.length) {
    showState("soon", "No coupons yet", "Paid orders with a coupon code will show up on this board.");
    liveEl.textContent = `${event.shortName || event.name}. No coupon uses yet.`;
    return;
  }

  stateEl.hidden = true;
  tableEl.hidden = false;
  const body = tableEl.querySelector("tbody");
  body.replaceChildren();
  const leaderUses = visible[0]?.uses || rows[0]?.uses || 1;
  for (const row of visible) {
    const tone = placeTone(row.rank);
    const tr = document.createElement("tr");
    tr.className = isHighlighted(row.rank) ? `place place-${row.rank} tone-${tone}` : `tone-${tone}`;
    tr.dataset.rank = String(row.rank);
    tr.dataset.code = row.code;

    const rankCell = document.createElement("td");
    rankCell.className = "rank";
    rankCell.setAttribute("aria-label", `Rank ${row.rank}`);
    const medalKey = row.code.replace(/[^a-zA-Z0-9]/g, "") || "code";
    rankCell.innerHTML = medalMarkup(row.rank, tone, medalKey);

    const codeCell = document.createElement("td");
    codeCell.className = "code";
    const pill = document.createElement("span");
    pill.className = "pill";
    pill.textContent = row.code;
    pill.translate = false;
    codeCell.append(pill);

    const timesCell = document.createElement("td");
    timesCell.className = "times";
    const inner = document.createElement("div");
    inner.className = "times-inner";
    const count = document.createElement("span");
    count.className = "count";
    count.textContent = new Intl.NumberFormat("en-US").format(row.uses);
    const meter = document.createElement("span");
    meter.className = "meter";
    meter.setAttribute("aria-hidden", "true");
    const fill = document.createElement("span");
    const scale = barScale(row.uses, leaderUses);
    fill.style.width = `${scale * 100}%`;
    meter.append(fill);
    inner.append(count, meter);
    timesCell.append(inner);

    tr.append(rankCell, codeCell, timesCell);
    body.append(tr);
  }

  const leader = visible[0];
  liveEl.textContent = `${event.shortName || event.name}. ${leader.code} leads with ${leader.uses} ${leader.uses === 1 ? "use" : "uses"}.`;
}

function render() {
  const event = current.events.find((item) => item.id === PUBLIC_EVENT_ID);
  if (!event) {
    applyTheme(null);
    showState(
      "soon",
      "Coming soon",
      "The Black & White Party board will appear here when it has something to rank.",
    );
    return;
  }
  current.id = event.id;
  applyTheme(event);
  renderBoard(event);
}

async function loadJson(path, cacheBust = false) {
  const url = cacheBust ? `${path}?t=${Date.now()}` : path;
  const response = await fetch(url, { cache: cacheBust ? "no-store" : "no-cache" });
  if (!response.ok) throw new Error(path);
  return response.json();
}

async function main() {
  try {
    const [config, data] = await Promise.all([
      loadJson("config.json"),
      loadJson("data.json", true),
    ]);
    current = { config, data, events: mergeEvents(config, data), id: PUBLIC_EVENT_ID };
    render();
  } catch {
    showState(
      "error",
      "The board is unavailable",
      "Refresh the page in a moment. The latest totals could not be loaded.",
    );
  }
}

main();
