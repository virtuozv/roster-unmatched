import { selectedEvents } from "./events.js";
import { countWord, formatBound } from "./format.js";
import { drawMatrix, strongestMarks, weakestMarks } from "./heat.js";
import { closeMenu, closePicker, openMenu, replaceTarget } from "./picker.js";
import { state } from "./state.js";
import { applyTab } from "./tabs.js";

const rollButton = document.getElementById("roll");
const idealButton = document.getElementById("idealRoll");
const sizeInput = document.getElementById("size");
const roster = document.getElementById("roster");
const pool = document.getElementById("pool");
const cuts = document.getElementById("cuts");
const note = document.getElementById("note");
const ideal = document.getElementById("ideal");
const idealValue = document.getElementById("idealValue");
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
  const image = document.createElement("img");
  if (src) image.src = src;
  image.alt = name;
  image.title = name;
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
    dropLatest: document.getElementById("dropLatest").checked,
    latestSet: document.getElementById("latestSet").checked,
    draft: draftSelect.value,
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
      throw new Error(payload.error || "Не удалось пересчитать ростер");
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
      throw new Error(payload.error || "Не удалось обновить ростер");
    }
    showRoster(payload);
  } catch (err) {
    error.hidden = false;
    error.textContent = err.message;
  }
}

export function startHeroes() {
  const showRanks = document.getElementById("showRanks");
  const paintRanks = () => roster.classList.toggle("show-rank", showRanks.checked);
  showRanks.addEventListener("change", paintRanks);
  paintRanks();
  strongPairsOn.addEventListener("change", () => {
    strongPairsInput.disabled = !strongPairsOn.checked;
  });
  draftSelect.addEventListener("change", () => {
    sizeInput.value = String(draftSize());
  });
  rollButton.addEventListener("click", () => requestRoster("/api/roll", rollButton));
  idealButton.addEventListener("click", () => requestRoster("/api/roll/above", idealButton, "Ищем…"));
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
    if (document.getElementById("latestSet").checked) {
      document.getElementById("dropLatest").checked = false;
    }
    applyLatestToggle();
  });
  document.getElementById("dropLatest").addEventListener("change", () => {
    if (document.getElementById("dropLatest").checked && document.getElementById("latestSet").checked) {
      document.getElementById("latestSet").checked = false;
      applyLatestToggle();
    }
  });
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
      throw new Error(payload.error || "Не удалось собрать ростер");
    }
    heroBanned = new Set();
    showRoster(payload);
  } catch (err) {
    error.hidden = false;
    error.textContent = err.message;
  } finally {
    button.textContent = previous;
    setHeroButtons(false);
    rollButton.textContent = state.heroReady ? "Другой ростер" : "Собрать ростер";
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
      throw new Error(payload.error || "Не удалось подобрать замены");
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
    line.textContent = direction === "down"
      ? "Замен, которые поднимают SCORE, нет."
      : "Замен, которые снижают SCORE, нет.";
    box.append(line);
    return;
  }
  swaps.forEach((swap) => {
    const button = document.createElement("button");
    button.type = "button";
    button.append(portrait(swap.removeImage, swap.remove));
    const text = document.createElement("span");
    text.textContent = swap.remove + " → " + swap.add;
    const gain = document.createElement("span");
    gain.className = "gain";
    const value = Number(swap.gain);
    gain.textContent = (value < 0 ? "−" : "+") + Math.abs(value).toFixed(1).replace(".", ",");
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
      throw new Error(payload.error || "Не удалось заменить героя");
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
      throw new Error(payload.error || "Не удалось заменить героя");
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
  pool.replaceChildren();
  for (const hero of payload.pool || []) {
    pool.append(nameItem(hero, hero.reason, false));
  }
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
    idealNote.textContent += " Забаненные герои в SCORE не входят.";
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
    idealValue.textContent = "—";
    idealNote.textContent = "В расчёте меньше двух героев: бан не входит в SCORE.";
    nuances.replaceChildren();
    const line = document.createElement("p");
    line.className = "ideal-note";
    line.textContent = "Ростер не собран.";
    nuances.append(line);
    problems.replaceChildren();
    problemsNote.textContent = "Ростер не собран.";
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
      throw new Error(payload.error || "Не удалось пересчитать ростер");
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
  idealValue.textContent = formatScore(value);
  const known = summary.knownPairs || 0;
  const floor = gameFloor(summary.minGames);
  const games = floor + " " + countWord(floor, "игра", "игры", "игр");
  const buckets = bucketLine(summary);
  const weights = weightLine(summary);
  let text = "SCORE = штрафы за пары вне коридора. " + buckets + ". " + weights + ". Считается по парам от " + games + ". 0 — все известные пары в коридоре.";
  if (summary.draft === "Masters") {
    text = "SCORE начальной расстановки. " + buckets + ". " + weights + ". Баны и пики Masters его не меняют. Известных пар: " + known + ".";
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
    line.textContent = "В этом ростере нет пар с тонкой статистикой.";
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
  row.append(portrait(item.heroImage, item.hero));
  const text = document.createElement("div");
  const pct = document.createElement("p");
  pct.className = "pct";
  pct.textContent = Number(item.pct).toFixed(1).replace(".", ",") + "%";
  const line = document.createElement("p");
  line.className = "line";
  line.textContent = item.hero + " против " + item.opponent + ", " + item.games + " " + countWord(item.games, "матч", "матча", "матчей");
  text.append(pct, line);
  row.append(text);
  row.append(portrait(item.opponentImage, item.opponent));
  return row;
}

function quietRow(item) {
  const row = document.createElement("li");
  row.className = "is-quiet";
  row.append(portrait(item.heroImage, item.hero));
  const text = document.createElement("div");
  const name = document.createElement("p");
  name.className = "pct";
  name.textContent = item.hero;
  const line = document.createElement("p");
  line.className = "line";
  line.textContent = item.games ? item.games + " " + countWord(item.games, "матч", "матча", "матчей") : "нет матчей";
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
    caption.textContent = "Внутри ростера нет пар вне коридора " + low + "–" + high + "%.";
    return;
  }
  caption.textContent = "Пары этого ростера, где процент побед ниже " + low + "% или выше " + high + "%. Ниже — штраф пары в общий SCORE.";
  for (const item of items) {
    const row = document.createElement("li");
    row.append(portrait(item.heroImage, item.hero));
    const text = document.createElement("div");
    const pct = document.createElement("p");
    pct.className = "pct";
    pct.textContent = item.pct.toFixed(1).replace(".", ",") + "%";
    const line = document.createElement("p");
    line.className = "line";
    line.textContent = item.hero + " против " + item.opponent + ", " + item.games + " " + countWord(item.games, "матч", "матча", "матчей");
    const pull = document.createElement("p");
    pull.className = "line";
    pull.textContent = pullText(item);
    text.append(pct, line, pull);
    row.append(text);
    row.append(portrait(item.opponentImage, item.opponent));
    box.append(row);
  }
}

export { showProblems };

function nameItem(hero, reason, hoverSource, strength) {
  const item = document.createElement("li");
  item.dataset.hero = hero.name;
  const shot = document.createElement("div");
  shot.className = "shot";
  shot.append(portrait(hero.image, hero.name));
  if (strength) {
    const dot = document.createElement("span");
    dot.className = strength.kind === "down" ? "strength is-weak" : "strength";
    dot.textContent = String(strength.place);
    const role = strength.kind === "down" ? " по слабости в ростере: средний " : " по силе в ростере: средний ";
    dot.title = strength.place + role + Math.round(strength.average) + "% против остальных, " + strength.known + " " + countWord(strength.known, "пара", "пары", "пар");
    shot.append(dot);
  }
  if (hoverSource) {
    const banned = heroBanned.has(hero.name);
    const ban = document.createElement("button");
    ban.type = "button";
    ban.className = "ban";
    ban.textContent = banned ? "Разбан" : "Бан";
    ban.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleBan(hero.name);
    });
    shot.append(ban);
  }
  if (hoverSource && rosterView) {
    const stats = pairStats(hero.name, null);
    if (stats.below + stats.above > 0) {
      const mark = document.createElement("span");
      mark.className = "mark";
      mark.textContent = "↓" + stats.below + " ↑" + stats.above;
      mark.title = "Пары этого героя: ниже / выше коридора";
      shot.append(mark);
    }
  }
  item.append(shot);
  if (reason) {
    const why = document.createElement("p");
    why.className = "why";
    why.textContent = reason;
    item.append(why);
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
  edge.append(noteLine("↓" + stats.below + " · в " + stats.inside + " · ↑" + stats.above, "count buckets"));
  edge.append(noteLine("нет инфы " + stats.none));
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
  edge.textContent = Math.round(info.pct) + "%";
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
  edge.append(noteLine(info.games + " " + countWord(info.games, "матч", "матча", "матчей")));
  if (!reliable) {
    edge.append(noteLine("мало игр", "games tag"));
  } else if (info.pct < rosterView.low) {
    edge.append(noteLine("ниже коридора", "games tag"));
  } else if (info.pct > rosterView.high) {
    edge.append(noteLine("выше коридора", "games tag"));
  } else {
    edge.append(noteLine("в коридоре", "games tag"));
  }
  return edge;
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
    return "вместо него: нет пар от " + rosterView.minGames + " игр";
  }
  return "вместо него ↓" + stats.below + " · в " + stats.inside + " · ↑" + stats.above + " · нет " + stats.none;
}

function pullText(item) {
  const weight = Number(item.weight);
  const side = item.side === "below" ? "ниже" : "выше";
  if (!Number.isFinite(weight)) {
    return side + " коридора";
  }
  return "штраф " + formatScore(weight) + " (" + side + ")";
}

function formatScore(value) {
  return Number(value).toFixed(1).replace(".", ",");
}

function bucketLine(summary) {
  return "↓" + (summary.below || 0)
    + " · в " + (summary.inside || 0)
    + " · ↑" + (summary.above || 0)
    + " · нет " + (summary.none || 0);
}

function weightLine(summary) {
  return "веса: ниже "
    + formatScore(summary.weightBelow ?? 1)
    + ", выше "
    + formatScore(summary.weightAbove ?? 1)
    + ", нет "
    + formatScore(summary.weightNone ?? 0);
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
