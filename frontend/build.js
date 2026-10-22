import { fromDroppedEvent, selectedEvents } from "./events.js";
import { countWord, formatBandPercent, formatScore } from "./format.js";
import { drawMatrix, strongestMarks, weakestMarks } from "./heat.js";
import { matchesHero, portrait, showNuances, showProblems } from "./heroes.js";
import { getLang, onLangChange, t } from "./i18n.js";
import { boardShot, refreshMapSavedList } from "./maps.js";
import { heroLabel, rememberHeroes } from "./names.js";
import { openChoose } from "./picker.js";

const sizeInput = document.getElementById("buildSize");
const bandLowInput = document.getElementById("buildBandLow");
const bandHighInput = document.getElementById("buildBandHigh");
const weightBelowInput = document.getElementById("buildWeightBelow");
const weightAboveInput = document.getElementById("buildWeightAbove");
const weightNoneInput = document.getElementById("buildWeightNone");
const dropWeak = document.getElementById("buildDropWeak");
const dropUnknown = document.getElementById("buildDropUnknown");
const latestSet = document.getElementById("buildLatestSet");
const SAVED_ROSTER_KEY = "savedRosterName";
const strongPairsOn = document.getElementById("buildStrongPairsOn");
const strongPairsInput = document.getElementById("buildStrongPairs");
const showRanks = document.getElementById("buildShowRanks");
const showEvents = document.getElementById("buildShowEvents");
const savedSelect = document.getElementById("savedRosters");
const saveName = document.getElementById("saveName");
const saveButton = document.getElementById("saveRoster");
const addButton = document.getElementById("addBuildHero");
const resetButton = document.getElementById("resetBuild");
const deleteButton = document.getElementById("deleteRoster");
const offerButton = document.getElementById("offerSwaps");
const lowerButton = document.getElementById("offerLower");
const skipRecentSwaps = document.getElementById("skipRecentSwaps");
const skipRecentLower = document.getElementById("skipRecentLower");
const swapOffers = document.getElementById("swapOffers");
const lowerOffers = document.getElementById("lowerOffers");
const offerHide = document.getElementById("offerHide");
const lowerHide = document.getElementById("offerLowerHide");
const buildNuances = document.getElementById("buildNuances");
const buildProblems = document.getElementById("buildProblems");
const buildProblemsNote = document.getElementById("buildProblemsNote");
const buildMatrix = document.getElementById("buildMatrix");
const buildMatrixLead = document.getElementById("buildMatrixLead");
const buildMatrixLegend = document.getElementById("buildMatrixLegend");
const roster = document.getElementById("buildRoster");
const idealPct = document.getElementById("buildIdealPct");
const idealRaw = document.getElementById("buildIdealRaw");
const idealNote = document.getElementById("buildIdealNote");
const buildMapsEmpty = document.getElementById("buildMapsEmpty");
const buildMapsList = document.getElementById("buildMaps");
const clearBuildMapsButton = document.getElementById("clearBuildMaps");
const error = document.getElementById("error");

let catalog = [];
let mapCatalog = [];
let mapCatalogReady = Promise.resolve();
let slots = [];
let attachedMaps = [];
let requestId = 0;
let buildView = null;
let marks = new Map();
let pairNote = "";
let catalogReady = Promise.resolve();
let loadedLock = false;
let banned = new Set();
const shiftTicket = { up: 0, down: 0 };

