import csv
import json
import os
from urllib.parse import quote

from constants import DATA_DIR, MAP_IMAGE_DIR, MAP_OVERLAP, MAP_SIZE, MAPS_PATH, RECENT_FILES, drop_events_from
from reasons import is_en
from tournaments import event_matches


def load_maps():
    with open(MAPS_PATH, newline="", encoding="utf-8-sig") as handle:
        rows = list(csv.DictReader(handle))
    maps = []
    events = set()
    for row in rows:
        aliases = [part.strip() for part in row["Другие написания"].split(",") if part.strip()]
        labels = []
        for event in row["Где была"].split(";"):
            event = event.strip()
            if event:
                events.add(event)
                labels.append(event)
        maps.append({
            "name": row["Официальное"],
            "aliases": aliases,
            "games": int(row["Игр"]),
            "rosters": int(row["Ростеров"]),
            "recent": sorted(set(labels)),
        })
    maps.sort(key=lambda item: item["name"])
    attach_images(maps)
    attach_recent(maps)
    without_image = [item["name"] for item in maps if not item["image"]]
    return {"maps": maps, "pastTotal": len(events), "withoutImage": without_image}


def attach_recent(maps):
    by_alias = {}
    for item in maps:
        by_alias[item["name"].casefold()] = item["name"]
        for alias in item["aliases"]:
            by_alias[alias.casefold()] = item["name"]
    recent = {item["name"]: set(item.get("recent") or []) for item in maps}
    for label, filename in RECENT_FILES:
        path = os.path.join(DATA_DIR, filename)
        with open(path, encoding="utf-8") as handle:
            boards = json.load(handle).get("boards") or []
        for raw in boards:
            name = by_alias.get(str(raw).strip().casefold())
            if not name:
                raise ValueError("В " + filename + " неизвестная карта: " + str(raw))
            recent[name].add(label)
    for item in maps:
        item["recent"] = sorted(recent[item["name"]])


def attach_images(maps):
    files = [
        name for name in os.listdir(MAP_IMAGE_DIR)
        if name.lower().endswith((".jpg", ".jpeg", ".png", ".webp"))
    ]
    by_label = {os.path.splitext(name)[0].casefold(): name for name in files}
    for item in maps:
        filename = by_label.get(item["name"].casefold())
        if not filename:
            for alias in item["aliases"]:
                filename = by_label.get(alias.casefold())
                if filename:
                    break
        item["image"] = "/maps/" + quote(filename) if filename else ""


def map_settings_from(payload, map_count):
    try:
        size = int(payload.get("size", MAP_SIZE))
    except (TypeError, ValueError):
        size = MAP_SIZE
    try:
        overlap = int(payload.get("overlap", MAP_OVERLAP))
    except (TypeError, ValueError):
        overlap = MAP_OVERLAP
    size = min(map_count, max(2, size))
    return {
        "size": size,
        "overlap": min(size, max(0, overlap)),
        "dropEvents": drop_events_from(payload),
        "lang": "en" if is_en(payload.get("lang")) else "ru",
    }


def map_avoided(item, events):
    return bool(event_matches(item.get("recent") or [], events))


def roll_maps(data, settings, rng):
    size = settings["size"]
    overlap = min(settings["overlap"], size)
    events = settings.get("dropEvents") or []
    fresh = [item for item in data["maps"] if not map_avoided(item, events)]
    once = [item for item in data["maps"] if len(event_matches(item.get("recent") or [], events)) == 1]
    both = [item for item in data["maps"] if len(event_matches(item.get("recent") or [], events)) > 1]
    new_maps = [item for item in fresh if not item["image"]]
    known = [item for item in fresh if item["image"]]
    rng.shuffle(new_maps)
    rng.shuffle(known)
    rng.shuffle(once)
    rng.shuffle(both)
    fresh = new_maps + known
    recent = once + both
    repeated = recent[:overlap]
    picked = [item["name"] for item in fresh[:size - len(repeated)]]
    picked.extend(item["name"] for item in repeated)
    if len(picked) < size:
        used = set(picked)
        for item in recent:
            if item["name"] in used:
                continue
            picked.append(item["name"])
            if len(picked) == size:
                break
    fresh_count = size - sum(1 for name in picked if name in {item["name"] for item in recent})
    repeated_count = len(picked) - fresh_count
    lang = settings.get("lang") or "ru"
    if events:
        joined = (" and " if is_en(lang) else " и ").join(events)
        if is_en(lang):
            note = str(repeated_count) + " maps from " + joined + ", " + str(fresh_count) + " were not there."
        else:
            note = str(repeated_count) + " карт из " + joined + ", " + str(fresh_count) + " там не было."
    elif is_en(lang):
        note = "No events excluded. Set of " + str(len(picked)) + " maps."
    else:
        note = "Турниры не исключены. Набор из " + str(len(picked)) + " карт."
    return finish_maps(data, picked, settings, note)


def swap_maps(data, settings, roster, remove, add):
    names = {item["name"] for item in data["maps"]}
    if remove not in roster or add in roster or add not in names:
        raise ValueError("Такая замена недоступна")
    roster = [add if name == remove else name for name in roster]
    lang = settings.get("lang") or "ru"
    if is_en(lang):
        note = add + " comes in for " + remove + "."
    else:
        note = add + " входит вместо " + remove + "."
    return finish_maps(data, roster, settings, note)


def recent_reason(labels, lang="ru"):
    if is_en(lang):
        if not labels:
            return "not in Last Chance 2026, First Chance 2026, or Weekcup"
        if len(labels) == 1:
            return "was in " + labels[0]
        return "was in " + " and ".join(labels)
    if not labels:
        return "не было в Last Chance 2026, First Chance 2026 и Weekcup"
    if len(labels) == 1:
        return "была в " + labels[0]
    return "была в " + " и ".join(labels)


def finish_maps(data, roster, settings, note):
    by_name = {item["name"]: item for item in data["maps"]}
    roster = sorted(roster)
    chosen = set(roster)
    events = settings.get("dropEvents") or []

    lang = settings.get("lang") or "ru"
    missing_art = (
        ", no art in maps yet" if is_en(lang) else ", картинки в maps ещё нет"
    )

    def card(item):
        overlap = sorted(event_matches(item.get("recent") or [], events))
        return {
            "name": item["name"],
            "aliases": item["aliases"],
            "games": item["games"],
            "recent": item["recent"],
            "overlapEvents": overlap,
            "image": item.get("image", ""),
            "reason": recent_reason(overlap if overlap else item["recent"], lang)
            + ("" if item.get("image") else missing_art),
        }

    excluded = [card(item) for item in data["maps"] if map_avoided(item, events) and item["name"] not in chosen]
    excluded.sort(key=lambda item: (len(item["recent"]), item["name"]))
    fresh = sum(1 for name in roster if not map_avoided(by_name[name], events))
    pct = round(100 * fresh / len(roster), 1) if roster else 0
    catalog = []
    for item in data["maps"]:
        record = card(item)
        catalog.append({
            "name": record["name"],
            "aliases": record["aliases"],
            "image": record["image"],
            "recent": record["recent"],
        })
    return {
        "mode": "maps",
        "notes": [note],
        "maps": [card(by_name[name]) for name in roster],
        "excluded": excluded,
        "catalog": catalog,
        "summary": {"size": len(roster), "fresh": fresh, "freshPct": pct},
    }
