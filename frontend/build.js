import { fromDroppedEvent, selectedEvents } from "./events.js";
import { countWord } from "./format.js";
import { drawMatrix, strongestMarks, weakestMarks } from "./heat.js";
import { matchesHero, portrait, showNuances, showProblems } from "./heroes.js";
import { openChoose } from "./picker.js";

const sizeInput = document.getElementById("buildSize");
const bandLowInput = document.getElementById("buildBandLow");
const bandHighInput = document.getElementById("buildBandHigh");
const draftSelect = document.getElementById("buildDraft");
const dropWeak = document.getElementById("buildDropWeak");
const dropUnknown = document.getElementById("buildDropUnknown");
const dropLatest = document.getElementById("buildDropLatest");
const latestSet = document.getElementById("buildLatestSet");
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
const rollButton = document.getElementById("buildRoll");
const idealButton = document.getElementById("buildIdealRoll");
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
const matrixLeadText = "Клетка — процент побед героя строки против героя столбца внутри ростера. Песок около 50%, зелёный выше, ржавый ниже. Номер и зелёная обводка — пять героев с лучшим средним процентом побед против остальных, пары от 5 игр. 1 — самый высокий.";
const roster = document.getElementById("buildRoster");
const idealValue = document.getElementById("buildIdealValue");
const idealNote = document.getElementById("buildIdealNote");
const error = document.getElementById("error");

let catalog = [];
let slots = [];
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
  draftSelect.addEventListener("change", () => {
    sizeInput.value = draftSelect.value === "Masters" ? "30" : "15";
    const next = readSize();
    if (next !== null) {
      resize(next);
    }
  });
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
      dropLatest.checked = false;
      placeLatest();
      return;
    }
    slots = slots.map((hero) => (hero && hero.latest ? null : hero));
    render();
    score();
  });
  dropLatest.addEventListener("change", () => {
    if (dropLatest.checked && latestSet.checked) {
      latestSet.checked = false;
      slots = slots.map((hero) => (hero && hero.latest ? null : hero));
      render();
      score();
    }
  });
  saveButton.addEventListener("click", saveCurrent);
  addButton.addEventListener("click", addHero);
  resetButton.addEventListener("click", resetBoard);
  deleteButton.addEventListener("click", deleteSaved);
  rollButton.addEventListener("click", () => requestDraft("/api/roll", rollButton));
  idealButton.addEventListener("click", () => requestDraft("/api/roll/above", idealButton, "Ищем…"));
  offerButton.addEventListener("click", () => offerSwaps("up"));
  lowerButton.addEventListener("click", () => offerSwaps("down"));
  offerHide.addEventListener("click", () => clearOffers("up"));
  lowerHide.addEventListener("click", () => clearOffers("down"));
  skipRecentSwaps.addEventListener("change", () => refreshOffers("up"));
  skipRecentLower.addEventListener("change", () => refreshOffers("down"));
  savedSelect.addEventListener("change", () => {
    if (savedSelect.value) {
      loadSaved(savedSelect.value);
    }
  });
  loadCatalog();
  loadSavedList();
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
    })
    .catch(() => {
      error.hidden = false;
      error.textContent = "Не удалось загрузить героев";
    });
  return catalogReady;
}

let savedRows = [];

function emptyNote(text) {
  const line = document.createElement("p");
  line.className = "ideal-note";
  line.textContent = text;
  return line;
}

function clearReport() {
  buildNuances.replaceChildren(emptyNote("Ростер не собран."));
  buildProblems.replaceChildren();
  buildProblemsNote.textContent = "Ростер не собран.";
  buildMatrix.replaceChildren();
  buildMatrixLead.textContent = "Тепловое поле не готово, так как не собран ростер.";
  buildMatrixLegend.hidden = true;
}

