import { selectedEvents } from "./events.js";
import { countWord, formatBandPercent, formatBound, formatScore } from "./format.js";
import { drawMatrix, strongestMarks, weakestMarks } from "./heat.js";
import { getLang, onLangChange, t } from "./i18n.js";
import { heroLabel, rememberHeroes } from "./names.js";
import { closeMenu, closePicker, openMenu, replaceTarget } from "./picker.js";
import { state } from "./state.js";
import { applyTab } from "./tabs.js";

const rollButton = document.getElementById("roll");
const idealButton = document.getElementById("idealRoll");
const sizeInput = document.getElementById("size");
const roster = document.getElementById("roster");
const cuts = document.getElementById("cuts");
const note = document.getElementById("note");
const ideal = document.getElementById("ideal");
const idealPct = document.getElementById("idealPct");
const idealRaw = document.getElementById("idealRaw");
const idealNote = document.getElementById("idealNote");
const problems = document.getElementById("problems");
const problemsNote = document.getElementById("problemsNote");
const nuances = document.getElementById("nuances");
const error = document.getElementById("error");
const strongPairsOn = document.getElementById("strongPairsOn");
const strongPairsInput = document.getElementById("strongPairs");
const draftSelect = document.getElementById("draft");
const heroRaise = document.getElementById("heroRaise");
const heroLower = document.getElementById("heroLower");
const heroRaiseSkip = document.getElementById("heroRaiseSkip");
const heroLowerSkip = document.getElementById("heroLowerSkip");
const heroRaiseOffers = document.getElementById("heroRaiseOffers");
const heroLowerOffers = document.getElementById("heroLowerOffers");
const heroRaiseHide = document.getElementById("heroRaiseHide");
const heroLowerHide = document.getElementById("heroLowerHide");

let lastPayload = null;
let rosterView = null;
let heroBanned = new Set();
const shiftTicket = { up: 0, down: 0 };

export function hasHeroRoster() {
  return !!lastPayload;
}

export function matchesHero(hero, needle) {
  if (!needle) {
    return true;
  }
  const labels = [hero.name].concat(hero.aliases || []);
  return labels.some((label) => label.toLowerCase().replaceAll("ё", "е").includes(needle));
}

export function heroChoices(needle) {
  if (!lastPayload) {
    return [];
  }
  const taken = new Set((lastPayload.heroes || []).map((hero) => hero.name));
  return (lastPayload.catalog || []).filter((hero) => !taken.has(hero.name) && matchesHero(hero, needle));
}

export function portrait(src, name) {
  const label = heroLabel(name);
  const image = document.createElement("img");
  if (src) image.src = src;
  image.alt = label;
  image.title = label;
  return image;
}

export function currentSettings() {
  return {
    size: rosterSize(),
    bandLow: bandValue("bandLow", 45),
    bandHigh: bandValue("bandHigh", 55),
    weightBelow: weightValue("weightBelow", 1),
    weightAbove: weightValue("weightAbove", 1),
    weightNone: weightValue("weightNone", 0),
    strongPairs: strongPairCount(),
    dropWeak: document.getElementById("dropWeak").checked,
    dropEvents: selectedEvents(),
    dropUnknown: document.getElementById("dropUnknown").checked,
    latestSet: document.getElementById("latestSet").checked,
    draft: draftSelect.value,
    lang: getLang(),
    source: document.getElementById("statsSource").value,
  };
}

export async function refreshShownRoster() {
  if (!lastPayload) {
    return;
  }
  error.hidden = true;
  try {
    const response = await fetch("/api/rescore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...currentSettings(),
        roster: lastPayload.heroes.map((hero) => hero.name),
        pool: (lastPayload.pool || []).map((hero) => hero.name),
        excluded: lastPayload.excluded || [],
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || t("errRefresh"));
    }
    showRoster(payload);
  } catch (err) {
    error.hidden = false;
    error.textContent = err.message;
  }
}

