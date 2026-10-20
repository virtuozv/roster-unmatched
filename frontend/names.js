import { getLang } from "./i18n.js";

const enByRu = new Map();

function pickEnglish(name, aliases) {
  const latin = [];
  for (const alias of aliases || []) {
    const token = String(alias || "").trim();
    if (!token || /^[A-Z]{2,4}$/.test(token)) {
      continue;
    }
    if (/[А-Яа-яЁё]/.test(token)) {
      continue;
    }
    latin.push(token);
  }
  if (!latin.length) {
    return name;
  }
  const folded = name.toLowerCase();
  if (folded.includes(" и ") || folded.includes(" & ")) {
    const paired = latin.filter((alias) => alias.includes("&") || alias.toLowerCase().includes(" and "));
    if (paired.length) {
      paired.sort((a, b) => b.length - a.length);
      return paired[0];
    }
  }
  let best = latin[0];
  for (const alias of latin.slice(1)) {
    if (alias.toLowerCase().includes(best.toLowerCase()) && alias.length > best.length) {
      best = alias;
    }
  }
  return best;
}

export function rememberHero(hero) {
  if (!hero || !hero.name) {
    return;
  }
  const english = hero.nameEn || pickEnglish(hero.name, hero.aliases || []);
  enByRu.set(hero.name, english);
}

export function rememberHeroes(list) {
  (list || []).forEach(rememberHero);
}

export function heroLabel(nameOrHero) {
  if (!nameOrHero) {
    return "";
  }
  if (typeof nameOrHero === "object") {
    rememberHero(nameOrHero);
    if (getLang() !== "en") {
      return nameOrHero.name;
    }
    return nameOrHero.nameEn || enByRu.get(nameOrHero.name) || pickEnglish(nameOrHero.name, nameOrHero.aliases || []);
  }
  if (getLang() !== "en") {
    return nameOrHero;
  }
  return enByRu.get(nameOrHero) || nameOrHero;
}
