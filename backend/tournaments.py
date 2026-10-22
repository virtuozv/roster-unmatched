import csv
import os

from constants import DOCUMENTS_DIR, SKIP_LOG_NAMES, document_tournaments

HERO_COLUMNS = ("Герой победителя", "Герой проигравшего")


def list_tournaments():
    return document_tournaments()


def iter_document_logs():
    for tournament in document_tournaments():
        folder = os.path.join(DOCUMENTS_DIR, tournament)
        for root, _dirs, files in os.walk(folder):
            for filename in files:
                if not filename.lower().endswith(".csv"):
                    continue
                if filename.casefold() in SKIP_LOG_NAMES:
                    continue
                yield tournament, os.path.join(root, filename)


def load_document_recent(by_alias):
    recent = {}
    for tournament, path in iter_document_logs():
        try:
            with open(path, newline="", encoding="utf-8-sig") as handle:
                rows = list(csv.DictReader(handle))
        except OSError:
            continue
        for row in rows:
            for column in HERO_COLUMNS:
                token = (row.get(column) or "").strip()
                if not token:
                    continue
                name = by_alias.get(token.lower())
                if not name:
                    continue
                recent.setdefault(name, set()).add(tournament)
    return recent


def event_matches(labels, wanted):
    if not wanted:
        return set()
    blocked = set(wanted)
    hits = set()
    for label in labels or []:
        if label in blocked:
            hits.add(label)
            continue
        if " / " in label:
            folder = label.split(" / ", 1)[0].strip()
            if folder in blocked:
                hits.add(folder)
    return hits
