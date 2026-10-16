const menu = document.getElementById("menu");
const menuReplace = document.getElementById("menuReplace");
const picker = document.getElementById("picker");
const pickerTitle = document.getElementById("pickerTitle");
const pickerSearch = document.getElementById("pickerSearch");
const pickerList = document.getElementById("pickerList");
const pickerClose = document.getElementById("pickerClose");

let replaceName = null;
let replaceMode = "hero";
let actions = {};
let choose = null;

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
}

export function openChoose(options) {
  choose = options;
  replaceMode = "choose";
  replaceName = null;
  closeMenu();
  pickerTitle.textContent = options.title;
  pickerSearch.placeholder = options.placeholder || "Имя героя";
  pickerSearch.value = "";
  renderPicker("");
  picker.hidden = false;
  pickerSearch.focus();
}

export function replaceTarget() {
  return replaceName;
}

function openPicker() {
  choose = null;
  const ready = replaceMode === "map" ? actions.mapReady() : actions.heroReady();
  if (!ready || !replaceName) {
    return;
  }
  closeMenu();
  pickerTitle.textContent = "Заменить " + replaceName;
  pickerSearch.placeholder = replaceMode === "map" ? "Название карты" : "Имя героя";
  pickerSearch.value = "";
  renderPicker("");
  picker.hidden = false;
  pickerSearch.focus();
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
      clear.textContent = "Убрать";
      clear.addEventListener("click", () => {
        const drop = choose.onClear;
        closePicker();
        drop();
      });
      pickerList.append(clear);
    }
    for (const hero of choose.choices(needle)) {
      const button = document.createElement("button");
      button.type = "button";
      button.append(choose.shot(hero));
      const label = document.createElement("span");
      label.textContent = hero.name;
      button.append(label);
      button.addEventListener("click", () => {
        const pick = choose.onPick;
        closePicker();
        pick(hero.name);
      });
      pickerList.append(button);
    }
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
    label.textContent = hero.name;
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
});
