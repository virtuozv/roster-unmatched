import { countWord } from "./format.js";
import { t } from "./i18n.js";
import { closeMenu, closePicker } from "./picker.js";
import { state } from "./state.js";
import { paintUnknown } from "./unknown.js";

const tabHeroes = document.getElementById("tabHeroes");
const tabMaps = document.getElementById("tabMaps");
const tabBuild = document.getElementById("tabBuild");
const tabUnknown = document.getElementById("tabUnknown");
const title = document.getElementById("title");
const heroActions = document.getElementById("heroActions");
const mapActions = document.getElementById("mapActions");
const buildActions = document.getElementById("buildActions");
const gate = document.getElementById("gate");
const board = document.getElementById("board");
const mapGate = document.getElementById("mapGate");
const mapBoard = document.getElementById("mapBoard");
const buildBoard = document.getElementById("buildBoard");
const unknownBoard = document.getElementById("unknownBoard");
const mapSizeInput = document.getElementById("mapSize");
const error = document.getElementById("error");

function modeTitle(mode) {
  const keys = {
    heroes: "modeHeroes",
    maps: "modeMaps",
    build: "modeBuild",
    unknown: "modeUnknown",
  };
  return t(keys[mode] || "modeHeroes");
}

export function startTabs() {
  tabHeroes.addEventListener("click", () => showTab("heroes"));
  tabMaps.addEventListener("click", () => showTab("maps"));
  tabBuild.addEventListener("click", () => showTab("build"));
  tabUnknown.addEventListener("click", () => showTab("unknown"));
  applyTab();
  loadCounted();
}

export function applyTab() {
  const mode = state.mode;
  tabHeroes.classList.toggle("is-on", mode === "heroes");
  tabMaps.classList.toggle("is-on", mode === "maps");
  tabBuild.classList.toggle("is-on", mode === "build");
  tabUnknown.classList.toggle("is-on", mode === "unknown");
  title.textContent = modeTitle(mode);
  heroActions.hidden = mode !== "heroes";
  mapActions.hidden = mode !== "maps";
  buildActions.hidden = mode !== "build";
  gate.hidden = mode !== "heroes" || state.heroReady;
  board.hidden = mode !== "heroes" || !state.heroReady;
  mapGate.hidden = mode !== "maps" || state.mapReady;
  mapBoard.hidden = mode !== "maps" || !state.mapReady;
  buildBoard.hidden = mode !== "build";
  unknownBoard.hidden = mode !== "unknown";
  placeRollButton("roll", "rollHome", "heroGateSlot", state.heroReady);
  placeRollButton("mapRoll", "mapRollHome", "mapGateSlot", state.mapReady);
  const statsWrap = document.getElementById("statsSourceWrap");
  if (statsWrap) {
    statsWrap.hidden = mode === "maps";
  }
  const dropEventsOpen = document.getElementById("dropEventsOpen");
  if (dropEventsOpen) {
    dropEventsOpen.hidden = mode === "maps" || mode === "unknown";
  }
  const minGamesWrap = document.getElementById("minGamesWrap");
  if (minGamesWrap) {
    minGamesWrap.hidden = mode !== "unknown";
  }
  if (mode === "unknown") {
    paintUnknown();
  }
  paintCounted();
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
    counted.textContent = t("countedMaps", {
      n: state.countedMaps,
      maps: countWord(state.countedMaps, t("mapOne"), t("mapFew"), t("mapMany")),
    });
    return;
  }
  const stats = chosenStats();
  if (!Number.isFinite(stats.counted)) {
    counted.textContent = "";
    return;
  }
  let text = t("countedHeroes", {
    n: stats.counted,
    heroes: countWord(stats.counted, t("heroOne"), t("heroFew"), t("heroMany")),
  });
  if (Number.isFinite(stats.matches)) {
    text += t("countedMatches", {
      n: stats.matches,
      matches: countWord(stats.matches, t("matchOne"), t("matchFew"), t("matchMany")),
    });
  }
  counted.textContent = text;
}
