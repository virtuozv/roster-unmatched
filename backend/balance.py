import math


def in_win_band(pct, settings):
    return settings["bandLow"] <= pct <= settings["bandHigh"]


def cell(data, hero, opponent):
    return data["wins"].get((hero, opponent))


def penalty_points(hero, settings, data):
    points = 0.0
    points += settings["penaltyRecent"] * 3.2 * len(hero["recent"])
    if hero["games"] > data["oftenLine"]:
        extra = (hero["games"] - data["oftenLine"]) / data["oftenLine"]
        points += settings["penaltyOften"] * 3.4 * min(extra, 2.5)
    if hero["games"] >= 40:
        points += settings["penaltyStrong"] * 0.22 * max(0, hero["winRate"] - 53)
        points += settings["penaltyStrong"] * 0.12 * max(0, 47 - hero["winRate"])
    return points


def weight_of(hero, settings, data):
    return math.exp(-0.55 * penalty_points(hero, settings, data))


def known_pairs(data, roster, settings):
    pairs = []
    for index, hero in enumerate(roster):
        for opponent in roster[index + 1:]:
            info = cell(data, hero, opponent)
            if not info or info["games"] < settings["minGames"]:
                continue
            deviation = abs(info["pct"] - 50)
            in_band = in_win_band(info["pct"], settings)
            if info["pct"] < settings["bandLow"]:
                side = "below"
            elif info["pct"] > settings["bandHigh"]:
                side = "above"
            else:
                side = "inside"
            pairs.append((hero, opponent, info, deviation, in_band, side))
    return pairs


def pair_buckets(data, roster, settings):
    below = 0
    inside = 0
    above = 0
    none = 0
    for index, hero in enumerate(roster):
        for opponent in roster[index + 1:]:
            info = cell(data, hero, opponent)
            if not info or info["games"] < settings["minGames"]:
                none += 1
                continue
            if info["pct"] < settings["bandLow"]:
                below += 1
            elif info["pct"] > settings["bandHigh"]:
                above += 1
            else:
                inside += 1
    return {
        "below": below,
        "inside": inside,
        "above": above,
        "none": none,
        "known": below + inside + above,
    }


def roster_score(data, names, settings):
    buckets = pair_buckets(data, names, settings)
    return (
        buckets["below"] * settings["weightBelow"]
        + buckets["above"] * settings["weightAbove"]
        + buckets["none"] * settings["weightNone"]
    ), buckets


def is_unknown_pair(data, left, right, settings):
    floor = max(0, int(settings["minGames"]))
    info = cell(data, left, right)
    if not info or info["games"] < 1:
        return True
    return info["games"] <= floor


def unknown_link_count(data, roster, candidate, settings):
    return sum(1 for name in roster if is_unknown_pair(data, candidate, name, settings))


def roster_unknown_count(data, names, settings):
    total = 0
    for index, hero in enumerate(names):
        for opponent in names[index + 1:]:
            if is_unknown_pair(data, hero, opponent, settings):
                total += 1
    return total


def list_unknown_heroes(data, settings):
    hero_by_name = hero_by_name_map(data)
    names = sorted(hero_by_name)
    floor = max(0, int(settings["minGames"]))
    result = []
    for hero in names:
        unknown = []
        for opponent in names:
            if opponent == hero:
                continue
            info = cell(data, hero, opponent)
            if not info or info["games"] < 1:
                kind = "missing"
                games = 0
                pct = None
            elif info["games"] <= floor:
                kind = "thin"
                games = info["games"]
                pct = info["pct"]
            else:
                continue
            other = hero_by_name[opponent]
            unknown.append({
                "name": other["name"],
                "nameEn": other.get("nameEn") or other["name"],
                "image": other.get("image", ""),
                "games": games,
                "pct": pct,
                "kind": kind,
            })
        if not unknown:
            continue
        unknown.sort(key=lambda row: (0 if row["kind"] == "missing" else 1, row["games"], row["name"]))
        hero_info = hero_by_name[hero]
        result.append({
            "name": hero_info["name"],
            "nameEn": hero_info.get("nameEn") or hero_info["name"],
            "image": hero_info.get("image", ""),
            "count": len(unknown),
            "missing": sum(1 for row in unknown if row["kind"] == "missing"),
            "thin": sum(1 for row in unknown if row["kind"] == "thin"),
            "unknown": unknown,
        })
    result.sort(key=lambda row: (-row["count"], row["name"]))
    return {
        "heroes": result,
        "minGames": floor,
        "total": len(result),
    }


def unknown_pairs(data, roster, settings, hero_by_name):
    floor = max(0, int(settings["minGames"]))
    found = []
    for index, hero in enumerate(roster):
        for opponent in roster[index + 1:]:
            info = cell(data, hero, opponent)
            if not info or info["games"] < 1:
                kind = "missing"
                games = 0
                pct = None
                wins = 0
                losses = 0
            elif info["games"] <= floor:
                kind = "thin"
                games = info["games"]
                pct = info["pct"]
                wins = info["wins"]
                losses = info["losses"]
            else:
                continue
            left = hero_by_name[hero]
            right = hero_by_name[opponent]
            found.append({
                "hero": left["name"],
                "heroImage": left.get("image", ""),
                "opponent": right["name"],
                "opponentImage": right.get("image", ""),
                "games": games,
                "pct": pct,
                "wins": wins,
                "losses": losses,
                "kind": kind,
            })
    found.sort(key=lambda row: (0 if row["kind"] == "missing" else 1, row["games"], row["hero"], row["opponent"]))
    return found


def hero_by_name_map(data):
    found = {hero["name"]: hero for hero in data["heroes"]}
    for hero in data.get("unplayed") or []:
        found.setdefault(hero["name"], hero)
    return found


def addition_score(data, roster, candidate, settings, hero_by_name):
    below = 0
    above = 0
    none = 0
    known = 0
    for name in roster:
        info = cell(data, candidate, name)
        if not info or info["games"] < settings["minGames"]:
            none += 1
            continue
        known += 1
        if info["pct"] < settings["bandLow"]:
            below += 1
        elif info["pct"] > settings["bandHigh"]:
            above += 1
    balance = (
        below * settings["weightBelow"]
        + above * settings["weightAbove"]
        + none * settings["weightNone"]
    )
    if not known:
        balance += 22
    elif known < max(1, len(roster) * 0.35) and settings["weightNone"] <= 0:
        balance += 6
    balance += penalty_points(hero_by_name[candidate], settings, data)
    return balance


def oriented_match(data, hero, opponent):
    info = cell(data, hero, opponent)
    if info:
        return info
    other = cell(data, opponent, hero)
    if not other:
        return None
    games = other["games"]
    wins = other["losses"]
    percent = (100.0 * wins / games) if games else 50.0
    return {
        "wins": wins,
        "losses": other["wins"],
        "games": games,
        "pct": round(percent, 1),
    }


def pair_rank(data, left, right, settings, hero_by_name):
    info = oriented_match(data, left, right)
    if info and info["games"] >= settings["minGames"]:
        return 0, abs(info["pct"] - 50), info
    gap = abs(hero_by_name[left]["winRate"] - hero_by_name[right]["winRate"])
    return 1, gap, info
