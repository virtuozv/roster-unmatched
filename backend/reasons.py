from constants import WEAK_NAMES, WEAK_RATE


def format_pct(value):
    return f"{value:.1f}".replace(".", ",") + "%"


def pair_reason(hero, other, info):
    text = "сильный, " + format_pct(hero["winRate"]) + " побед, компенсируется " + other
    if info and info["games"] >= 1:
        text += ": личная встреча " + format_pct(info["pct"]) + " за " + str(info["games"]) + " игр"
    else:
        text += ": личных игр мало"
    return text


def describe_pairs(pairs):
    chunks = []
    for left, right, info in pairs:
        if info and info["games"] >= 1:
            chunks.append(left + " против " + right + " " + format_pct(info["pct"]))
        else:
            chunks.append(left + " и " + right)
    if len(pairs) % 10 == 1 and len(pairs) % 100 != 11:
        prefix = "В ростер добавлена " + str(len(pairs)) + " пара сильных"
    elif 2 <= len(pairs) % 10 <= 4 and not 12 <= len(pairs) % 100 <= 14:
        prefix = "В ростер добавлены " + str(len(pairs)) + " пары сильных"
    else:
        prefix = "В ростер добавлено " + str(len(pairs)) + " пар сильных"
    return prefix + ": " + ", ".join(chunks) + "."


def cut_records(hero_by_name, frequent, strong, weak=None, recent=None, dropped_latest=None):
    records = []
    for name in frequent:
        hero = hero_by_name[name]
        records.append({
            "name": name,
            "winRate": hero["winRate"],
            "image": hero.get("image", ""),
            "reason": "чаще всего в недавних ростерах: " + " и ".join(hero["recent"]),
        })
    for name in strong:
        hero = hero_by_name[name]
        records.append({
            "name": name,
            "winRate": hero["winRate"],
            "image": hero.get("image", ""),
            "reason": "слишком сильный, " + format_pct(hero["winRate"]) + " побед за " + str(hero["games"]) + " игр",
        })
    for hero in weak or []:
        named = hero["name"] in WEAK_NAMES and hero["winRate"] >= WEAK_RATE
        if named:
            reason = "из слабых: Баффи, Ангел, Виллоу, Спайк и Белка"
        elif hero["games"]:
            reason = "слишком слабый, " + format_pct(hero["winRate"]) + " побед за " + str(hero["games"]) + " игр"
        else:
            reason = "слишком слабый, игр нет"
        records.append({
            "name": hero["name"],
            "winRate": hero["winRate"],
            "image": hero.get("image", ""),
            "reason": reason,
        })
    for hero in recent or []:
        records.append({
            "name": hero["name"],
            "winRate": hero["winRate"],
            "image": hero.get("image", ""),
            "reason": "из последних турниров: " + " и ".join(hero["recent"]),
        })
    for hero in dropped_latest or []:
        records.append({
            "name": hero["name"],
            "winRate": hero["winRate"],
            "image": hero.get("image", ""),
            "reason": "из последнего набора",
        })
    records.sort(key=lambda item: item["name"])
    return records


def why_kept(hero, in_roster):
    if hero["recent"]:
        recent = "был в " + " и ".join(hero["recent"])
    else:
        recent = "не входил в Last Chance 2026, First Chance 2026 и Weekcup"
    place = "взят в ростер" if in_roster else "оставлен в пуле"
    return recent + ", общий процент " + format_pct(hero["winRate"]) + ", " + place