async function applyLatestToggle() {
  if (!lastPayload) {
    return;
  }
  const latestNames = (lastPayload.catalog || []).filter((hero) => hero.latest).map((hero) => hero.name);
  const current = lastPayload.heroes.map((hero) => hero.name);
  const on = document.getElementById("latestSet").checked;
  const next = on
    ? current.concat(latestNames.filter((name) => !current.includes(name)))
    : current.filter((name) => !latestNames.includes(name));
  if (next.join("\n") === current.join("\n")) {
    return;
  }
  const pool = (lastPayload.pool || []).map((hero) => hero.name).filter((name) => on || !latestNames.includes(name));
  if (on) {
    latestNames.forEach((name) => {
      if (!pool.includes(name)) {
        pool.push(name);
      }
    });
  }
  error.hidden = true;
  try {
    const response = await fetch("/api/rescore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...currentSettings(),
        roster: next,
        pool,
        excluded: lastPayload.excluded || [],
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || t("errUpdate"));
    }
    showRoster(payload);
  } catch (err) {
    error.hidden = false;
    error.textContent = err.message;
  }
}

export function startHeroes() {
  const showRanks = document.getElementById("showRanks");
  const showEvents = document.getElementById("showEvents");
  const paintRanks = () => roster.classList.toggle("show-rank", showRanks.checked);
  showRanks.addEventListener("change", paintRanks);
  paintRanks();
  if (showEvents) {
    showEvents.addEventListener("change", () => {
      if (!lastPayload) {
        return;
      }
      if (heroBanned.size) {
        paintRosterCards(new Map());
        return;
      }
      paintScored(lastPayload);
    });
  }
  strongPairsOn.addEventListener("change", () => {
    strongPairsInput.disabled = !strongPairsOn.checked;
  });
  draftSelect.addEventListener("change", () => {
    sizeInput.value = String(draftSize());
  });
  rollButton.addEventListener("click", () => requestRoster("/api/roll", rollButton));
  idealButton.addEventListener("click", () => requestRoster("/api/roll/above", idealButton, t("searching")));
  heroRaise.addEventListener("click", () => offerHeroSwaps("up"));
  heroLower.addEventListener("click", () => offerHeroSwaps("down"));
  heroRaiseHide.addEventListener("click", () => clearHeroOffers("up"));
  heroLowerHide.addEventListener("click", () => clearHeroOffers("down"));
  heroRaiseSkip.addEventListener("change", () => {
    if (heroRaiseOffers.childElementCount) {
      offerHeroSwaps("up");
    }
  });
  heroLowerSkip.addEventListener("change", () => {
    if (heroLowerOffers.childElementCount) {
      offerHeroSwaps("down");
    }
  });
  for (const id of ["bandLow", "bandHigh", "weightBelow", "weightAbove", "weightNone"]) {
    document.getElementById(id).addEventListener("input", () => {
      if (lastPayload) {
        refreshShownRoster();
      }
    });
  }
  document.getElementById("latestSet").addEventListener("change", () => {
    applyLatestToggle();
  });
  document.getElementById("heroSaveRoster").addEventListener("click", saveHeroRoster);
  onLangChange(() => {
    paintHeroRollLabel();
    if (lastPayload) {
      if (heroBanned.size) {
        rescoreActive();
      } else {
        paintScored(lastPayload);
      }
    }
  });
}

async function saveHeroRoster() {
  const title = document.getElementById("heroSaveName").value.trim();
  const names = (lastPayload && lastPayload.heroes || []).map((hero) => hero.name);
  error.hidden = true;
  if (!title) {
    error.hidden = false;
    error.textContent = t("needSaveName");
    return;
  }
  if (!names.length) {
    error.hidden = false;
    error.textContent = t("rosterHasNoHeroes");
    return;
  }
  try {
    const response = await fetch("/api/saved", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: title,
        names,
        source: document.getElementById("statsSource").value,
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || t("errSave"));
    }
    const { syncSavedRosters } = await import("./build.js");
    await syncSavedRosters(title);
  } catch (err) {
    error.hidden = false;
    error.textContent = err.message;
  }
}

function paintHeroRollLabel() {
  if (rollButton.disabled) {
    return;
  }
  rollButton.textContent = state.heroReady ? t("anotherRoster") : t("roll");
}

function setHeroButtons(disabled) {
  rollButton.disabled = disabled;
  idealButton.disabled = disabled;
}

