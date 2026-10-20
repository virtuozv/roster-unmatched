import { selectedEvents } from "./events.js";
import { getLang, onLangChange, t } from "./i18n.js";
import { closeMenu, closePicker, openMenu, replaceTarget } from "./picker.js";
import { state } from "./state.js";
import { applyTab } from "./tabs.js";

const mapRollButton = document.getElementById("mapRoll");
const mapSizeInput = document.getElementById("mapSize");
const mapOverlapInput = document.getElementById("mapOverlap");
const mapRoster = document.getElementById("mapRoster");
const mapExcluded = document.getElementById("mapExcluded");
const mapNote = document.getElementById("mapNote");
const error = document.getElementById("error");

let mapPayload = null;

export function hasMapRoster() {
  return !!mapPayload;
}

export function mapChoices(needle) {
  if (!mapPayload) {
    return [];
  }
  const taken = new Set((mapPayload.maps || []).map((item) => item.name));
  return (mapPayload.catalog || []).filter((item) => {
    if (taken.has(item.name)) {
      return false;
    }
    if (!needle) {
      return true;
    }
    const haystack = (item.name + " " + (item.aliases || []).join(" ")).toLowerCase().replaceAll("ё", "е");
    return haystack.includes(needle);
  });
}

export function mapSettings() {
  const total = Number.isFinite(state.countedMaps) ? state.countedMaps : 34;
  let size = Math.round(Number(mapSizeInput.value));
  if (!Number.isFinite(size)) {
    size = 12;
  }
  size = Math.min(total, Math.max(2, size));
  let overlap = Math.round(Number(mapOverlapInput.value));
  if (!Number.isFinite(overlap)) {
    overlap = 3;
  }
  overlap = Math.min(size, Math.max(0, overlap));
  return { size, overlap, dropEvents: selectedEvents(), lang: getLang() };
}

export function startMaps() {
  mapSizeInput.value = "12";
  mapRollButton.addEventListener("click", async () => {
    error.hidden = true;
    mapRollButton.disabled = true;
    try {
      const response = await fetch("/api/maps/roll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mapSettings()),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || t("errRoll"));
      }
      showMapRoster(payload);
    } catch (err) {
      error.hidden = false;
      error.textContent = err.message;
    } finally {
      mapRollButton.disabled = false;
      paintMapRollLabel();
    }
  });
  onLangChange(() => {
    paintMapRollLabel();
  });
}

function paintMapRollLabel() {
  if (mapRollButton.disabled) {
    return;
  }
  mapRollButton.textContent = state.mapReady ? t("anotherRoster") : t("roll");
}

export async function replaceMap(name) {
  const removed = replaceTarget();
  if (!mapPayload || !removed || removed === name) {
    return;
  }
  error.hidden = true;
  document.querySelectorAll("#pickerList button").forEach((button) => {
    button.disabled = true;
  });
  try {
    const response = await fetch("/api/maps/swap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...mapSettings(),
        roster: mapPayload.maps.map((item) => item.name),
        remove: removed,
        add: name,
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || t("errReplaceMap"));
    }
    showMapRoster(payload);
  } catch (err) {
    error.hidden = false;
    error.textContent = err.message;
    closePicker();
  }
}

function showMapRoster(payload) {
  closeMenu();
  closePicker();
  mapPayload = payload;
  state.mapReady = true;
  applyTab();
  mapNote.textContent = payload.notes && payload.notes.length ? payload.notes[0] : "";
  mapRoster.replaceChildren();
  for (const item of payload.maps || []) {
    mapRoster.append(mapCard(item, true));
  }
  mapExcluded.replaceChildren();
  const excluded = payload.excluded || [];
  if (!excluded.length) {
    const empty = document.createElement("li");
    empty.className = "text-card";
    const line = document.createElement("p");
    line.className = "local";
    line.textContent = selectedEvents().length
      ? t("mapsAllIn")
      : t("mapsNoneExcluded");
    empty.append(line);
    mapExcluded.append(empty);
  }
  for (const item of excluded) {
    mapExcluded.append(mapCard(item, false));
  }
}

export function boardShot(item) {
  const aliases = item.aliases && item.aliases.length ? ", " + item.aliases.join(", ") : "";
  if (!item.image) {
    const blank = document.createElement("div");
    blank.className = "board-missing";
    blank.textContent = item.name;
    blank.title = item.name + aliases;
    return blank;
  }
  const image = document.createElement("img");
  image.className = "board";
  image.src = item.image;
  image.alt = item.name;
  image.title = item.name + aliases;
  return image;
}

function mapCard(item, clickable) {
  const card = document.createElement("li");
  if (clickable && item.recent && item.recent.length) {
    card.classList.add("is-repeat");
  }
  card.append(boardShot(item));
  const name = document.createElement("p");
  name.className = "name";
  name.textContent = item.name;
  const why = document.createElement("p");
  why.className = "why";
  why.textContent = item.reason;
  card.append(name, why);
  if (clickable) {
    card.addEventListener("click", (event) => {
      event.stopPropagation();
      openMenu(event, item.name, "map");
    });
  }
  return card;
}