export function startBuild() {
  sizeInput.value = "15";
  resize(readSize());
  sizeInput.addEventListener("input", () => {
    const next = readSize();
    if (next === null || next === slots.length) {
      return;
    }
    resize(next);
  });
  bandLowInput.addEventListener("input", score);
  bandHighInput.addEventListener("input", score);
  weightBelowInput.addEventListener("input", score);
  weightAboveInput.addEventListener("input", score);
  weightNoneInput.addEventListener("input", score);
  strongPairsOn.addEventListener("change", () => {
    strongPairsInput.disabled = !strongPairsOn.checked;
    if (strongPairsOn.checked) {
      placePairs();
    }
  });
  strongPairsInput.addEventListener("change", () => {
    if (strongPairsOn.checked) {
      placePairs();
    }
  });
  showRanks.addEventListener("change", () => {
    roster.classList.toggle("show-rank", showRanks.checked);
    render();
  });
  showEvents.addEventListener("change", render);
  latestSet.addEventListener("change", () => {
    if (latestSet.checked) {
      placeLatest();
      return;
    }
    slots = slots.map((hero) => (hero && hero.latest ? null : hero));
    render();
    score();
  });
  saveButton.addEventListener("click", saveCurrent);
  addButton.addEventListener("click", addHero);
  resetButton.addEventListener("click", resetBoard);
  deleteButton.addEventListener("click", deleteSaved);
  if (clearBuildMapsButton) {
    clearBuildMapsButton.addEventListener("click", clearAttachedMaps);
  }
  offerButton.addEventListener("click", () => offerSwaps("up"));
  lowerButton.addEventListener("click", () => offerSwaps("down"));
  offerHide.addEventListener("click", () => clearOffers("up"));
  lowerHide.addEventListener("click", () => clearOffers("down"));
  skipRecentSwaps.addEventListener("change", () => refreshOffers("up"));
  skipRecentLower.addEventListener("change", () => refreshOffers("down"));
  savedSelect.addEventListener("change", () => {
    const title = savedSelect.value;
    rememberSaved(title);
    if (title) {
      loadSaved(title);
    }
  });
  loadCatalog();
  loadMapCatalog();
  loadSavedList().then(restoreSaved);
  onLangChange(() => {
    render();
    score();
    paintBuildMaps();
  });
}

export async function syncSavedRosters(title) {
  await loadSavedList();
  refreshMapSavedList(title);
  if (title && savedRows.some((row) => row.name === title)) {
    savedSelect.value = title;
    rememberSaved(title);
    const row = savedRows.find((item) => item.name === title);
    attachedMaps = row && row.maps ? [...row.maps] : [];
    await mapCatalogReady;
    paintBuildMaps();
  }
}

function rememberSaved(title) {
  if (title) {
    localStorage.setItem(SAVED_ROSTER_KEY, title);
    return;
  }
  localStorage.removeItem(SAVED_ROSTER_KEY);
}

function rememberedSaved() {
  return localStorage.getItem(SAVED_ROSTER_KEY) || "";
}

async function restoreSaved() {
  const title = rememberedSaved();
  if (!title || !savedRows.some((row) => row.name === title)) {
    if (title) {
      rememberSaved("");
    }
    return;
  }
  savedSelect.value = title;
  await loadSaved(title);
}

function readSize() {
  const value = Math.round(Number(sizeInput.value));
  if (!Number.isFinite(value)) {
    return null;
  }
  return Math.min(40, Math.max(2, value));
}

function resize(count) {
  if (count < slots.length) {
    slots = slots.slice(0, count);
  }
  while (slots.length < count) {
    slots.push(null);
  }
  if (latestSet.checked) {
    placeLatest();
    return;
  }
  render();
  score();
}

function statsSource() {
  const select = document.getElementById("statsSource");
  return select ? select.value : "all";
}

export function refreshBuildSource() {
  loadCatalog();
  score();
}

function loadCatalog() {
  catalogReady = fetch("/api/heroes?source=" + encodeURIComponent(statsSource()))
    .then((response) => response.json())
    .then((payload) => {
      catalog = payload.heroes || [];
      rememberHeroes(catalog);
    })
    .catch(() => {
      error.hidden = false;
      error.textContent = t("errLoadHeroes");
    });
  return catalogReady;
}

function loadMapCatalog() {
  mapCatalogReady = fetch("/api/maps")
    .then((response) => response.json())
    .then((payload) => {
      mapCatalog = payload.catalog || [];
      paintBuildMaps();
    })
    .catch(() => {
      mapCatalog = [];
    });
  return mapCatalogReady;
}

function paintBuildMaps() {
  if (!buildMapsEmpty || !buildMapsList) {
    return;
  }
  const names = attachedMaps.filter(Boolean);
  buildMapsList.replaceChildren();
  if (clearBuildMapsButton) {
    clearBuildMapsButton.hidden = !names.length;
    clearBuildMapsButton.textContent = t("clearMaps");
  }
  if (!names.length) {
    buildMapsEmpty.hidden = false;
    buildMapsEmpty.textContent = t("mapsNotSelected");
    buildMapsList.hidden = true;
    return;
  }
  buildMapsEmpty.hidden = true;
  buildMapsList.hidden = false;
  names.forEach((name) => {
    const item = mapCatalog.find((map) => map.name === name) || { name, image: "", aliases: [] };
    const card = document.createElement("li");
    card.append(boardShot(item));
    const label = document.createElement("p");
    label.className = "name";
    label.textContent = item.name;
    card.append(label);
    buildMapsList.append(card);
  });
}