function loadSavedList() {
  return fetch("/api/saved")
    .then((response) => response.json())
    .then((payload) => {
      savedRows = payload.rosters || [];
      const current = savedSelect.value;
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
    error.textContent = "Нужно название ростера";
    return;
  }
  if (!names.length) {
    error.hidden = false;
    error.textContent = "В ростере нет героев";
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
      throw new Error(payload.error || "Не удалось сохранить");
    }
    savedRows = payload.rosters || [];
    await loadSavedList();
    savedSelect.value = title;
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
  const heroes = row.heroes.map((name) => catalog.find((hero) => hero.name === name)).filter(Boolean);
  const count = Math.min(40, Math.max(heroes.length, 2));
  sizeInput.value = String(count);
  slots = Array.from({ length: count }, (_, index) => heroes[index] || null);
  banned = new Set();
  loadedLock = true;
  clearOffers("up");
  clearOffers("down");
  render();
  score();
}

function resetBoard() {
  loadedLock = false;
  banned = new Set();
  slots = slots.map(() => null);
  clearOffers("up");
  clearOffers("down");
  rollButton.textContent = "Собрать ростер";
  render();
  score();
}

function draftSettings() {
  return {
    size: readSize() || 15,
    bandLow: bandValue(bandLowInput, 45),
    bandHigh: bandValue(bandHighInput, 55),
    strongPairs: strongPairsOn.checked ? strongPairCount() : 0,
    dropWeak: dropWeak.checked,
    dropEvents: selectedEvents(),
    dropUnknown: dropUnknown.checked,
    dropLatest: dropLatest.checked,
    latestSet: latestSet.checked,
    draft: draftSelect.value,
    source: statsSource(),
  };
}

function setDraftButtons(disabled) {
  rollButton.disabled = disabled;
  idealButton.disabled = disabled;
}

async function requestDraft(url, button, busyText) {
  const previous = button.textContent;
  error.hidden = true;
  setDraftButtons(true);
  if (busyText) {
    button.textContent = busyText;
  }
  try {
    await catalogReady;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draftSettings()),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Не удалось собрать ростер");
    }
    applyDraft(payload);
  } catch (err) {
    error.hidden = false;
    error.textContent = err.message;
  } finally {
    button.textContent = previous;
    setDraftButtons(false);
    rollButton.textContent = slots.some(Boolean) ? "Другой ростер" : "Собрать ростер";
  }
}

function applyDraft(payload) {
  const heroes = (payload.heroes || [])
    .map((hero) => catalog.find((item) => item.name === hero.name))
    .filter(Boolean);
  const count = Math.min(40, Math.max(heroes.length, 2));
  sizeInput.value = String(count);
  slots = Array.from({ length: count }, (_, index) => heroes[index] || null);
  banned = new Set();
  loadedLock = false;
  clearOffers("up");
  clearOffers("down");
  render();
  score();
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
    error.textContent = "Сначала выбери сохранённый ростер";
    return;
  }
  if (!window.confirm("Удалить ростер «" + title + "»? Это нельзя отменить.")) {
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
      throw new Error(payload.error || "Не удалось удалить");
    }
    savedRows = payload.rosters || [];
    savedSelect.value = "";
    await loadSavedList();
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
    dropWeak: dropWeak.checked,
    dropEvents: selectedEvents(),
    dropUnknown: dropUnknown.checked,
    dropLatest: dropLatest.checked,
    latestSet: latestSet.checked,
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
    error.textContent = "Для замен нужно хотя бы два героя";
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
      throw new Error(payload.error || "Не удалось подобрать замены");
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
    line.textContent = down
      ? "Замен, которые убавляют общий процент, нет."
      : "Замен, которые поднимают общий процент, нет.";
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
    gain.textContent = (value < 0 ? "−" : "+") + Math.abs(value).toFixed(1).replace(".", ",") + "%";
    gain.classList.toggle("is-down", value < 0);
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

