import { onLangChange, t } from "./i18n.js";

const EVENTS_KEY = "dropEvents";
const modal = document.getElementById("eventsModal");
const openButton = document.getElementById("dropEventsOpen");
const closeButton = document.getElementById("eventsModalClose");
const recentList = document.getElementById("eventsRecentList");
const allList = document.getElementById("eventsAllList");

let changeHandler = null;
let ready = false;
const selected = new Set();

export function selectedEvents() {
  return [...selected];
}

function readStoredEvents() {
  try {
    const raw = localStorage.getItem(EVENTS_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return null;
    }
    return parsed.filter((name) => typeof name === "string" && name);
  } catch (_err) {
    return null;
  }
}

function writeStoredEvents() {
  localStorage.setItem(EVENTS_KEY, JSON.stringify([...selected]));
}

export function bindDropEvents(handler) {
  changeHandler = handler;
  loadEventFilters();
  if (openButton) {
    openButton.addEventListener("click", openModal);
  }
  if (closeButton) {
    closeButton.addEventListener("click", closeModal);
  }
  if (modal) {
    modal.addEventListener("click", (event) => {
      if (event.target === modal) {
        closeModal();
      }
    });
  }
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modal && !modal.hidden) {
      closeModal();
    }
  });
  onLangChange(() => {
    if (allList && !allList.childElementCount) {
      const empty = allList.querySelector(".event-exclude-empty");
      if (empty) {
        empty.textContent = t("noTournaments");
      }
    }
  });
}

export function fromDroppedEvent(hero) {
  if (!selected.size) {
    return false;
  }
  return (hero.events || hero.recent || []).some((label) => {
    if (selected.has(label)) {
      return true;
    }
    if (typeof label === "string" && label.includes(" / ")) {
      return selected.has(label.split(" / ", 1)[0].trim());
    }
    return false;
  });
}

function openModal() {
  if (!modal) {
    return;
  }
  modal.hidden = false;
}

function closeModal() {
  if (!modal) {
    return;
  }
  modal.hidden = true;
}

function notifyChange() {
  if (ready) {
    writeStoredEvents();
  }
  paintEventCount();
  if (changeHandler) {
    changeHandler();
  }
}

function loadEventFilters() {
  if (!recentList || !allList) {
    return Promise.resolve();
  }
  return fetch("/api/events")
    .then((response) => response.json())
    .then((payload) => {
      const recent = payload.recent || [];
      const events = payload.events || [];
      const recentSet = new Set(recent);
      const known = new Set([...recent, ...events]);
      if (!ready) {
        const stored = readStoredEvents();
        if (stored) {
          stored.forEach((name) => {
            if (known.has(name)) {
              selected.add(name);
            }
          });
        } else {
          recent.forEach((name) => selected.add(name));
        }
        ready = true;
        writeStoredEvents();
      }
      paintChecks(recentList, recent);
      paintChecks(allList, events.filter((name) => !recentSet.has(name)));
      const recentSection = recentList.closest(".events-section");
      if (recentSection) {
        recentSection.classList.add("is-recent");
      }
      notifyChange();
    })
    .catch(() => {
      recentList.replaceChildren();
      allList.replaceChildren();
      const empty = document.createElement("p");
      empty.className = "event-exclude-empty";
      empty.textContent = t("noTournaments");
      allList.append(empty);
    });
}

function paintChecks(host, names) {
  host.replaceChildren();
  if (!names.length) {
    const empty = document.createElement("p");
    empty.className = "event-exclude-empty";
    empty.textContent = t("noTournaments");
    host.append(empty);
    return;
  }
  names.forEach((name) => {
    const label = document.createElement("label");
    label.className = "check";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = name;
    input.checked = selected.has(name);
    input.addEventListener("change", () => {
      if (input.checked) {
        selected.add(name);
      } else {
        selected.delete(name);
      }
      notifyChange();
    });
    const text = document.createElement("span");
    text.textContent = name;
    label.append(input, text);
    host.append(label);
  });
}

function paintEventCount() {
  const badge = document.getElementById("dropEventsCount");
  if (!badge) {
    return;
  }
  const count = selected.size;
  badge.hidden = count === 0;
  badge.textContent = count ? String(count) : "";
}