async function requestRoster(url, button, busyText) {
  const previous = button.textContent;
  error.hidden = true;
  setHeroButtons(true);
  if (busyText) {
    button.textContent = busyText;
  }
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(currentSettings()),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || t("errRoll"));
    }
    heroBanned = new Set();
    showRoster(payload);
  } catch (err) {
    error.hidden = false;
    error.textContent = err.message;
  } finally {
    button.textContent = previous;
    setHeroButtons(false);
    paintHeroRollLabel();
  }
}

async function offerHeroSwaps(direction) {
  if (!lastPayload) {
    return;
  }
  const down = direction === "down";
  const button = down ? heroLower : heroRaise;
  const box = down ? heroLowerOffers : heroRaiseOffers;
  const skip = down ? heroLowerSkip.checked : heroRaiseSkip.checked;
  const ticket = ++shiftTicket[direction];
  error.hidden = true;
  button.disabled = true;
  try {
    const response = await fetch("/api/build/swaps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...currentSettings(),
        names: lastPayload.heroes.filter((hero) => !heroBanned.has(hero.name)).map((hero) => hero.name),
        direction,
        skipRecent: skip,
      }),
    });
    const payload = await response.json();
    if (ticket !== shiftTicket[direction]) {
      return;
    }
    if (!response.ok) {
      throw new Error(payload.error || t("errSwaps"));
    }
    paintHeroSwaps(box, payload.swaps || [], direction);
  } catch (err) {
    if (ticket !== shiftTicket[direction]) {
      return;
    }
    error.hidden = false;
    error.textContent = err.message;
  } finally {
    if (ticket === shiftTicket[direction]) {
      button.disabled = false;
    }
  }
}

function clearHeroOffers(direction) {
  const down = direction === "down";
  (down ? heroLowerOffers : heroRaiseOffers).replaceChildren();
  (down ? heroLowerHide : heroRaiseHide).hidden = true;
}

function paintHeroSwaps(box, swaps, direction) {
  box.replaceChildren();
  (direction === "down" ? heroLowerHide : heroRaiseHide).hidden = false;
  if (!swaps.length) {
    const line = document.createElement("p");
    line.className = "ideal-note";
    line.textContent = direction === "down" ? t("noSwapsRaise") : t("noSwapsLower");
    box.append(line);
    return;
  }
  swaps.forEach((swap) => {
    const button = document.createElement("button");
    button.type = "button";
    button.append(portrait(swap.removeImage, swap.remove));
    const text = document.createElement("span");
    text.textContent = heroLabel(swap.remove) + " → " + heroLabel(swap.add);
    const gain = document.createElement("span");
    gain.className = "gain";
    const value = Number(swap.gain);
    const next = Number(swap.ideal);
    const from = Number.isFinite(Number(swap.base)) ? Number(swap.base) : next - value;
    gain.textContent = formatScore(from) + " → " + formatScore(next);
    gain.title = "SCORE "
      + (value < 0 ? "−" : "+")
      + Math.abs(value).toFixed(1).replace(".", ",");
    gain.classList.toggle("is-down", value > 0);
    button.append(text, portrait(swap.addImage, swap.add), gain);
    button.addEventListener("click", () => applyHeroOffer(swap, direction));
    box.append(button);
  });
}

async function applyHeroOffer(swap, direction) {
  if (!lastPayload) {
    return;
  }
  error.hidden = true;
  try {
    const response = await fetch("/api/swap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...currentSettings(),
        roster: lastPayload.heroes.map((hero) => hero.name),
        remove: swap.remove,
        add: swap.add,
        pool: (lastPayload.pool || []).map((hero) => hero.name),
        excluded: lastPayload.excluded || [],
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || t("errReplaceHero"));
    }
    showRoster(payload);
    offerHeroSwaps(direction);
  } catch (err) {
    error.hidden = false;
    error.textContent = err.message;
  }
}

export async function replaceHero(name) {
  const removed = replaceTarget();
  if (!lastPayload || !removed || removed === name) {
    return;
  }
  error.hidden = true;
  document.querySelectorAll("#pickerList button").forEach((button) => {
    button.disabled = true;
  });
  try {
    const response = await fetch("/api/swap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...currentSettings(),
        roster: lastPayload.heroes.map((hero) => hero.name),
        remove: removed,
        add: name,
        pool: (lastPayload.pool || []).map((hero) => hero.name),
        excluded: lastPayload.excluded || [],
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || t("errReplaceHero"));
    }
    showRoster(payload);
  } catch (err) {
    error.hidden = false;
    error.textContent = err.message;
    closePicker();
  }
}

