import os

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(BACKEND_DIR)
APP_DIR = os.path.join(ROOT, "frontend")
DATA_DIR = os.path.join(BACKEND_DIR, "data")
STATS_FILES = {
    "all": os.path.join(ROOT, "documents", "общий-процент-побед.csv"),
    "saskia": os.path.join(ROOT, "documents", "процент-побед.csv"),
    "umleague": os.path.join(ROOT, "documents", "процент-побед-unmatched-club.csv"),
}
STATS_PATH = STATS_FILES["all"]
SAVED_PATH = os.path.join(ROOT, "documents", "сохранённые-ростеры.csv")
ROSTER_PATH = os.path.join(DATA_DIR, "roster.json")
MAPS_PATH = os.path.join(DATA_DIR, "maps.csv")
IMAGE_DIR = os.path.join(ROOT, "images", "portraits")
MAP_IMAGE_DIR = os.path.join(ROOT, "images", "maps")
IMAGE_OVERRIDES = {"Донателло": "Dontalello.jpg"}
RECENT_FILES = [
    ("Last Chance 2026", "LastChance.json"),
    ("First Chance 2026", "FirstChance.json"),
    ("Weekcup", "Weekcup7.json"),
]
RECENT_EVENTS = tuple(label for label, _filename in RECENT_FILES)


def drop_events_from(payload):
    allowed = set(RECENT_EVENTS)
    events = payload.get("dropEvents") if isinstance(payload, dict) else None
    chosen = []
    if isinstance(events, list):
        for item in events:
            name = str(item)
            if name in allowed and name not in chosen:
                chosen.append(name)
    if not chosen and isinstance(payload, dict) and payload.get("dropRecent"):
        return list(RECENT_EVENTS)
    return chosen
SIZE = 15
POOL_SIZE = 20
MAP_SIZE = 12
MAP_OVERLAP = 3
STRONG_RATE = 56
STRONG_GAMES = 80
WEAK_RATE = 40
WEAK_NAMES = {"Баффи", "Виллоу", "Ангел", "Спайк", "Девушка-Белка"}
LATEST_SET = ("Хеллбой", "Лиз Шерман", "Эйб Сапиен", "Баба Яга")
HOST = "127.0.0.1"
PORT = 8765