async function clearAttachedMaps() {
  error.hidden = true;
  const title = savedSelect.value || rememberedSaved();
  if (!attachedMaps.length) {
    return;
  }
  if (!title) {
    attachedMaps = [];
    paintBuildMaps();
    return;
  }
  try {
    const response = await fetch("/api/saved", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: title, clearMaps: true }),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || t("errClearMaps"));
    }
    savedRows = payload.rosters || [];
    attachedMaps = [];
    await loadSavedList();
    if (savedRows.some((row) => row.name === title)) {
      savedSelect.value = title;
    }
    paintBuildMaps();
    refreshMapSavedList(title);
  } catch (err) {
    error.hidden = false;
    error.textContent = err.message;
  }
}

let savedRows = [];

function emptyNote(text) {
  const line = document.createElement("p");
  line.className = "ideal-note";
  line.textContent = text;
  return line;
}

function clearReport() {
  buildNuances.replaceChildren(emptyNote(t("buildNuancesEmpty")));
  buildProblems.replaceChildren();
  buildProblemsNote.textContent = t("buildProblemsEmpty");
  buildMatrix.replaceChildren();
  buildMatrixLead.textContent = t("buildHeatEmpty");
  buildMatrixLegend.hidden = true;
}

function loadSavedList() {
  return fetch("/api/saved")
    .then((response) => response.json())
    .then((payload) => {
      savedRows = payload.rosters || [];
      const current = savedSelect.value || rememberedSaved();
      savedSelect.replaceChildren();
      const blank = document.createElement("option");
      blank.value = "";
      blank.textContent = "—";
      savedSelect.append(blank);
      savedRows.forEach((row) => {
        const option = document.createElement("option");
        option.value = row.name;
        option.textContent = row.name;
        savedSelect.append(option);
      });
      if (savedRows.some((row) => row.name === current)) {
        savedSelect.value = current;
      }
    })
    .catch(() => {});
}

async function saveCurrent() {
  const title = saveName.value.trim();
  const names = slots.filter(Boolean).map((hero) => hero.name);
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
      body: JSON.stringify({ name: title, names, source: statsSource() }),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || t("errSave"));
    }
    savedRows = payload.rosters || [];
    await loadSavedList();
    savedSelect.value = title;
    rememberSaved(title);
    const row = savedRows.find((item) => item.name === title);
    attachedMaps = row && row.maps ? [...row.maps] : attachedMaps;
    paintBuildMaps();
    refreshMapSavedList(title);
  } catch (err) {
    error.hidden = false;
    error.textContent = err.message;
  }
}

async function loadSaved(title) {
  const row = savedRows.find((item) => item.name === title);
  if (!row) {
    return;
  }
  await catalogReady;
  await mapCatalogReady;
  const heroes = row.heroes.map((name) => catalog.find((hero) => hero.name === name)).filter(Boolean);
  const count = Math.min(40, Math.max(heroes.length, 2));
  sizeInput.value = String(count);
  slots = Array.from({ length: count }, (_, index) => heroes[index] || null);
  attachedMaps = row.maps ? [...row.maps] : [];
  banned = new Set();
  loadedLock = true;
  rememberSaved(title);
  clearOffers("up");
  clearOffers("down");
  render();
  score();
  paintBuildMaps();
}

function resetBoard() {
  loadedLock = false;
  banned = new Set();
  slots = slots.map(() => null);
  attachedMaps = [];
  clearOffers("up");
  clearOffers("down");
  render();
  score();
  paintBuildMaps();
}

function addHero() {
  let index = slots.findIndex((slot) => !slot);
  if (index < 0) {
    const next = slots.length + 1;
    if (next > 40) {
      return;
    }
    sizeInput.value = String(next);
    slots.push(null);
    index = slots.length - 1;
    render();
    score();
  }
  openSlot(index);
}

async function deleteSaved() {
  const title = savedSelect.value;
  error.hidden = true;
  if (!title) {
    error.hidden = false;
    error.textContent = t("pickSavedFirst");
    return;
  }
  if (!window.confirm(t("confirmDelete", { name: title }))) {
    return;
  }
  try {
    const response = await fetch("/api/saved", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: title, remove: true }),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || t("errDelete"));
    }
    savedRows = payload.rosters || [];
    savedSelect.value = "";
    rememberSaved("");
    attachedMaps = [];
    paintBuildMaps();
    await loadSavedList();
    refreshMapSavedList();
  } catch (err) {
    error.hidden = false;
    error.textContent = err.message;
  }
}

