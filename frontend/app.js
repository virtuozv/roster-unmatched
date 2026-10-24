import { refreshBuildSource, startBuild } from "./build.js";
import { bindDropEvents } from "./events.js";
import { boardShot, hasMapRoster, mapChoices, replaceMap, startMaps } from "./maps.js";
import { hasHeroRoster, heroChoices, portrait, refreshShownRoster, replaceHero, startHeroes } from "./heroes.js";
import { onLangChange, startI18n } from "./i18n.js";
import { bindReplace } from "./picker.js";
import { startRefreshStats } from "./refresh.js";
import { state } from "./state.js";
import { applyTab, paintCounted, startTabs } from "./tabs.js";
import { startUnknown } from "./unknown.js";

startI18n();
bindReplace({
  heroReady: hasHeroRoster,
  mapReady: hasMapRoster,
  heroChoices,
  mapChoices,
  heroShot: (hero) => portrait(hero.image, hero.name),
  mapShot: boardShot,
  replaceHero,
  replaceMap,
});
startHeroes();
startMaps();
startBuild();
startUnknown();
startRefreshStats();
startTabs();
onLangChange(() => {
  applyTab();
});

document.getElementById("statsSource").addEventListener("change", () => {
  state.statsSource = document.getElementById("statsSource").value;
  paintCounted();
  refreshShownRoster();
  refreshBuildSource();
});
bindDropEvents(() => {
  refreshShownRoster();
  refreshBuildSource();
});
