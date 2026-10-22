import csv
import os

from constants import SAVED_PATH
from roster import hero_by_name_map


def load_saved(path=None):
    path = path or SAVED_PATH
    if not os.path.isfile(path):
        return []
    with open(path, newline="", encoding="utf-8-sig") as handle:
        rows = list(csv.DictReader(handle))
    found = []
    for row in rows:
        name = (row.get("Название") or "").strip()
        if not name:
            continue
        heroes = [part.strip() for part in (row.get("Герои") or "").split("|") if part.strip()]
        maps = [part.strip() for part in (row.get("Карты") or "").split("|") if part.strip()]
        found.append({"name": name, "heroes": heroes, "maps": maps})
    return found


def write_saved(rows, path):
    folder = os.path.dirname(path)
    if folder:
        os.makedirs(folder, exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=["Название", "Герои", "Карты"], lineterminator="\r\n")
        writer.writeheader()
        for row in rows:
            writer.writerow({
                "Название": row["name"],
                "Герои": "|".join(row["heroes"]),
                "Карты": "|".join(row.get("maps") or []),
            })


def normalize_maps(maps, map_data):
    known = {item["name"] for item in (map_data or {}).get("maps") or []}
    kept = []
    seen = set()
    for item in maps or []:
        if not isinstance(item, str) or item not in known or item in seen:
            continue
        seen.add(item)
        kept.append(item)
    return kept


def store_roster(name, heroes, data, path=None, maps=None, map_data=None):
    title = str(name or "").strip()
    if not title:
        raise ValueError("Нужно название ростера")
    hero_by_name = hero_by_name_map(data)
    kept = []
    seen = set()
    for hero in heroes or []:
        if not isinstance(hero, str) or hero not in hero_by_name or hero in seen:
            continue
        seen.add(hero)
        kept.append(hero)
        if len(kept) >= 40:
            break
    if not kept:
        raise ValueError("В ростере нет известных героев")
    kept.sort(key=lambda name: name.casefold())
    path = path or SAVED_PATH
    rows = load_saved(path)
    next_maps = None if maps is None else normalize_maps(maps, map_data or {})
    updated = False
    for row in rows:
        if row["name"] == title:
            row["heroes"] = kept
            if next_maps is not None:
                row["maps"] = next_maps
            updated = True
            break
    if not updated:
        rows.append({"name": title, "heroes": kept, "maps": next_maps or []})
    write_saved(rows, path)
    return rows


def attach_maps(name, maps, map_data, path=None, allow_empty=False):
    title = str(name or "").strip()
    if not title:
        raise ValueError("Нужно название ростера")
    path = path or SAVED_PATH
    rows = load_saved(path)
    kept_maps = normalize_maps(maps, map_data)
    if not kept_maps and not allow_empty:
        raise ValueError("Нет известных карт для сохранения")
    for row in rows:
        if row["name"] == title:
            row["maps"] = kept_maps
            write_saved(rows, path)
            return rows
    raise ValueError("Сначала сохрани ростер героев")


def clear_maps(name, path=None):
    return attach_maps(name, [], {"maps": []}, path=path, allow_empty=True)


def delete_roster(name, path=None):
    title = str(name or "").strip()
    if not title:
        raise ValueError("Нужно название ростера")
    path = path or SAVED_PATH
    rows = load_saved(path)
    kept = [row for row in rows if row["name"] != title]
    if len(kept) == len(rows):
        raise ValueError("Такого ростера нет")
    write_saved(kept, path)
    return kept