function buildSettings() {
  return {
    names: slots.filter((hero) => hero && !banned.has(hero.name)).map((hero) => hero.name),
    source: statsSource(),
    bandLow: bandValue(bandLowInput, 45),
    bandHigh: bandValue(bandHighInput, 55),
    weightBelow: weightValue(weightBelowInput, 1),
    weightAbove: weightValue(weightAboveInput, 1),
    weightNone: weightValue(weightNoneInput, 0),
    dropWeak: dropWeak.checked,
    dropEvents: selectedEvents(),
    dropUnknown: dropUnknown.checked,
    latestSet: latestSet.checked,
    lang: getLang(),
  };
}

function rosterFull() {
  return slots.length > 0 && slots.every((slot) => slot);
}

function refreshOffers(direction) {
  if (rosterFull()) {
    offerSwaps(direction);
    return;
  }
  clearOffers(direction);
}

function clearOffers(direction) {
  const down = direction === "down";
  (down ? lowerOffers : swapOffers).replaceChildren();
  (down ? lowerHide : offerHide).hidden = true;
}

async function offerSwaps(direction) {
  const names = slots.filter(Boolean).map((hero) => hero.name);
  const down = direction === "down";
  const button = down ? lowerButton : offerButton;
  const skip = down ? skipRecentLower.checked : skipRecentSwaps.checked;
  error.hidden = true;
  if (names.length < 2) {
    error.hidden = false;
    error.textContent = t("needTwoForSwaps");
    return;
  }
  const ticket = ++shiftTicket[direction];
  button.disabled = true;
  try {
    const response = await fetch("/api/build/swaps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...buildSettings(),
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
    paintSwaps(payload.swaps || [], direction);
  } catch (err) {
    if (ticket !== shiftTicket[direction]) {
      return;
    }
    error.hidden = false;
    error.textContent = err.message;
  } finally {
    if (ticket === shiftTicket[direction]) {
      button.disabled = !rosterFull();
    }
  }
}

function paintSwaps(swaps, direction) {
  const down = direction === "down";
  const box = down ? lowerOffers : swapOffers;
  box.replaceChildren();
  (down ? lowerHide : offerHide).hidden = false;
  if (!swaps.length) {
    const line = document.createElement("p");
    line.className = "ideal-note";
    line.textContent = down ? t("noSwapsRaise") : t("noSwapsLower");
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
    button.addEventListener("click", () => applyOffer(swap, direction));
    box.append(button);
  });
}

function applyOffer(swap, direction) {
  const index = slots.findIndex((hero) => hero && hero.name === swap.remove);
  const next = catalog.find((hero) => hero.name === swap.add);
  if (index < 0 || !next) {
    return;
  }
  slots[index] = next;
  render();
  score();
  offerSwaps(direction);
}

function sortSlots() {
  const filled = slots.filter(Boolean).sort((left, right) =>
    left.name.localeCompare(right.name, getLang() === "en" ? "en" : "ru", { sensitivity: "base" })
  );
  const empty = slots.length - filled.length;
  slots = filled.concat(Array.from({ length: empty }, () => null));
}

