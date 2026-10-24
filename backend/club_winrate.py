import csv
import json
import os
import re
import time
import urllib.error
import urllib.request

from constants import STATS_FILES
from names_map import EXTRA, load_names, russian_name

PAGE = "https://www.the-unmatched.club/tools/matchups"
API = "https://www.the-unmatched.club/api/matchup"
PAUSE_SEC = 0.8
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

CLUB_SOURCES = (
    {
        "api": "tabletopleague",
        "label": "UmLeague",
        "path": STATS_FILES["umleague"],
    },
    {
        "api": "unmatchedru",
        "label": "Саския",
        "path": STATS_FILES["saskia"],
    },
)


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Matchdraft/1.0"})
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
    raise RuntimeError(f"Не открылось {url}: {last}")


def load_heroes():
    html = fetch(PAGE)
    found = HERO_RE.findall(html)
    heroes = [{"name": name, "key": key} for name, key in found if key not in SKIP_KEYS]
    heroes.sort(key=lambda hero: hero["name"].casefold())
    if len(heroes) < 70:
        raise RuntimeError(f"В списке героев {len(heroes)}, страница разобрана не полностью")
    return heroes


def split_record(plays, win_rate):
    wins = int(plays * win_rate / 100 + 0.5)
    wins = max(0, min(plays, wins))
    return wins, plays - wins


def collect_source(heroes, source_key, on_progress=None):
    names = {hero["key"]: hero["name"] for hero in heroes}
    names.update(KEY_NAMES)
    cached = {}
    total = len(heroes)
    for index, hero in enumerate(heroes, start=1):
        if on_progress:
            on_progress(index - 1, total, hero["name"])
        time.sleep(PAUSE_SEC)
        url = f"{API}?h1={hero['key']}&source={source_key}"
        payload = json.loads(fetch(url))
        matchups = dict(payload.get("matchups") or {})
        for key, info in (payload.get("additionalMatchups") or {}).items():
            if key not in matchups:
                matchups[key] = info
        cached[hero["key"]] = matchups
        if on_progress:
            on_progress(index, total, hero["name"])
    return cached, names


def label(index, key, names, unknown):
    english = names.get(key, key)
    russian = russian_name(index, english)
    if russian:
        return russian
    unknown.add(english)
    return english


def write_csv(path, heroes, cached, names):
    """Пишем обе стороны пары; при конфликте берём запись с большим числом игр."""
    index = load_names()
    pair = {}
    unknown = set()
    for hero in heroes:
        for opp_key, info in cached.get(hero["key"], {}).items():
            if opp_key in SKIP_KEYS or opp_key == hero["key"]:
                continue
            plays = int(info.get("plays") or 0)
            if plays <= 0:
                continue
            right = VARIANT_OF.get(opp_key, opp_key)
            if right in SKIP_KEYS or right == hero["key"]:
                continue
            wins, losses = split_record(plays, float(info.get("winRate") or 0))
            hero_ru = label(index, hero["key"], names, unknown)
            opp_ru = label(index, right if right in names else opp_key, names, unknown)
            if hero_ru == opp_ru:
                continue
            bucket = pair.setdefault((hero_ru, opp_ru), {"wins": 0, "losses": 0})
            if plays >= bucket["wins"] + bucket["losses"]:
                bucket["wins"] = wins
                bucket["losses"] = losses

    for (hero, opponent), info in list(pair.items()):
        if (opponent, hero) in pair:
            continue
        pair[(opponent, hero)] = {"wins": info["losses"], "losses": info["wins"]}

    rows = []
    for (hero, opponent), info in pair.items():
        games = info["wins"] + info["losses"]
        percent = 100.0 * info["wins"] / games if games else 0
        rows.append((hero, opponent, info["wins"], info["losses"], games, f"{percent:.1f}"))
    rows.sort(key=lambda row: (row[0].lower(), -row[4], -row[2], row[1].lower()))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.writer(handle, lineterminator="\r\n")
        writer.writerow(["Герой", "Соперник", "Победы", "Поражения", "Игры", "Процент побед"])
        writer.writerows(rows)
    return len(rows), unknown


def read_pairs(path):
    pairs = {}
    with open(path, newline="", encoding="utf-8-sig") as handle:
        for row in csv.DictReader(handle):
            key = (row["Герой"], row["Соперник"])
            bucket = pairs.setdefault(key, {"wins": 0, "losses": 0})
            bucket["wins"] += int(row["Победы"])
            bucket["losses"] += int(row["Поражения"])
    return pairs


def add_pair(total, hero, opponent, wins, losses):
    if hero == opponent or not wins + losses:
        return
    bucket = total.setdefault((hero, opponent), {"wins": 0, "losses": 0})
    bucket["wins"] += wins
    bucket["losses"] += losses


def combine_stats():
    total = {}
    for path in (STATS_FILES["saskia"], STATS_FILES["umleague"]):
        pairs = read_pairs(path)
        for (hero, opponent), info in pairs.items():
            add_pair(total, hero, opponent, info["wins"], info["losses"])
            if (opponent, hero) not in pairs:
                add_pair(total, opponent, hero, info["losses"], info["wins"])
    rows = []
    for (hero, opponent), info in total.items():
        games_n = info["wins"] + info["losses"]
        if not games_n:
            continue
        percent = 100.0 * info["wins"] / games_n
        rows.append((hero, opponent, info["wins"], info["losses"], games_n, f"{percent:.1f}"))
    rows.sort(key=lambda row: (row[0].lower(), -row[4], -row[2], row[1].lower()))
    path = STATS_FILES["all"]
    with open(path, "w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.writer(handle, lineterminator="\r\n")
        writer.writerow(["Герой", "Соперник", "Победы", "Поражения", "Игры", "Процент побед"])
        writer.writerows(rows)
    return len(rows)


def refresh_all(on_progress=None):
    """Только the-unmatched.club: Tabletop League → UmLeague, UnmatchedRU → Саския, затем Всего."""
    heroes = load_heroes()
    hero_total = len(heroes)
    source_total = len(CLUB_SOURCES)
    step_total = hero_total * source_total + 1

    def report(done, label, detail=""):
        if on_progress:
            on_progress({
                "done": done,
                "total": step_total,
                "percent": int(100 * done / step_total) if step_total else 100,
                "label": label,
                "detail": detail,
            })

    report(0, "Герои", f"{hero_total}")
    for source_index, source in enumerate(CLUB_SOURCES):
        base_done = source_index * hero_total

        def source_progress(current, total, name, _base=base_done, _label=source["label"]):
            report(_base + current, _label, f"{current}/{total} {name}")

        cached, names = collect_source(heroes, source["api"], on_progress=source_progress)
        rows, unknown = write_csv(source["path"], heroes, cached, names)
        if unknown:
            print(source["label"], "unmapped", ", ".join(sorted(unknown)))
        print(source["label"], "rows", rows)

    report(hero_total * source_total, "Объединение")
    combined = combine_stats()
    report(step_total, "Готово", f"строк {combined}")
    return {"heroes": hero_total, "combined": combined}


def main():
    def show(progress):
        print(f"{progress['percent']}% {progress['label']} {progress.get('detail') or ''}".rstrip())

    result = refresh_all(on_progress=show)
    print("heroes", result["heroes"], "combined", result["combined"])


if __name__ == "__main__":
    main()
