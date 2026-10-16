import csv
import json
import os
import re
import time
import urllib.error
import urllib.request

from ttl_winrate import EXTRA, load_names, russian_name

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_PATH = os.path.join(ROOT, "documents", "процент-побед-unmatched-club.csv")
CACHE_PATH = os.path.join(ROOT, "documents", "unmatched-club-matchups.json")
PAGE = "https://www.the-unmatched.club/tools/matchups"
API = "https://www.the-unmatched.club/api/matchup"
PAUSE_SEC = 1.5
SKIP_KEYS = {"martian-invader", "mothman"}
EXTRA.update({
    "buffygiles": "Баффи",
    "buffyxander": "Баффи",
    "anniechristmas": "Энни Кристмас",
    "thewaywardsisters": "Вещие Сёстры",
})

HERO_RE = re.compile(
    r'id:\d+,name:"([^"]+)",attack:"[^"]*",startHealth:\d+,move:\d+,'
    r'specialAbility:"(?:\\.|[^"\\])*",createdAt:"[^"]+",i18n:\{[^}]*\},'
    r'sidekicks:\[[^\]]*\],key:"([^"]+)"'
)
KEY_NAMES = {
    "buffy-giles": "Buffy Giles",
    "buffy-xander": "Buffy Xander",
    "triss": "Triss",
    "yennefer": "Yennefer",
}
VARIANT_OF = {
    "buffy-giles": "buffy",
    "buffy-xander": "buffy",
    "yennefer": "yennefer-triss",
    "triss": "yennefer-triss",
}


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "RosetrUnmatched/1.0"})
    last = None
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                return resp.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as exc:
            last = exc
            time.sleep(3 * (attempt + 1))
        except urllib.error.URLError as exc:
            last = exc
            time.sleep(3 * (attempt + 1))
    raise SystemExit(f"Не открылось {url}: {last}")


def load_heroes():
    html = fetch(PAGE)
    found = HERO_RE.findall(html)
    heroes = [{"name": name, "key": key} for name, key in found if key not in SKIP_KEYS]
    heroes.sort(key=lambda hero: hero["name"].casefold())
    if len(heroes) < 70:
        raise SystemExit(f"В списке героев {len(heroes)}, страница разобрана не полностью")
    return heroes


def split_record(plays, win_rate):
    wins = int(plays * win_rate / 100 + 0.5)
    wins = max(0, min(plays, wins))
    return wins, plays - wins


def collect(heroes):
    cached = {}
    if os.path.exists(CACHE_PATH):
        with open(CACHE_PATH, encoding="utf-8") as handle:
            cached = json.load(handle).get("heroes", {})
    names = {hero["key"]: hero["name"] for hero in heroes}
    names.update(KEY_NAMES)
    for index, hero in enumerate(heroes, start=1):
        if hero["key"] in cached:
            print(f"{index}/{len(heroes)} {hero['key']} cache")
            continue
        time.sleep(PAUSE_SEC)
        payload = json.loads(fetch(f"{API}?h1={hero['key']}"))
        cached[hero["key"]] = payload.get("matchups") or {}
        with open(CACHE_PATH, "w", encoding="utf-8") as handle:
            json.dump({"heroes": cached}, handle, ensure_ascii=False)
        print(f"{index}/{len(heroes)} {hero['key']} {len(cached[hero['key']])}")
    return cached, names


def label(index, key, names, unknown):
    english = names.get(key, key)
    russian = russian_name(index, english)
    if russian:
        return russian
    unknown.add(english)
    return english


def write_csv(heroes, cached, names):
    index = load_names()
    order = {hero["key"]: hero["name"].casefold() for hero in heroes}
    pair = {}
    unknown = set()
    for hero in heroes:
        for opp_key, info in cached.get(hero["key"], {}).items():
            if opp_key in SKIP_KEYS or opp_key == hero["key"]:
                continue
            plays = int(info.get("plays") or 0)
            if plays <= 0:
                continue
            left = hero["key"]
            right = VARIANT_OF.get(opp_key, opp_key)
            if right in SKIP_KEYS or right == left:
                continue
            wins, losses = split_record(plays, float(info.get("winRate") or 0))
            if right not in order:
                hero_ru = label(index, left, names, unknown)
                opp_ru = label(index, opp_key, names, unknown)
            elif order[right] < order[left]:
                if opp_key == right:
                    continue
                hero_ru = label(index, right, names, unknown)
                opp_ru = label(index, left, names, unknown)
                wins, losses = losses, wins
            else:
                hero_ru = label(index, left, names, unknown)
                opp_ru = label(index, right, names, unknown)
            if hero_ru == opp_ru:
                continue
            bucket = pair.setdefault((hero_ru, opp_ru), {"wins": 0, "losses": 0})
            bucket["wins"] += wins
            bucket["losses"] += losses

    rows = []
    for (hero, opponent), info in pair.items():
        games = info["wins"] + info["losses"]
        percent = 100.0 * info["wins"] / games if games else 0
        rows.append((hero, opponent, info["wins"], info["losses"], games, f"{percent:.1f}"))
    rows.sort(key=lambda row: (row[0].lower(), -row[4], -row[2], row[1].lower()))
    with open(OUT_PATH, "w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.writer(handle, lineterminator="\r\n")
        writer.writerow(["Герой", "Соперник", "Победы", "Поражения", "Игры", "Процент побед"])
        writer.writerows(rows)
    print(f"rows {len(rows)} matches {sum(row[4] for row in rows)}")
    if unknown:
        print("unmapped")
        for name in sorted(unknown):
            print(name)


def main():
    heroes = load_heroes()
    print(f"heroes {len(heroes)} first {heroes[0]['name']}")
    cached, names = collect(heroes)
    write_csv(heroes, cached, names)


if __name__ == "__main__":
    main()