function render() {
  sortSlots();
  roster.replaceChildren();
  slots.forEach((hero, index) => {
    const item = document.createElement("li");
    if (!hero) {
      item.className = "is-empty";
      item.textContent = t("choose");
    } else {
      item.dataset.buildHero = hero.name;
      const shot = document.createElement("div");
      shot.className = "shot";
      shot.append(portrait(hero.image, hero.name));
      const mark = showRanks.checked ? marks.get(hero.name) : null;
      if (mark) {
        const dot = document.createElement("span");
        dot.className = mark.kind === "down" ? "strength is-weak" : "strength";
        dot.textContent = String(mark.place);
        const role = mark.kind === "down" ? t("strengthWeak") : t("strengthStrong");
        dot.title = mark.place + role + Math.round(mark.average)
          + t("strengthTail", {
            known: mark.known,
            pairs: countWord(mark.known, t("pairOne"), t("pairFew"), t("pairMany")),
          });
        shot.append(dot);
      }
      item.append(shot);
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "dismiss";
      remove.textContent = "×";
      remove.title = t("remove");
      remove.addEventListener("click", (event) => {
        event.stopPropagation();
        slots[index] = null;
        render();
        score();
      });
      shot.append(remove);
      const ban = document.createElement("button");
      ban.type = "button";
      ban.className = "ban";
      ban.textContent = banned.has(hero.name) ? t("unban") : t("ban");
      ban.addEventListener("click", (event) => {
        event.stopPropagation();
        if (banned.has(hero.name)) {
          banned.delete(hero.name);
        } else {
          banned.add(hero.name);
        }
        render();
        score();
      });
      shot.append(ban);
      if (banned.has(hero.name)) {
        item.classList.add("is-banned");
      }
      const name = document.createElement("p");
      name.className = "name";
      name.textContent = heroLabel(hero);
      item.append(name);
      const events = showEvents.checked ? eventLabel(hero.events) : "";
      if (events) {
        const line = document.createElement("p");
        line.className = "events";
        line.textContent = events;
        item.append(line);
      }
      item.addEventListener("mouseenter", () => showBuildEdges(hero.name));
      item.addEventListener("mouseleave", clearBuildEdges);
    }
    item.addEventListener("click", (event) => {
      event.stopPropagation();
      openSlot(index);
    });
    roster.append(item);
  });
  syncFilters();
}

function eventLabel(events) {
  return (Array.isArray(events) ? events : []).join(" · ");
}

function syncFilters() {
  const full = slots.length > 0 && slots.every((slot) => slot);
  const locked = full || loadedLock;
  [dropWeak, dropUnknown, latestSet, strongPairsOn].forEach((input) => {
    input.disabled = locked;
    const label = input.closest(".check");
    if (label) {
      label.classList.toggle("is-disabled", locked);
    }
  });
  strongPairsInput.disabled = locked || !strongPairsOn.checked;
  offerButton.disabled = !full;
  lowerButton.disabled = !full;
  addButton.disabled = slots.length >= 40 && full;
  if (!full) {
    clearOffers("up");
    clearOffers("down");
  }
}

function placeHeroes(names, preferIndex) {
  const seen = new Set(slots.filter(Boolean).map((hero) => hero.name));
  for (const name of names) {
    if (seen.has(name)) {
      continue;
    }
    const hero = catalog.find((item) => item.name === name);
    if (!hero) {
      continue;
    }
    let index = -1;
    if (
      Number.isInteger(preferIndex)
      && preferIndex >= 0
      && preferIndex < slots.length
      && !slots[preferIndex]
    ) {
      index = preferIndex;
      preferIndex = -1;
    } else {
      index = slots.findIndex((slot) => !slot);
    }
    if (index < 0) {
      if (slots.length >= 40) {
        break;
      }
      sizeInput.value = String(slots.length + 1);
      slots.push(null);
      index = slots.length - 1;
    }
    slots[index] = hero;
    seen.add(name);
  }
  render();
  score();
}

function openSlot(index) {
  const current = slots[index];
  const taken = new Set(slots.filter(Boolean).map((hero) => hero.name));
  if (current) {
    taken.delete(current.name);
  }
  const multi = !current;
  openChoose({
    title: current ? t("replaceNamed", { name: heroLabel(current) }) : t("chooseHero"),
    placeholder: t("searchHero"),
    multi,
    choices: (needle) => catalog.filter((hero) => {
      if (taken.has(hero.name)) {
        return false;
      }
      if (!passesFilters(hero, taken)) {
        return false;
      }
      if (!needle) {
        return true;
      }
      return matchesHero(hero, needle);
    }),
    shot: (hero) => portrait(hero.image, hero.name),
    onPick: (name) => {
      const hero = catalog.find((item) => item.name === name);
      if (!hero) {
        return;
      }
      slots[index] = hero;
      render();
      score();
    },
    onPickMany: multi ? (names) => placeHeroes(names, index) : null,
    onClear: current ? () => {
      slots[index] = null;
      render();
      score();
    } : null,
  });
}

