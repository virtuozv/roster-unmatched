import csv
import json
import os
import re
from urllib.parse import quote

from constants import DATA_DIR, IMAGE_DIR, IMAGE_OVERRIDES, RECENT_FILES, ROSTER_PATH, STATS_FILES, STATS_PATH


def short_code(character):
    codes = [alias for alias in character["aliases"] if re.fullmatch(r"[A-Z]{2,4}", alias)]
    if not codes:
        return character["name"][:3]
    codes.sort(key=lambda code: (abs(len(code) - 3), len(code)))
    return codes[0]


def normalize_label(value):
    value = value.lower().replace("ё", "е")
    return re.sub(r"[^a-zа-я0-9]+", "", value)


def hero_images(characters):
    files = [name for name in os.listdir(IMAGE_DIR) if name.lower().endswith((".jpg", ".jpeg", ".png", ".webp"))]
    by_label = {normalize_label(os.path.splitext(name)[0]): name for name in files}
    images = {}
    for character in characters:
        filename = IMAGE_OVERRIDES.get(character["name"])
        labels = [character["name"]] + character["aliases"]
        if not filename:
            for label in labels:
                filename = by_label.get(normalize_label(label))
                if filename:
                    break
        if not filename:
            for label in labels:
                folded = normalize_label(label)
                if len(folded) < 5:
                    continue
                for key, candidate in by_label.items():
                    if folded in key or key in folded:
                        filename = candidate
                        break
                if filename:
                    break
        if filename:
            images[character["name"]] = "/img/" + quote(filename)
    return images


def load_data(stats_path=None):
    stats_path = stats_path or STATS_PATH
    with open(ROSTER_PATH, encoding="utf-8") as handle:
        roster = json.load(handle)
    by_alias = {}
    codes = {}
    alias_by_name = {}
    for character in roster["characters"]:
        codes[character["name"]] = short_code(character)
        alias_by_name[character["name"]] = list(character["aliases"])
        by_alias[character["name"].strip().lower()] = character["name"]
        for alias in character["aliases"]:
            by_alias[alias.strip().lower()] = character["name"]
    images = hero_images(roster["characters"])

    recent = {name: set() for name in codes}
    for label, filename in RECENT_FILES:
        path = os.path.join(DATA_DIR, filename)
        with open(path, encoding="utf-8") as handle:
            payload = json.load(handle)
        characters = payload.get("characters")
        if not isinstance(characters, list):
            continue
        for token in characters:
            name = by_alias.get(str(token).strip().lower())
            if name:
                recent[name].add(label)

    wins = {}
    totals = {}
    with open(stats_path, newline="", encoding="utf-8-sig") as handle:
        for row in csv.DictReader(handle):
            hero = row["Герой"]
            opponent = row["Соперник"]
            if hero not in codes or opponent not in codes:
                continue
            hero_wins = int(row["Победы"])
            hero_losses = int(row["Поражения"])
            games = int(row["Игры"])
            percent = float(row["Процент побед"])
            wins[(hero, opponent)] = {
                "wins": hero_wins,
                "losses": hero_losses,
                "games": games,
                "pct": percent,
            }
            bucket = totals.setdefault(hero, {"wins": 0, "losses": 0})
            bucket["wins"] += hero_wins
            bucket["losses"] += hero_losses
    for (hero, opponent), info in list(wins.items()):
        if hero == opponent or (opponent, hero) in wins:
            continue
        games = info["games"]
        reverse = {
            "wins": info["losses"],
            "losses": info["wins"],
            "games": games,
            "pct": round(100.0 * info["losses"] / games, 1) if games else 0,
        }
        wins[(opponent, hero)] = reverse
        bucket = totals.setdefault(opponent, {"wins": 0, "losses": 0})
        bucket["wins"] += reverse["wins"]
        bucket["losses"] += reverse["losses"]

    heroes = []
    for name, bucket in totals.items():
        games = bucket["wins"] + bucket["losses"]
        rate = 100 * bucket["wins"] / games if games else 50
        heroes.append({
            "name": name,
            "code": codes.get(name, name[:3]),
            "wins": bucket["wins"],
            "losses": bucket["losses"],
            "games": games,
            "winRate": round(rate, 1),
            "recent": sorted(recent.get(name, [])),
            "image": images.get(name, ""),
            "aliases": alias_by_name.get(name, []),
        })
    heroes.sort(key=lambda hero: hero["name"])
    played = {hero["name"] for hero in heroes}
    unplayed = []
    for name, code in codes.items():
        if name in played:
            continue
        unplayed.append({
            "name": name,
            "code": code,
            "wins": 0,
            "losses": 0,
            "games": 0,
            "winRate": 0,
            "recent": sorted(recent.get(name, [])),
            "image": images.get(name, ""),
            "aliases": alias_by_name.get(name, []),
        })
    unplayed.sort(key=lambda hero: hero["name"])
    game_counts = sorted(hero["games"] for hero in heroes)
    often_line = game_counts[int(len(game_counts) * 0.7)] if game_counts else 1
    matches = sum(hero["games"] for hero in heroes) // 2
    return {"heroes": heroes, "unplayed": unplayed, "wins": wins, "matches": matches, "oftenLine": max(often_line, 1)}


def load_sources():
    return {key: load_data(path) for key, path in STATS_FILES.items()}
