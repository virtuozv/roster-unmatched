import { t } from "./i18n.js";

const button = document.getElementById("refreshStats");
const wrap = document.getElementById("refreshStatsProgress");
const bar = document.getElementById("refreshStatsBar");
const label = document.getElementById("refreshStatsLabel");

let polling = null;

function paint(state) {
  if (!wrap || !bar || !label) {
    return;
  }
  const active = Boolean(state.running);
  wrap.hidden = !active && !state.finished;
  if (button) {
    button.disabled = active;
  }
  const percent = Number(state.percent) || 0;
  bar.value = percent;
  const parts = [state.label, state.detail].filter(Boolean);
  label.textContent = parts.length ? parts.join(" · ") : percent + "%";
}

async function readStatus() {
  const response = await fetch("/api/stats/refresh");
  if (!response.ok) {
    throw new Error("status " + response.status);
  }
  return response.json();
}

function stopPolling() {
  if (polling) {
    clearInterval(polling);
    polling = null;
  }
}

async function tick() {
  try {
    const state = await readStatus();
    paint(state);
    if (state.running) {
      return;
    }
    stopPolling();
    if (state.error) {
      if (button) {
        button.disabled = false;
      }
      label.textContent = state.error;
      wrap.hidden = false;
      return;
    }
    if (state.finished) {
      location.reload();
    }
  } catch (error) {
    stopPolling();
    if (button) {
      button.disabled = false;
    }
    wrap.hidden = false;
    label.textContent = t("refreshStatsError");
  }
}

async function startRefresh() {
  if (!button) {
    return;
  }
  button.disabled = true;
  wrap.hidden = false;
  bar.value = 0;
  label.textContent = t("refreshStats");
  try {
    const response = await fetch("/api/stats/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    const state = await response.json();
    if (response.status === 409) {
      paint(state);
      if (!polling) {
        polling = setInterval(tick, 700);
      }
      return;
    }
    if (!response.ok) {
      throw new Error(state.error || "start failed");
    }
    paint(state);
    stopPolling();
    polling = setInterval(tick, 700);
  } catch (error) {
    button.disabled = false;
    wrap.hidden = false;
    label.textContent = t("refreshStatsError");
  }
}

export function startRefreshStats() {
  if (!button) {
    return;
  }
  button.addEventListener("click", () => {
    startRefresh();
  });
  readStatus()
    .then((state) => {
      if (state.running) {
        paint(state);
        polling = setInterval(tick, 700);
      }
    })
    .catch(() => {});
}
