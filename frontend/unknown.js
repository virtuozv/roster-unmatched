import { countWord } from "./format.js";
import { t } from "./i18n.js";
import { heroLabel, rememberHeroes } from "./names.js";
import { state } from "./state.js";

const board = document.getElementById("unknownBoard");
const note = document.getElementById("unknownNote");
const roster = document.getElementById("unknownRoster");
const error = document.getElementById("error");

let requestId = 0;
let heroes = [];
let floor = 5;

export function startUnknown() {
  document.getElementById("minGames").addEventListener("input", () => {
    if (state.mode === "unknown") {
      loadUnknown();
    }
  });
  document.getElementById("statsSource").addEventListener("change", () => {
    if (state.mode === "unknown") {
      loadUnknown();
    }
  });
}

export function paintUnknown() {
  state.unknownReady = true;
  clearUnknownEdges();
  loadUnknown();
}

async function loadUnknown() {
  const ticket = ++requestId;
  error.hidden = true;
  const source = document.getElementById("statsSource").value;
  const minGames = readMinGames();
  try {
    const response = await fetch(
      "/api/unknown?source=" + encodeURIComponent(source) + "&minGames=" + encodeURIComponent(minGames)
    );
    const payload = await response.json();
    if (ticket !== requestId) {
      return;
    }
    if (!response.ok) {
      throw new Error(payload.error || t("errUnknown"));
    }
    heroes = payload.heroes || [];
    rememberHeroes(heroes);
    floor = gameFloor(payload.minGames);
    paintUnknownNote();
    paintCards();
  } catch (err) {
    if (ticket !== requestId) {
      return;
    }
    error.hidden = false;
    error.textContent = err.message;
  }
}

function paintUnknownNote() {
  note.textContent = t("unknownShown", {
    n: floor,
    matches: countWord(floor, t("matchOne"), t("matchFew"), t("matchMany")),
    heroes: heroes.length,
    heroWord: countWord(heroes.length, t("heroOne"), t("heroFew"), t("heroMany")),
  });
}

function paintCards() {
  roster.replaceChildren();
  heroes.forEach((hero) => {
    const item = document.createElement("li");
    item.dataset.hero = hero.name;
    const shot = document.createElement("div");
    shot.className = "shot";
    shot.append(portrait(hero.image, hero));
    const mark = document.createElement("span");
    mark.className = "mark";
    mark.textContent = String(hero.count);
    mark.title = t("unknownMark", {
      count: hero.count,
      missing: hero.missing || 0,
      thin: hero.thin || 0,
    });
    shot.append(mark);
    item.append(shot);
    const name = document.createElement("p");
    name.className = "name";
    name.textContent = heroLabel(hero);
    item.append(name);
    item.addEventListener("mouseenter", () => showUnknownEdge(item, hero));
    item.addEventListener("mouseleave", () => clearUnknownEdges());
    roster.append(item);
  });
}

function showUnknownEdge(card, hero) {
  clearUnknownEdges();
  card.classList.add("is-focus");
  const tip = document.createElement("div");
  tip.id = "unknownTip";
  tip.className = "unknown-tip";
  const title = document.createElement("p");
  title.className = "unknown-tip-title";
  title.textContent = heroLabel(hero) + " · "
    + hero.count + " " + countWord(hero.count, t("opponents"), t("opponentsFew"), t("opponentsMany"));
  tip.append(title);
  const box = document.createElement("div");
  box.className = "unknown-opponents";
  (hero.unknown || []).forEach((opponent) => {
    const line = document.createElement("p");
    line.className = "unknown-opponent";
    const label = heroLabel(opponent);
    if (opponent.kind === "missing") {
      line.textContent = label;
    } else {
      line.textContent = label + " · " + opponent.games;
    }
    box.append(line);
  });
  tip.append(box);
  document.body.append(tip);
  placeTip(tip, card, (hero.unknown || []).length, box);
}

function placeTip(tip, card, count, box) {
  const pad = 12;
  const line = 20;
  const chrome = 56;
  const rows = Math.max(1, Math.floor((window.innerHeight - pad * 2 - chrome) / line));
  box.style.gridTemplateRows = "repeat(" + rows + ", auto)";
  tip.style.left = "0px";
  tip.style.top = pad + "px";
  tip.style.maxWidth = window.innerWidth - pad * 2 + "px";
  const tipRect = tip.getBoundingClientRect();
  const rect = card.getBoundingClientRect();
  let left = rect.right + 10;
  if (left + tipRect.width > window.innerWidth - pad) {
    left = rect.left - tipRect.width - 10;
  }
  left = Math.min(Math.max(pad, left), Math.max(pad, window.innerWidth - tipRect.width - pad));
  let top = Math.min(rect.top, window.innerHeight - tipRect.height - pad);
  top = Math.max(pad, top);
  tip.style.left = left + "px";
  tip.style.top = top + "px";
}

function clearUnknownEdges() {
  for (const card of roster.querySelectorAll("[data-hero]")) {
    card.classList.remove("is-focus");
  }
  const tip = document.getElementById("unknownTip");
  if (tip) {
    tip.remove();
  }
}

function portrait(src, hero) {
  const label = heroLabel(hero);
  const image = document.createElement("img");
  if (src) {
    image.src = src;
  }
  image.alt = label;
  image.title = label;
  return image;
}

function readMinGames() {
  const input = document.getElementById("minGames");
  const value = Math.round(Number(input && input.value));
  if (!Number.isFinite(value)) {
    return 5;
  }
  return Math.min(40, Math.max(0, value));
}

function gameFloor(value) {
  const games = Math.round(Number(value));
  if (!Number.isFinite(games) || games < 0) {
    return 5;
  }
  return games;
}