function score() {
  const present = new Set(slots.filter(Boolean).map((hero) => hero.name));
  banned = new Set([...banned].filter((name) => present.has(name)));
  const names = slots.filter((hero) => hero && !banned.has(hero.name)).map((hero) => hero.name);
  if (names.length < 2) {
    requestId += 1;
    buildView = null;
    marks = new Map();
    idealPct.textContent = "—";
    idealRaw.textContent = "";
    const waiting = slots.filter(Boolean).length >= 2
      ? t("lessThanTwoBanned")
      : t("buildIdealWait");
    idealNote.textContent = waiting + (pairNote ? " " + pairNote : "");
    clearReport();
    render();
    return;
  }
  const ticket = ++requestId;
  fetch("/api/build", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      names,
      source: statsSource(),
      bandLow: bandValue(bandLowInput, 45),
      bandHigh: bandValue(bandHighInput, 55),
      weightBelow: weightValue(weightBelowInput, 1),
      weightAbove: weightValue(weightAboveInput, 1),
      weightNone: weightValue(weightNoneInput, 0),
      lang: getLang(),
    }),
  })
    .then((response) => response.json().then((payload) => ({ ok: response.ok, payload })))
    .then(({ ok, payload }) => {
      if (ticket !== requestId) {
        return;
      }
      if (!ok) {
        throw new Error(payload.error || t("errScore"));
      }
      const summary = payload.summary || {};
      const low = Number(summary.bandLow);
      const high = Number(summary.bandHigh);
      const lowLine = Number.isFinite(low) ? low : 45;
      const highLine = Number.isFinite(high) ? high : 55;
      buildView = {
        order: (payload.heroes || []).map((hero) => hero.name),
        duels: payload.duels || {},
        line: (lowLine + highLine) / 2,
        low: lowLine,
        high: highLine,
        minGames: gameFloor(summary.minGames),
      };
      marks = rankMarks(payload.heroes || [], payload.matrix || [], buildView.minGames);
      const value = typeof summary.ideal === "number" ? summary.ideal : 0;
      const pct = formatBandPercent(summary);
      const score = formatScore(value);
      idealPct.textContent = pct;
      idealRaw.textContent = pct === "—" ? "" : "SCORE " + score;
      const games = buildView.minGames + " " + countWord(buildView.minGames, t("gameOne"), t("gameFew"), t("gameMany"));
      let text = t("scoreExplain", {
        pct,
        score,
        buckets: bucketLine(summary),
        weights: weightLine(summary),
        games,
      });
      if (banned.size) {
        text += t("bannedNotInScore");
      }
      if (pairNote) {
        text += " " + pairNote;
      }
      idealNote.textContent = text;
      showNuances(payload.nuances || [], buildNuances);
      showProblems(payload.problems || [], summary, buildProblems, buildProblemsNote);
      buildMatrixLead.textContent = t("heatLead");
      buildMatrixLegend.hidden = false;
      drawMatrix(payload.heroes || [], payload.matrix || [], {
        low: buildView.low,
        high: buildView.high,
        minGames: buildView.minGames,
      }, buildMatrix);
      render();
    })
    .catch((err) => {
      if (ticket !== requestId) {
        return;
      }
      error.hidden = false;
      error.textContent = err.message;
    });
}

function showBuildEdges(name) {
  clearBuildEdges();
  if (!buildView) {
    return;
  }
  const column = buildView.order.indexOf(name);
  if (column < 0) {
    return;
  }
  for (const card of roster.querySelectorAll("[data-build-hero]")) {
    const shot = card.querySelector(".shot");
    if (!shot) {
      continue;
    }
    if (card.dataset.buildHero === name) {
      card.classList.add("is-focus");
      shot.append(summaryEdge(name));
      continue;
    }
    const row = buildView.duels[card.dataset.buildHero];
    const info = row ? row[column] : null;
    shot.append(matchupEdge(info));
  }
}

function clearBuildEdges() {
  for (const card of roster.querySelectorAll("[data-build-hero]")) {
    card.classList.remove("is-focus");
    const edge = card.querySelector(".edge");
    if (edge) {
      edge.remove();
    }
  }
}

