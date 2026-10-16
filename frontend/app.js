import { refreshBuildSource, startBuild } from "./build.js";
import { bindDropEvents } from "./events.js";
import { boardShot, hasMapRoster, mapChoices, replaceMap, startMaps } from "./maps.js";
import { hasHeroRoster, heroChoices, portrait, refreshShownRoster, replaceHero, startHeroes } from "./heroes.js";
import { bindReplace } from "./picker.js";
import { state } from "./state.js";
import { paintCounted, startTabs } from "./tabs.js";

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
startTabs();

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
