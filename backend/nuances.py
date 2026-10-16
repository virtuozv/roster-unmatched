FLOOR = 5


def collect_nuances(data, floor=FLOOR, names=None):
    images = {}
    aliases = {}
    people = list(data["heroes"]) + list(data.get("unplayed") or [])
    allowed = set(names) if names is not None else None
    for hero in people:
        images[hero["name"]] = hero.get("image") or ""
        aliases[hero["name"]] = hero.get("aliases") or []

    seen = set()
    buckets = {"one": [], "sweep": [], "thin": [], "lopsided": []}
    for (hero, opponent), info in data["wins"].items():
        if hero == opponent:
            continue
        if allowed is not None and (hero not in allowed or opponent not in allowed):
            continue
        key = tuple(sorted((hero, opponent)))
        if key in seen:
            continue
        seen.add(key)
        games = info["games"]
        if games <= 0:
            continue
        if info["wins"] < info["losses"] or (info["wins"] == info["losses"] and opponent < hero):
            hero, opponent = opponent, hero
            info = data["wins"].get((hero, opponent), info)
        row = pair_row(hero, opponent, info, images, aliases)
        pct = row["pct"]
        if games == 1:
            buckets["one"].append(row)
        elif games < floor and (pct <= 0 or pct >= 100):
            buckets["sweep"].append(row)
        elif games < floor:
            buckets["thin"].append(row)
        elif games < floor * 2 and (pct <= 25 or pct >= 75):
            buckets["lopsided"].append(row)

    for rows in buckets.values():
        rows.sort(key=lambda row: (row["games"], -abs(row["pct"] - 50), row["hero"], row["opponent"]))

    quiet = []
    for hero in people:
        if allowed is not None and hero["name"] not in allowed:
            continue
        if hero["games"] >= floor:
            continue
        quiet.append({
            "hero": hero["name"],
            "games": hero["games"],
            "pct": hero.get("winRate", 0),
            "heroImage": hero.get("image") or "",
            "aliases": hero.get("aliases") or [],
        })
    quiet.sort(key=lambda row: (row["games"], row["hero"]))

    below = max(floor - 1, 2)
    few = "2" if below == 2 else "2–" + str(below)
    short = str(floor) if floor * 2 - 1 == floor else str(floor) + "–" + str(floor * 2 - 1)
    specs = [
        ("one", "Один матч", "Процент здесь 0 или 100. Одной игре рано верить."),
        ("sweep", "Сухой счёт", few + " матча и 0% или 100%. Счёт выглядит решённым, выборка ещё тонкая."),
        ("thin", "Мало игр", few + " матча, счёт не сухой. В процент ростера такие пары не входят: порог " + str(floor) + " игр."),
        ("lopsided", "Короткий перекос", short + " матчей и процент не выше 25 или не ниже 75. Перекос уже виден, запаса мало."),
        ("quiet", "Почти без игр", "У героя меньше " + str(floor) + " матчей всего. Его общий процент почти ничего не говорит."),
    ]
    groups = []
    for key, title, note in specs:
        rows = quiet if key == "quiet" else buckets[key]
        groups.append({"id": key, "title": title, "note": note, "count": len(rows), "rows": rows})
    return {"groups": groups}


def pair_row(hero, opponent, info, images, aliases):
    return {
        "hero": hero,
        "opponent": opponent,
        "games": info["games"],
        "pct": info["pct"],
        "heroImage": images.get(hero, ""),
        "opponentImage": images.get(opponent, ""),
        "aliases": (aliases.get(hero) or []) + (aliases.get(opponent) or []),
    }