function bandValue(id, fallback) {
  const value = Number(document.getElementById(id).value);
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(100, Math.max(0, value));
}

function weightValue(id, fallback) {
  const value = Number(document.getElementById(id).value);
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(20, Math.max(0, value));
}

function strongPairCount() {
  if (!strongPairsOn.checked) {
    return 0;
  }
  const value = Math.round(Number(strongPairsInput.value));
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.min(20, Math.max(1, value));
}

function draftSize() {
  return draftSelect.value === "Masters" ? 30 : 15;
}

function rosterSize() {
  const value = Math.round(Number(sizeInput.value));
  if (!Number.isFinite(value)) {
    return draftSize();
  }
  return Math.min(40, Math.max(2, value));
}

function showRoster(payload) {
  rememberHeroes(payload.heroes);
  rememberHeroes(payload.catalog);
  rememberHeroes(payload.pool);
  closeMenu();
  closePicker();
  lastPayload = payload;
  state.heroReady = true;
  clearHeroOffers("up");
  clearHeroOffers("down");
  applyTab();
  note.textContent = payload.notes && payload.notes.length ? payload.notes[0] : "";
  const present = new Set((payload.heroes || []).map((hero) => hero.name));
  heroBanned = new Set([...heroBanned].filter((name) => present.has(name)));
  cuts.replaceChildren();
  for (const hero of payload.excluded || []) {
    cuts.append(nameItem(hero, hero.reason, false));
  }
  if (heroBanned.size) {
    paintRosterCards(new Map());
    rescoreActive();
    return;
  }
  paintScored(payload);
}

function paintScored(payload) {
  showIdeal(payload.summary || {});
  if (heroBanned.size) {
    idealNote.textContent += t("bannedNotInScore");
  }
  showNuances(payload.nuances || []);
  showProblems(payload.problems || [], payload.summary || {});
  const summary = payload.summary || {};
  const low = Number(summary.bandLow);
  const high = Number(summary.bandHigh);
  const lowLine = Number.isFinite(low) ? low : 45;
  const highLine = Number.isFinite(high) ? high : 55;
  rosterView = {
    order: (payload.heroes || []).map((hero) => hero.name),
    duels: payload.duels || {},
    line: (lowLine + highLine) / 2,
    low: lowLine,
    high: highLine,
    minGames: gameFloor(summary.minGames),
  };
  const matrix = payload.matrix || [];
  const strength = strongestMarks(matrix, rosterView.minGames, 6);
  const weakness = weakestMarks(matrix, rosterView.minGames, 6);
  const markByName = new Map();
  payload.heroes.forEach((hero, index) => {
    const strong = strength.get(index);
    const weak = weakness.get(index);
    const mark = strong ? { ...strong, kind: "up" } : weak ? { ...weak, kind: "down" } : null;
    if (mark) {
      markByName.set(hero.name, mark);
    }
  });
  paintRosterCards(markByName);
  drawMatrix(payload.heroes, payload.matrix || [], {
    low: rosterView.low,
    high: rosterView.high,
    minGames: rosterView.minGames,
  });
}

function paintRosterCards(markByName) {
  roster.replaceChildren();
  (lastPayload.heroes || []).forEach((hero) => {
    const item = nameItem(hero, hero.reason, true, markByName.get(hero.name) || null);
    if (heroBanned.has(hero.name)) {
      item.classList.add("is-banned");
    }
    roster.append(item);
  });
}

function toggleBan(name) {
  if (heroBanned.has(name)) {
    heroBanned.delete(name);
  } else {
    heroBanned.add(name);
  }
  clearHeroOffers("up");
  clearHeroOffers("down");
  if (!heroBanned.size && lastPayload) {
    paintScored(lastPayload);
    return;
  }
  rescoreActive();
}

