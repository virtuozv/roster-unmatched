import json
import re

from constants import ROSTER_PATH

EXTRA = {
    "anniechristmas": "Энни Кристмас",
    "thewaywardsisters": "Вещие Сёстры",
    "buffyxander": "Баффи",
    "buffygiles": "Баффи",
    "hellboy": "Хеллбой",
    "buffy": "Баффи",
    "ingen": "Роберт Малдун",
    "houdini": "Гудини",
}


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


def russian_name(index, english):
    key = normalize(english)
    if key in EXTRA:
        return EXTRA[key]
    hits = index.get(key, set())
    if len(hits) == 1:
        return next(iter(hits))
    return None