function render() {
  roster.replaceChildren();
  slots.forEach((hero, index) => {
    const item = document.createElement("li");
    if (!hero) {
      item.className = "is-empty";
      item.textContent = "Выбрать";
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
        const role = mark.kind === "down" ? " по слабости в ростере: средний " : " по силе в ростере: средний ";
        dot.title = mark.place + role + Math.round(mark.average) + "% против остальных, " + mark.known + " " + countWord(mark.known, "пара", "пары", "пар");
        shot.append(dot);
      }
      item.append(shot);
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "dismiss";
      remove.textContent = "×";
      remove.title = "Убрать";
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
      ban.textContent = banned.has(hero.name) ? "Разбан" : "Бан";
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
      name.textContent = hero.name;
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
  [dropWeak, dropUnknown, dropLatest, latestSet, strongPairsOn].forEach((input) => {
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

function openSlot(index) {
  const current = slots[index];
  const taken = new Set(slots.filter(Boolean).map((hero) => hero.name));
  if (current) {
    taken.delete(current.name);
  }
  openChoose({
    title: current ? "Заменить " + current.name : "Выбрать героя",
    placeholder: "Имя героя",
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
    idealValue.textContent = "—";
    const waiting = slots.filter(Boolean).length >= 2
      ? "В расчёте меньше двух героев: бан не входит в процент."
      : "Выбери хотя бы двух героев. Процент появится по известным парам.";
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
    }),
  })
    .then((response) => response.json().then((payload) => ({ ok: response.ok, payload })))
    .then(({ ok, payload }) => {
      if (ticket !== requestId) {
        return;
      }
      if (!ok) {
        throw new Error(payload.error || "Не удалось посчитать ростер");
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
      idealValue.textContent = value.toFixed(1).replace(".", ",") + "%";
      const known = summary.knownPairs || 0;
      const games = buildView.minGames + " " + countWord(buildView.minGames, "игра", "игры", "игр");
      let text = "Насколько матчапы внутри ростера близки к 50%. Считается по " + known + " парам, где есть хотя бы " + games + ". 100% — каждая такая пара ровно равная.";
      if (banned.size) {
        text += " Забаненные герои в процент не входят.";
      }
      if (pairNote) {
        text += " " + pairNote;
      }
      idealNote.textContent = text;
      showNuances(payload.nuances || [], buildNuances);
      showProblems(payload.problems || [], summary, buildProblems, buildProblemsNote);
      buildMatrixLead.textContent = matrixLeadText;
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
    shot.append(matchupEdge(row ? row[column] : null));
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
  if (stats.problems > 0) {
    edge.classList.add("down");
  } else if (stats.slots > 0 && stats.known >= Math.ceil(stats.slots * 0.35)) {
    edge.classList.add("up");
  } else {
    edge.classList.add("mid");
  }
  edge.append(noteLine(String(stats.problems), "count"));
  edge.append(noteLine("вне коридора"));
  if (stats.pairs === null) {
    edge.append(noteLine("пар от " + buildView.minGames + " игр нет"));
  } else {
    edge.append(noteLine("его пары " + formatPairs(stats.pairs)));
  }
  edge.append(noteLine("известно " + stats.known + " из " + stats.slots));
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
  const reliable = info.games >= buildView.minGames;
  const outside = info.pct < buildView.low || info.pct > buildView.high;
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
  edge.append(noteLine(info.games + " " + countWord(info.games, "матч", "матча", "матчей")));
  if (!reliable) {
    edge.append(noteLine("мало игр", "games tag"));
  } else if (outside) {
    edge.append(noteLine("вне коридора", "games tag"));
  }
  return edge;
}

function pairStats(name) {
  let problems = 0;
  let known = 0;
  let closeness = 0;
  let slots = 0;
  const row = buildView.duels[name] || [];
  buildView.order.forEach((opponent, index) => {
    if (opponent === name) {
      return;
    }
    slots += 1;
    const info = row[index];
    if (!info || info.games < buildView.minGames) {
      return;
    }
    known += 1;
    closeness += Math.max(0, 100 - Math.abs(info.pct - 50) * 2);
    if (info.pct < buildView.low || info.pct > buildView.high) {
      problems += 1;
    }
  });
  return {
    problems,
    known,
    slots,
    pairs: known ? closeness / known : null,
  };
}

function formatPairs(value) {
  return value.toFixed(1).replace(".", ",") + "%";
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
  if (dropLatest.checked && hero.latest) {
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
        dropLatest: dropLatest.checked,
        dropUnknown: dropUnknown.checked,
        source: statsSource(),
        size: readSize() || 15,
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Не удалось подобрать пары");
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
      pairNote = "Часть сильных пар не вошла: на пару нужно два пустых места, и герои не должны уже быть в составе.";
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