async function rescoreActive() {
  if (!lastPayload) {
    return;
  }
  const active = lastPayload.heroes.filter((hero) => !heroBanned.has(hero.name));
  if (active.length < 2) {
    rosterView = null;
    ideal.hidden = false;
    idealPct.textContent = "—";
    idealRaw.textContent = "";
    idealNote.textContent = t("lessThanTwoBanned");
    nuances.replaceChildren();
    const line = document.createElement("p");
    line.className = "ideal-note";
    line.textContent = t("buildNuancesEmpty");
    nuances.append(line);
    problems.replaceChildren();
    problemsNote.textContent = t("buildProblemsEmpty");
    paintRosterCards(new Map());
    drawMatrix([], [], { low: 45, high: 55, minGames: 5 });
    return;
  }
  error.hidden = true;
  try {
    const response = await fetch("/api/build", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...currentSettings(),
        names: active.map((hero) => hero.name),
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || t("errRefresh"));
    }
    paintScored(payload);
  } catch (err) {
    error.hidden = false;
    error.textContent = err.message;
  }
}

function showIdeal(summary) {
  ideal.hidden = false;
  const value = typeof summary.ideal === "number" ? summary.ideal : 0;
  const pct = formatBandPercent(summary);
  const score = formatScore(value);
  idealPct.textContent = pct;
  idealRaw.textContent = pct === "—" ? "" : "SCORE " + score;
  const known = summary.knownPairs || 0;
  const floor = gameFloor(summary.minGames);
  const games = floor + " " + countWord(floor, t("gameOne"), t("gameFew"), t("gameMany"));
  const buckets = bucketLine(summary);
  const weights = weightLine(summary);
  let text = t("scoreExplain", { pct, score, buckets, weights, games });
  if (summary.draft === "Masters") {
    text = t("scoreMasters", { pct, score, buckets, weights, known });
  }
  idealNote.textContent = text;
}

function showNuances(groups, root) {
  const target = root || nuances;
  target.replaceChildren();
  const filled = groups.filter((group) => group.rows && group.rows.length);
  if (!filled.length) {
    const line = document.createElement("p");
    line.className = "ideal-note";
    line.textContent = t("noThinPairs");
    target.append(line);
    return;
  }
  filled.forEach((group) => {
    const block = document.createElement("div");
    block.className = "nuance-group";
    const title = document.createElement("h3");
    title.textContent = group.title + " · " + group.rows.length;
    const note = document.createElement("p");
    note.className = "ideal-note";
    note.textContent = group.note;
    const list = document.createElement("ul");
    list.className = "problems";
    group.rows.forEach((item) => list.append(group.id === "quiet" ? quietRow(item) : nuanceRow(item)));
    block.append(title, note, list);
    target.append(block);
  });
}

export { showNuances };

function nuanceRow(item) {
  const row = document.createElement("li");
  const left = { name: item.hero, nameEn: item.nameEn };
  const right = { name: item.opponent, nameEn: item.opponentNameEn };
  row.append(portrait(item.heroImage, left));
  const text = document.createElement("div");
  const pct = document.createElement("p");
  pct.className = "pct";
  pct.textContent = Number(item.pct).toFixed(1).replace(".", ",") + "%";
  const line = document.createElement("p");
  line.className = "line";
  line.textContent = t("vsLine", {
    hero: heroLabel(left),
    opponent: heroLabel(right),
    games: item.games,
    matches: countWord(item.games, t("matchOne"), t("matchFew"), t("matchMany")),
  });
  text.append(pct, line);
  row.append(text);
  row.append(portrait(item.opponentImage, right));
  return row;
}

function quietRow(item) {
  const row = document.createElement("li");
  row.className = "is-quiet";
  row.append(portrait(item.heroImage, { name: item.hero, nameEn: item.nameEn }));
  const text = document.createElement("div");
  const name = document.createElement("p");
  name.className = "pct";
  name.textContent = heroLabel({ name: item.hero, nameEn: item.nameEn });
  const line = document.createElement("p");
  line.className = "line";
  line.textContent = item.games
    ? item.games + " " + countWord(item.games, t("matchOne"), t("matchFew"), t("matchMany"))
    : t("noMatches");
  text.append(name, line);
  row.append(text);
  return row;
}

