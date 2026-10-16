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
            pairs.append((hero, opponent, info, deviation, in_band))
    return pairs


def hero_by_name_map(data):
    found = {hero["name"]: hero for hero in data["heroes"]}
    for hero in data.get("unplayed") or []:
        found.setdefault(hero["name"], hero)
    return found


def addition_score(data, roster, candidate, settings, hero_by_name):
    deviations = []
    outside = 0
    for name in roster:
        info = cell(data, candidate, name)
        if not info or info["games"] < settings["minGames"]:
            continue
        deviations.append(abs(info["pct"] - 50))
        if not in_win_band(info["pct"], settings):
            outside += 1
    if not deviations:
        balance = 22
    else:
        balance = sum(deviations) / len(deviations)
        if len(deviations) < max(1, len(roster) * 0.35):
            balance += 6
        if settings["band"]:
            balance += 5 * outside / len(deviations)
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
