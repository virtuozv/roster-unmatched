import csv
import json
import os
import re
import time
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROSTER_PATH = os.path.join(ROOT, "backend", "data", "roster.json")
OUT_PATH = os.path.join(ROOT, "documents", "процент-побед-tabletop-league.csv")
BASE_PATH = os.path.join(ROOT, "documents", "процент-побед.csv")
CLUB_PATH = os.path.join(ROOT, "documents", "процент-побед-unmatched-club.csv")
COMBINED_PATH = os.path.join(ROOT, "documents", "общий-процент-побед.csv")
CACHE_PATH = os.path.join(ROOT, "documents", "tabletop-league-games.json")

ACTION = "7f411d086ba1343c252945c3102ae5b220cc15e105"
URL = "https://www.tabletopleague.com/games/unmatched/matches"
GAME_SYSTEM = "7e7d8c1d-346b-417d-a338-a24d4ebe9df1"
PAGES = 50
PAGE_SIZE = 20
PAUSE_SEC = 1.2


def normalize(value):
    value = value.lower().replace("ё", "е")
    return re.sub(r"[^a-zа-я0-9]+", "", value)


def load_names():
    with open(ROSTER_PATH, encoding="utf-8") as handle:
        roster = json.load(handle)
    index = {}
    for character in roster["characters"]:
        labels = [character["name"], *character["aliases"]]
        for label in labels:
            index.setdefault(normalize(label), set()).add(character["name"])
    return index


EXTRA = {
    "anniechristmas": "Энни Кристмас",
    "thewaywardsisters": "Вещие Сёстры",
    "buffyxander": "Баффи",
    "buffygiles": "Баффи",
    "hellboy": "Хеллбой",
}


def russian_name(index, english):
    key = normalize(english)
    if key in EXTRA:
        return EXTRA[key]
    hits = index.get(key, set())
    if len(hits) == 1:
        return next(iter(hits))
    return None


def fetch_page(page):
    payload = {
        "game_system_id": GAME_SYSTEM,
        "page": page,
        "page_size": PAGE_SIZE,
        "with_count": page == 1,
    }
    body = json.dumps([payload]).encode()
    req = urllib.request.Request(
        URL,
        data=body,
        method="POST",
        headers={
            "Accept": "text/x-component",
            "Content-Type": "text/plain;charset=UTF-8",
            "Next-Action": ACTION,
            "User-Agent": "RosetrUnmatched/1.0 (public match stats)",
        },
    )
    last = None
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                raw = resp.read().decode("utf-8", "replace")
            break
        except urllib.error.HTTPError as exc:
            last = exc
            time.sleep(3 * (attempt + 1))
        except urllib.error.URLError as exc:
            last = exc
            time.sleep(3 * (attempt + 1))
    else:
        raise SystemExit(f"Страница {page} не открылась: {last}")
    for line in raw.splitlines():
        if line.startswith("1:"):
            parsed = json.loads(line[2:])
            if isinstance(parsed, dict) and parsed.get("data"):
                return parsed["data"]
            raise SystemExit(f"Страница {page}: неожиданный ответ {str(parsed)[:200]}")
    raise SystemExit(f"Страница {page}: в ответе нет данных")


def fighter_name(participant):
    fighter = participant.get("fighter") or {}
    if fighter.get("name"):
        return fighter["name"]
    fighters = participant.get("fighters") or []
    names = [item.get("name") for item in fighters if item.get("name")]
    if len(names) == 1:
        return names[0]
    return None


def game_result(game):
    sides = []
    for participant in game.get("participants") or []:
        name = fighter_name(participant)
        if not name:
            return None
        health = participant.get("end_health")
        sides.append({
            "name": name,
            "health": health,
            "winner": bool(participant.get("is_winner")),
        })
    if len(sides) != 2 or sides[0]["name"] == sides[1]["name"]:
        return None
    left, right = sides
    heart = [side for side in sides if isinstance(side["health"], (int, float)) and side["health"] > 0]
    skull = [side for side in sides if isinstance(side["health"], (int, float)) and side["health"] <= 0]
    if len(heart) == 1 and len(skull) == 1:
        return heart[0]["name"], skull[0]["name"]
    marked = [side for side in sides if side["winner"]]
    if len(marked) == 1:
        loser = right if marked[0] is left else left
        return marked[0]["name"], loser["name"]
    return None