function showProblems(items, summary, list, note) {
  const box = list || problems;
  const caption = note || problemsNote;
  box.replaceChildren();
  const low = formatBound(summary.bandLow, 45);
  const high = formatBound(summary.bandHigh, 55);
  if (!items.length) {
    caption.textContent = t("noPairsOutside", { low, high });
    return;
  }
  caption.textContent = t("pairsOutside", { low, high });
  for (const item of items) {
    const row = document.createElement("li");
    const left = { name: item.hero, nameEn: item.nameEn };
    const right = { name: item.opponent, nameEn: item.opponentNameEn };
    row.append(portrait(item.heroImage, left));
    const text = document.createElement("div");
    const pct = document.createElement("p");
    pct.className = "pct";
    pct.textContent = item.pct.toFixed(1).replace(".", ",") + "%";
    const line = document.createElement("p");
    line.className = "line";
    line.textContent = t("vsLine", {
      hero: heroLabel(left),
      opponent: heroLabel(right),
      games: item.games,
      matches: countWord(item.games, t("matchOne"), t("matchFew"), t("matchMany")),
    });
    const pull = document.createElement("p");
    pull.className = "line";
    pull.textContent = pullText(item);
    text.append(pct, line, pull);
    row.append(text);
    row.append(portrait(item.opponentImage, right));
    box.append(row);
  }
}

export { showProblems };

function eventLabel(events) {
  return (Array.isArray(events) ? events : []).join(" · ");
}

function nameItem(hero, _reason, hoverSource, strength) {
  const item = document.createElement("li");
  item.dataset.hero = hero.name;
  const shot = document.createElement("div");
  shot.className = "shot";
  shot.append(portrait(hero.image, hero.name));
  if (strength) {
    const dot = document.createElement("span");
    dot.className = strength.kind === "down" ? "strength is-weak" : "strength";
    dot.textContent = String(strength.place);
    const role = strength.kind === "down" ? t("strengthWeak") : t("strengthStrong");
    dot.title = strength.place + role + Math.round(strength.average)
      + t("strengthTail", {
        known: strength.known,
        pairs: countWord(strength.known, t("pairOne"), t("pairFew"), t("pairMany")),
      });
    shot.append(dot);
  }
  if (hoverSource) {
    const banned = heroBanned.has(hero.name);
    const ban = document.createElement("button");
    ban.type = "button";
    ban.className = "ban";
    ban.textContent = banned ? t("unban") : t("ban");
    ban.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleBan(hero.name);
    });
    shot.append(ban);
  }
  item.append(shot);
  const name = document.createElement("p");
  name.className = "name";
  name.textContent = heroLabel(hero);
  item.append(name);
  const showEvents = document.getElementById("showEvents");
  const events = showEvents && showEvents.checked ? eventLabel(hero.events || hero.recent) : "";
  if (events) {
    const line = document.createElement("p");
    line.className = "events";
    line.textContent = events;
    item.append(line);
  }
  if (hoverSource) {
    item.addEventListener("mouseenter", () => showEdges(hero.name));
    item.addEventListener("mouseleave", clearEdges);
    item.addEventListener("click", (event) => {
      event.stopPropagation();
      openMenu(event, hero.name, "hero");
    });
  }
  return item;
}

function showEdges(name) {
  clearEdges();
  if (!rosterView) {
    return;
  }
  const column = rosterView.order.indexOf(name);
  if (column < 0) {
    return;
  }
  for (const card of document.querySelectorAll("[data-hero]")) {
    const shot = card.querySelector(".shot");
    if (!shot) {
      continue;
    }
    if (card.dataset.hero === name) {
      if (card.closest("#roster")) {
        card.classList.add("is-focus");
      }
      shot.append(summaryEdge(name));
      continue;
    }
    const row = rosterView.duels[card.dataset.hero];
    const info = row ? row[column] : null;
    const edge = matchupEdge(info);
    if (!rosterView.order.includes(card.dataset.hero)) {
      edge.append(noteLine(spareText(pairStats(card.dataset.hero, name))));
    }
    shot.append(edge);
  }
}

function summaryEdge(name) {
  const stats = pairStats(name, null);
  const edge = document.createElement("p");
  edge.className = "edge summary";
  if (stats.below + stats.above > 0) {
    edge.classList.add("down");
  } else if (stats.slots > 0 && stats.known >= Math.ceil(stats.slots * 0.35)) {
    edge.classList.add("up");
  } else {
    edge.classList.add("mid");
  }
  edge.append(noteLine(t("bucketsShort", {
    below: stats.below,
    inside: stats.inside,
    above: stats.above,
  }), "count buckets"));
  edge.append(noteLine(t("noInfo", { n: stats.none })));
  return edge;
}

