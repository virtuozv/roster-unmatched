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
        found.append({"name": name, "heroes": heroes})
    return found


def write_saved(rows, path):
    folder = os.path.dirname(path)
    if folder:
        os.makedirs(folder, exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=["Название", "Герои"], lineterminator="\r\n")
        writer.writeheader()
        for row in rows:
            writer.writerow({"Название": row["name"], "Герои": "|".join(row["heroes"])})


def store_roster(name, heroes, data, path=None):
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
    path = path or SAVED_PATH
    rows = load_saved(path)
    updated = False
    for row in rows:
        if row["name"] == title:
            row["heroes"] = kept
            updated = True
            break
    if not updated:
        rows.append({"name": title, "heroes": kept})
    write_saved(rows, path)
    return rows


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