def collect():
    if os.path.exists(CACHE_PATH):
        with open(CACHE_PATH, encoding="utf-8") as handle:
            cached = json.load(handle)
        print(f"кэш {len(cached['games'])} игр, страниц {cached['pages']}")
        return cached["games"], cached["skipped"]

    games = []
    seen = set()
    skipped = {"forfeit": 0, "no_result": 0, "duplicate": 0, "not_completed": 0}
    total = None
    for page in range(1, PAGES + 1):
        data = fetch_page(page)
        if page == 1:
            total = data.get("total")
            print(f"всего серий {total}, страница {data.get('page')} размер {data.get('page_size')}")
        series_list = data.get("series") or []
        added = 0
        for series in series_list:
            if series.get("status") != "COMPLETED":
                skipped["not_completed"] += len(series.get("games") or [])
                continue
            if series.get("is_forfeit"):
                skipped["forfeit"] += len(series.get("games") or [])
                continue
            for game in series.get("games") or []:
                game_id = game.get("id")
                if game_id and game_id in seen:
                    skipped["duplicate"] += 1
                    continue
                result = game_result(game)
                if not result:
                    skipped["no_result"] += 1
                    continue
                if game_id:
                    seen.add(game_id)
                winner, loser = result
                games.append({"id": game_id, "winner": winner, "loser": loser})
                added += 1
        print(f"страница {page}: серий {len(series_list)}, игр +{added}, всего {len(games)}")
        if len(series_list) < PAGE_SIZE:
            print("дальше страниц нет")
            break
        if page < PAGES:
            time.sleep(PAUSE_SEC)

    cached = {"pages": page, "total": total, "games": games, "skipped": skipped}
    with open(CACHE_PATH, "w", encoding="utf-8") as handle:
        json.dump(cached, handle, ensure_ascii=False)
    return games, skipped


def write_csv(games):
    index = load_names()
    unknown = {}
    pair = {}
    for game in games:
        winner = russian_name(index, game["winner"])
        loser = russian_name(index, game["loser"])
        if not winner:
            unknown[game["winner"]] = unknown.get(game["winner"], 0) + 1
            winner = game["winner"]
        if not loser:
            unknown[game["loser"]] = unknown.get(game["loser"], 0) + 1
            loser = game["loser"]
        bucket = pair.setdefault((winner, loser), {"wins": 0, "losses": 0})
        bucket["wins"] += 1
        other = pair.setdefault((loser, winner), {"wins": 0, "losses": 0})
        other["losses"] += 1

    rows = []
    for (hero, opponent), info in pair.items():
        games_n = info["wins"] + info["losses"]
        percent = 100.0 * info["wins"] / games_n if games_n else 0
        rows.append((hero, opponent, info["wins"], info["losses"], games_n, f"{percent:.1f}"))
    rows.sort(key=lambda row: (row[0].lower(), -row[4], -row[2], row[1].lower()))

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.writer(handle, lineterminator="\r\n")
        writer.writerow(["Герой", "Соперник", "Победы", "Поражения", "Игры", "Процент побед"])
        writer.writerows(rows)
    print(f"файл {OUT_PATH}")
    print(f"строк {len(rows)}, игр {len(games)}")
    if unknown:
        print("без русского имени:")
        for name, count in sorted(unknown.items(), key=lambda item: -item[1]):
            print(f"  {count}\t{name}")
    else:
        print("все герои сопоставлены")


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
    for key, info in read_pairs(BASE_PATH).items():
        add_pair(total, key[0], key[1], info["wins"], info["losses"])
    club = read_pairs(CLUB_PATH)
    for (hero, opponent), info in club.items():
        add_pair(total, hero, opponent, info["wins"], info["losses"])
        if (opponent, hero) not in club:
            add_pair(total, opponent, hero, info["losses"], info["wins"])
    rows = []
    uneven = 0
    for (hero, opponent), info in total.items():
        games_n = info["wins"] + info["losses"]
        if not games_n:
            continue
        other = total.get((opponent, hero))
        if not other or other["wins"] != info["losses"] or other["losses"] != info["wins"]:
            uneven += 1
        percent = 100.0 * info["wins"] / games_n
        rows.append((hero, opponent, info["wins"], info["losses"], games_n, f"{percent:.1f}"))
    rows.sort(key=lambda row: (row[0].lower(), -row[4], -row[2], row[1].lower()))
    with open(COMBINED_PATH, "w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.writer(handle, lineterminator="\r\n")
        writer.writerow(["Герой", "Соперник", "Победы", "Поражения", "Игры", "Процент побед"])
        writer.writerows(rows)
    played = sum(row[4] for row in rows) / 2
    print(f"общий файл {COMBINED_PATH}")
    print(f"строк {len(rows)}, игр {played:.0f}, несимметричных {uneven}")


def main():
    games, skipped = collect()
    print("пропуски", skipped)
    write_csv(games)
    combine_stats()


if __name__ == "__main__":
    main()