function summaryEdge(name) {
  const stats = pairStats(name);
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
  const reliable = info.games >= buildView.minGames;
  if (info.pct > buildView.line) {
    edge.classList.add("up");
  } else if (info.pct < buildView.line) {
    edge.classList.add("down");
  } else {
    edge.classList.add("mid");
  }
  if (!reliable) {
    edge.classList.add("thin");
  }
  if (reliable && info.pct > buildView.high) {
    edge.append(verdictBadge("win"));
  } else if (reliable && info.pct < buildView.low) {
    edge.append(verdictBadge("lose"));
  }
  const pct = document.createElement("span");
  pct.className = "pct-line";
  pct.textContent = Math.round(info.pct) + "%";
  edge.append(pct);
  edge.append(noteLine(info.games + " " + countWord(info.games, t("matchOne"), t("matchFew"), t("matchMany"))));
  if (!reliable) {
    edge.append(noteLine(t("fewGames"), "games tag"));
  } else if (info.pct < buildView.low) {
    edge.append(noteLine(t("belowBand"), "games tag"));
  } else if (info.pct > buildView.high) {
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


function pairStats(name) {
  let below = 0;
  let inside = 0;
  let above = 0;
  let none = 0;
  let slots = 0;
  const row = buildView.duels[name] || [];
  buildView.order.forEach((opponent, index) => {
    if (opponent === name) {
      return;
    }
    slots += 1;
    const info = row[index];
    if (!info || info.games < buildView.minGames) {
      none += 1;
      return;
    }
    if (info.pct < buildView.low) {
      below += 1;
    } else if (info.pct > buildView.high) {
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

function bandValue(input, fallback) {
  const value = Number(input.value);
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(100, Math.max(0, value));
}

function weightValue(input, fallback) {
  const value = Number(input.value);
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(20, Math.max(0, value));
}

function strongPairCount() {
  const value = Math.round(Number(strongPairsInput.value));
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.min(20, Math.max(1, value));
}

function passesFilters(hero, taken) {
  if (dropWeak.checked && hero.weak) {
    return false;
  }
  if (fromDroppedEvent(hero)) {
    return false;
  }
  if (!dropUnknown.checked) {
    return true;
  }
  const played = new Set(hero.played || []);
  for (const name of taken) {
    if (!played.has(name)) {
      return false;
    }
  }
  return true;
}

function rankMarks(heroes, matrix, minGames) {
  const up = strongestMarks(matrix, minGames, 6);
  const down = weakestMarks(matrix, minGames, 6);
  const next = new Map();
  heroes.forEach((hero, index) => {
    const strong = up.get(index);
    const weak = down.get(index);
    const mark = strong ? { ...strong, kind: "up" } : weak ? { ...weak, kind: "down" } : null;
    if (mark) {
      next.set(hero.name, mark);
    }
  });
  return next;
}

function placeLatest() {
  return catalogReady.then(() => {
    const required = catalog.filter((hero) => hero.latest);
    const present = new Set(slots.filter(Boolean).map((hero) => hero.name));
    required.forEach((hero) => {
      if (present.has(hero.name)) {
        return;
      }
      let index = slots.findIndex((slot) => !slot);
      if (index < 0) {
        for (let place = slots.length - 1; place >= 0; place -= 1) {
          if (slots[place] && !slots[place].latest) {
            index = place;
            break;
          }
        }
      }
      if (index < 0) {
        return;
      }
      slots[index] = hero;
      present.add(hero.name);
    });
    render();
    score();
  });
}

async function placePairs() {
  pairNote = "";
  error.hidden = true;
  try {
    await catalogReady;
    const response = await fetch("/api/build/pairs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        strongPairs: strongPairCount(),
        dropWeak: dropWeak.checked,
        dropEvents: selectedEvents(),
        dropUnknown: dropUnknown.checked,
        source: statsSource(),
        size: readSize() || 15,
        lang: getLang(),
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || t("errPairs"));
    }
    const taken = new Set(slots.filter(Boolean).map((hero) => hero.name));
    let missed = 0;
    for (const pair of payload.pairs || []) {
      const heroes = [];
      for (const name of pair) {
        if (taken.has(name)) {
          continue;
        }
        const hero = catalog.find((item) => item.name === name);
        if (hero) {
          heroes.push(hero);
        }
      }
      const empty = slots.filter((slot) => !slot).length;
      if (heroes.length < 2 || empty < 2) {
        missed += 1;
        continue;
      }
      for (const hero of heroes) {
        const index = slots.findIndex((slot) => !slot);
        slots[index] = hero;
        taken.add(hero.name);
      }
    }
    if (missed) {
      pairNote = t("pairNotePartial");
    }
    render();
    score();
  } catch (err) {
    error.hidden = false;
    error.textContent = err.message;
  }
}

function noteLine(text, className) {
  const node = document.createElement("span");
  node.className = className || "games";
  node.textContent = text;
  return node;
}
