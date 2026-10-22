import { onLangChange, t } from "./i18n.js";
import { heroLabel } from "./names.js";

const menu = document.getElementById("menu");
const menuReplace = document.getElementById("menuReplace");
const picker = document.getElementById("picker");
const pickerTitle = document.getElementById("pickerTitle");
const pickerSearch = document.getElementById("pickerSearch");
const pickerList = document.getElementById("pickerList");
const pickerAdd = document.getElementById("pickerAdd");
const pickerClearAll = document.getElementById("pickerClearAll");
const pickerClose = document.getElementById("pickerClose");

let replaceName = null;
let replaceMode = "hero";
let actions = {};
let choose = null;
const selected = new Set();

export function bindReplace(next) {
  actions = next;
}

export function openMenu(event, name, mode) {
  replaceName = name;
  replaceMode = mode;
  menu.hidden = false;
  const width = 140;
  const height = 44;
  menu.style.left = Math.max(8, Math.min(event.clientX, window.innerWidth - width - 8)) + "px";
  menu.style.top = Math.max(8, Math.min(event.clientY, window.innerHeight - height - 8)) + "px";
}

export function closeMenu() {
  menu.hidden = true;
}

export function closePicker() {
  picker.hidden = true;
  replaceName = null;
  choose = null;
  selected.clear();
  syncAddButton();
}

export function openChoose(options) {
  choose = options;
  replaceMode = "choose";
  replaceName = null;
  selected.clear();
  closeMenu();
  pickerTitle.textContent = options.title;
  pickerSearch.placeholder = options.placeholder || t("searchHero");
  pickerSearch.value = "";
  renderPicker("");
  syncAddButton();
  picker.hidden = false;
  pickerSearch.focus();
}

export function replaceTarget() {
  return replaceName;
}

function multiChoose() {
  return Boolean(choose && choose.multi && choose.onPickMany);
}

function syncAddButton() {
  const multi = multiChoose();
  if (pickerClearAll) {
    pickerClearAll.hidden = !multi;
    pickerClearAll.disabled = !multi || selected.size === 0;
    pickerClearAll.textContent = t("clearAll");
  }
  if (pickerAdd) {
    pickerAdd.hidden = !multi;
    pickerAdd.disabled = !multi || selected.size === 0;
    pickerAdd.textContent = multi && selected.size
      ? t("add") + " (" + selected.size + ")"
      : t("add");
  }
}

function clearSelection() {
  if (!multiChoose() || !selected.size) {
    return;
  }
  selected.clear();
  pickerList.querySelectorAll("button.is-selected").forEach((button) => {
    button.classList.remove("is-selected");
  });
  syncAddButton();
}

function openPicker() {
  choose = null;
  selected.clear();
  const ready = replaceMode === "map" ? actions.mapReady() : actions.heroReady();
  if (!ready || !replaceName) {
    return;
  }
  closeMenu();
  pickerTitle.textContent = t("replaceNamed", {
    name: replaceMode === "map" ? replaceName : heroLabel(replaceName),
  });
  pickerSearch.placeholder = replaceMode === "map" ? t("searchMap") : t("searchHero");
  pickerSearch.value = "";
  renderPicker("");
  syncAddButton();
  picker.hidden = false;
  pickerSearch.focus();
}

function commitSelection() {
  if (!multiChoose() || !selected.size) {
    return;
  }
  const names = [...selected];
  const pickMany = choose.onPickMany;
  closePicker();
  pickMany(names);
}

function renderPicker(query) {
  pickerList.replaceChildren();
  pickerList.classList.toggle("is-board", replaceMode === "map");
  const needle = query.trim().toLowerCase().replaceAll("ё", "е");
  if (replaceMode === "choose" && choose) {
    if (choose.onClear) {
      const clear = document.createElement("button");
      clear.type = "button";
      clear.className = "picker-clear";
      clear.textContent = t("remove");
      clear.addEventListener("click", () => {
        const drop = choose.onClear;
        closePicker();
        drop();
      });
      pickerList.append(clear);
    }
    const multi = multiChoose();
    for (const hero of choose.choices(needle)) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.name = hero.name;
      button.append(choose.shot(hero));
      const label = document.createElement("span");
      label.textContent = heroLabel(hero);
      button.append(label);
      if (multi && selected.has(hero.name)) {
        button.classList.add("is-selected");
      }
      button.addEventListener("click", () => {
        if (multi) {
          if (selected.has(hero.name)) {
            selected.delete(hero.name);
            button.classList.remove("is-selected");
          } else {
            selected.add(hero.name);
            button.classList.add("is-selected");
          }
          syncAddButton();
          return;
        }
        const pick = choose.onPick;
        closePicker();
        pick(hero.name);
      });
      pickerList.append(button);
    }
    syncAddButton();
    return;
  }
  if (replaceMode === "map") {
    for (const item of actions.mapChoices(needle)) {
      const button = document.createElement("button");
      button.type = "button";
      button.append(actions.mapShot(item));
      const label = document.createElement("span");
      label.textContent = item.name;
      button.append(label);
      button.addEventListener("click", () => actions.replaceMap(item.name));
      pickerList.append(button);
    }
    return;
  }
  for (const hero of actions.heroChoices(needle)) {
    const button = document.createElement("button");
    button.type = "button";
    button.append(actions.heroShot(hero));
    const label = document.createElement("span");
    label.textContent = heroLabel(hero);
    button.append(label);
    button.addEventListener("click", () => actions.replaceHero(hero.name));
    pickerList.append(button);
  }
}

document.addEventListener("click", (event) => {
  if (menu.hidden || menu.contains(event.target)) {
    return;
  }
  closeMenu();
});

menuReplace.addEventListener("click", (event) => {
  event.stopPropagation();
  openPicker();
});

pickerClose.addEventListener("click", closePicker);
pickerClearAll.addEventListener("click", clearSelection);
pickerAdd.addEventListener("click", commitSelection);

picker.addEventListener("click", (event) => {
  if (event.target === picker) {
    closePicker();
  }
});

pickerSearch.addEventListener("input", () => {
  renderPicker(pickerSearch.value);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeMenu();
    closePicker();
  }
  if (event.key === "Enter" && !picker.hidden && multiChoose() && selected.size) {
    event.preventDefault();
    commitSelection();
  }
});

onLangChange(() => {
  if (!picker.hidden && replaceMode === "choose" && choose) {
    pickerTitle.textContent = choose.title;
    pickerSearch.placeholder = choose.placeholder || t("searchHero");
    renderPicker(pickerSearch.value);
  } else if (!picker.hidden && replaceName) {
    pickerTitle.textContent = t("replaceNamed", {
      name: replaceMode === "map" ? replaceName : heroLabel(replaceName),
    });
    pickerSearch.placeholder = replaceMode === "map" ? t("searchMap") : t("searchHero");
    renderPicker(pickerSearch.value);
  }
  syncAddButton();
});