function matchupEdge(info) {
  const edge = document.createElement("p");
  edge.className = "edge";
  if (!info) {
    edge.textContent = "—";
    edge.classList.add("none");
    return edge;
  }
  const reliable = info.games >= rosterView.minGames;
  if (info.pct > rosterView.line) {
    edge.classList.add("up");
  } else if (info.pct < rosterView.line) {
    edge.classList.add("down");
  } else {
    edge.classList.add("mid");
  }
  if (!reliable) {
    edge.classList.add("thin");
  }
  if (reliable && info.pct > rosterView.high) {
    edge.append(verdictBadge("win"));
  } else if (reliable && info.pct < rosterView.low) {
    edge.append(verdictBadge("lose"));
  }
  const pct = document.createElement("span");
  pct.className = "pct-line";
  pct.textContent = Math.round(info.pct) + "%";
  edge.append(pct);
  edge.append(noteLine(info.games + " " + countWord(info.games, t("matchOne"), t("matchFew"), t("matchMany"))));
  if (!reliable) {
    edge.append(noteLine(t("fewGames"), "games tag"));
  } else if (info.pct < rosterView.low) {
    edge.append(noteLine(t("belowBand"), "games tag"));
  } else if (info.pct > rosterView.high) {
    edge.append(noteLine(t("aboveBand"), "games tag"));
  } else {
    edge.append(noteLine(t("inBand"), "games tag"));
  }
  return edge;
}

function verdictBadge(kind) {
  const badge = document.createElement("span");
  badge.className = "verdict " + (kind === "win" ? "is-win" : "is-lose");
  badge.textContent = kind === "win" ? t("winsMatchup") : t("losesMatchup");
  return badge;
}


function pairStats(name, skip) {
  const order = rosterView.order;
  const row = rosterView.duels[name] || [];
  let below = 0;
  let inside = 0;
  let above = 0;
  let none = 0;
  let slots = 0;
  order.forEach((opponent, index) => {
    if (opponent === name || opponent === skip) {
      return;
    }
    slots += 1;
    const info = row[index];
    if (!info || info.games < rosterView.minGames) {
      none += 1;
      return;
    }
    if (info.pct < rosterView.low) {
      below += 1;
    } else if (info.pct > rosterView.high) {
      above += 1;
    } else {
      inside += 1;
    }
  });
  return {
    below,
    inside,
    above,
    none,
    known: below + inside + above,
    slots,
    problems: below + above,
  };
}

function spareText(stats) {
  if (!stats.known) {
    return t("insteadNone", { n: rosterView.minGames });
  }
  return t("insteadBuckets", {
    below: stats.below,
    inside: stats.inside,
    above: stats.above,
    none: stats.none,
  });
}

function pullText(item) {
  const weight = Number(item.weight);
  const side = item.side === "below" ? t("sideBelow") : t("sideAbove");
  if (!Number.isFinite(weight)) {
    return t("pullSideBand", { side });
  }
  return t("pullWeight", { weight: formatScore(weight), side });
}

function bucketLine(summary) {
  return t("bucketsLine", {
    below: summary.below || 0,
    inside: summary.inside || 0,
    above: summary.above || 0,
    none: summary.none || 0,
  });
}

function weightLine(summary) {
  return t("weightsLine", {
    below: formatScore(summary.weightBelow ?? 1),
    above: formatScore(summary.weightAbove ?? 1),
    none: formatScore(summary.weightNone ?? 0),
  });
}

function gameFloor(value) {
  const games = Math.round(Number(value));
  if (!Number.isFinite(games) || games < 1) {
    return 5;
  }
  return games;
}

function noteLine(text, className) {
  const node = document.createElement("span");
  node.className = className || "games";
  node.textContent = text;
  return node;
}

function clearEdges() {
  for (const card of document.querySelectorAll("[data-hero]")) {
    card.classList.remove("is-focus");
    const edge = card.querySelector(".edge");
    if (edge) {
      edge.remove();
    }
  }
}
