import { countWord } from "./format.js";
import { closeMenu, closePicker } from "./picker.js";
import { state } from "./state.js";

const tabHeroes = document.getElementById("tabHeroes");
const tabMaps = document.getElementById("tabMaps");
const tabBuild = document.getElementById("tabBuild");
const title = document.getElementById("title");
const heroActions = document.getElementById("heroActions");
const mapActions = document.getElementById("mapActions");
const buildActions = document.getElementById("buildActions");
const gate = document.getElementById("gate");
const board = document.getElementById("board");
const mapGate = document.getElementById("mapGate");
const mapBoard = document.getElementById("mapBoard");
const buildBoard = document.getElementById("buildBoard");
const mapSizeInput = document.getElementById("mapSize");
const error = document.getElementById("error");

const titles = {
  heroes: "Драфт героев",
  maps: "Драфт карт",
  build: "Конструктор",
};

export function startTabs() {
  tabHeroes.addEventListener("click", () => showTab("heroes"));
  tabMaps.addEventListener("click", () => showTab("maps"));
  tabBuild.addEventListener("click", () => showTab("build"));
  applyTab();
  loadCounted();
}

export function applyTab() {
  const mode = state.mode;
  tabHeroes.classList.toggle("is-on", mode === "heroes");
  tabMaps.classList.toggle("is-on", mode === "maps");
  tabBuild.classList.toggle("is-on", mode === "build");
  title.textContent = titles[mode] || titles.heroes;
  heroActions.hidden = mode !== "heroes";
  mapActions.hidden = mode !== "maps";
  buildActions.hidden = mode !== "build";
  gate.hidden = mode !== "heroes" || state.heroReady;
  board.hidden = mode !== "heroes" || !state.heroReady;
  mapGate.hidden = mode !== "maps" || state.mapReady;
  mapBoard.hidden = mode !== "maps" || !state.mapReady;
  buildBoard.hidden = mode !== "build";
  placeRollButton("roll", "rollHome", "heroGateSlot", state.heroReady);
  placeRollButton("mapRoll", "mapRollHome", "mapGateSlot", state.mapReady);
  placeEventFilter();
  const statsWrap = document.getElementById("statsSourceWrap");
  if (statsWrap) {
    statsWrap.hidden = mode === "maps";
  }
  paintCounted();
}

function placeEventFilter() {
  const box = document.getElementById("dropEventsWrap");
  const homes = {
    heroes: document.getElementById("heroFilters"),
    maps: document.getElementById("mapFilters"),
    build: document.getElementById("buildFilters"),
  };
  const home = homes[state.mode];
  if (!box || !home) {
    return;
  }
  home.prepend(box);
}

function placeRollButton(buttonId, homeId, gateId, ready) {
  const button = document.getElementById(buttonId);
  const home = document.getElementById(homeId);
  const slot = document.getElementById(gateId);
  if (!button || !home || !slot) {
    return;
  }
  (ready ? home : slot).append(button);
}

function showTab(next) {
  state.mode = next;
  closeMenu();
  closePicker();
  error.hidden = true;
  applyTab();
}

function loadCounted() {
  fetch("/api/counted")
    .then((response) => response.json())
    .then((payload) => {
      state.countedHeroes = payload.counted;
      state.countedMatches = payload.matches;
      state.sourceStats = payload.sources || null;
      paintCounted();
    })
    .catch(() => {});
  fetch("/api/maps")
    .then((response) => response.json())
    .then((payload) => {
      state.countedMaps = payload.counted;
      if (Number.isFinite(state.countedMaps)) {
        mapSizeInput.max = String(state.countedMaps);
      }
      paintCounted();
    })
    .catch(() => {});
}

function chosenStats() {
  const pack = state.sourceStats && state.sourceStats[state.statsSource];
  if (pack) {
    return pack;
  }
  return { counted: state.countedHeroes, matches: state.countedMatches };
}

export function paintCounted() {
  const counted = document.getElementById("counted");
  if (state.mode === "maps") {
    if (!Number.isFinite(state.countedMaps)) {
      counted.textContent = "";
      return;
    }
    counted.textContent = "учтено " + state.countedMaps + " " + countWord(state.countedMaps, "карта", "карты", "карт");
    return;
  }
  const stats = chosenStats();
  if (!Number.isFinite(stats.counted)) {
    counted.textContent = "";
    return;
  }
  let text = "учтено " + stats.counted + " " + countWord(stats.counted, "герой", "героя", "героев");
  if (Number.isFinite(stats.matches)) {
    text += ", " + stats.matches + " " + countWord(stats.matches, "матч", "матча", "матчей");
  }
  counted.textContent = text;
}
