from constants import LATEST_SET, WEAK_NAMES, WEAK_RATE

LATEST_EN = ["Hellboy", "Liz Sherman", "Abe Sapien", "Baba Yaga"]
WEAK_EN = "Buffy, Angel, Willow, Spike, and Squirrel Girl"


def format_pct(value):
    return f"{value:.1f}".replace(".", ",") + "%"


def is_en(lang):
    return str(lang or "").lower().startswith("en")


def disp(name, hero_by_name=None, lang="ru"):
    if not is_en(lang):
        return name
    if hero_by_name and name in hero_by_name:
        return hero_by_name[name].get("nameEn") or name
    return name


def latest_names(lang="ru"):
    if is_en(lang):
        return ", ".join(LATEST_EN[:-1]) + ", and " + LATEST_EN[-1]
    return ", ".join(LATEST_SET[:-1]) + " и " + LATEST_SET[-1]


def pair_reason(hero, other, info, lang="ru", hero_by_name=None):
    other_label = disp(other, hero_by_name, lang) if isinstance(other, str) else other
    if is_en(lang):
        text = "strong, " + format_pct(hero["winRate"]) + " wins, offset by " + other_label
        if info and info["games"] >= 1:
            text += ": head-to-head " + format_pct(info["pct"]) + " over " + str(info["games"]) + " games"
        else:
            text += ": few head-to-head games"
        return text
    text = "сильный, " + format_pct(hero["winRate"]) + " побед, компенсируется " + other_label
    if info and info["games"] >= 1:
        text += ": личная встреча " + format_pct(info["pct"]) + " за " + str(info["games"]) + " игр"
    else:
        text += ": личных игр мало"
    return text


def describe_pairs(pairs, lang="ru", hero_by_name=None):
    chunks = []
    for left, right, info in pairs:
        left_l = disp(left, hero_by_name, lang)
        right_l = disp(right, hero_by_name, lang)
        if info and info["games"] >= 1:
            if is_en(lang):
                chunks.append(left_l + " vs " + right_l + " " + format_pct(info["pct"]))
            else:
                chunks.append(left_l + " против " + right_l + " " + format_pct(info["pct"]))
        else:
            if is_en(lang):
                chunks.append(left_l + " and " + right_l)
            else:
                chunks.append(left_l + " и " + right_l)
    count = len(pairs)
    if is_en(lang):
        prefix = str(count) + " strong pair" + ("" if count == 1 else "s") + " added to the roster"
    elif count % 10 == 1 and count % 100 != 11:
        prefix = "В ростер добавлена " + str(count) + " пара сильных"
    elif 2 <= count % 10 <= 4 and not 12 <= count % 100 <= 14:
        prefix = "В ростер добавлены " + str(count) + " пары сильных"
    else:
        prefix = "В ростер добавлено " + str(count) + " пар сильных"
    return prefix + ": " + ", ".join(chunks) + "."


def cut_records(hero_by_name, frequent, strong, weak=None, recent=None, dropped_latest=None, lang="ru"):
    records = []
    for name in frequent:
        hero = hero_by_name[name]
        if is_en(lang):
            reason = "most often in recent rosters: " + " and ".join(hero["recent"])
        else:
            reason = "чаще всего в недавних ростерах: " + " и ".join(hero["recent"])
        records.append({
            "name": name,
            "nameEn": hero.get("nameEn") or name,
            "winRate": hero["winRate"],
            "image": hero.get("image", ""),
            "reason": reason,
        })
    for name in strong:
        hero = hero_by_name[name]
        if is_en(lang):
            reason = "too strong, " + format_pct(hero["winRate"]) + " wins over " + str(hero["games"]) + " games"
        else:
            reason = "слишком сильный, " + format_pct(hero["winRate"]) + " побед за " + str(hero["games"]) + " игр"
        records.append({
            "name": name,
            "nameEn": hero.get("nameEn") or name,
            "winRate": hero["winRate"],
            "image": hero.get("image", ""),
            "reason": reason,
        })
    for hero in weak or []:
        named = hero["name"] in WEAK_NAMES and hero["winRate"] >= WEAK_RATE
        if is_en(lang):
            if named:
                reason = "on the weak list: " + WEAK_EN
            elif hero["games"]:
                reason = "too weak, " + format_pct(hero["winRate"]) + " wins over " + str(hero["games"]) + " games"
            else:
                reason = "too weak, no games"
        elif named:
            reason = "из слабых: Баффи, Ангел, Виллоу, Спайк и Белка"
        elif hero["games"]:
            reason = "слишком слабый, " + format_pct(hero["winRate"]) + " побед за " + str(hero["games"]) + " игр"
        else:
            reason = "слишком слабый, игр нет"
        records.append({
            "name": hero["name"],
            "nameEn": hero.get("nameEn") or hero["name"],
            "winRate": hero["winRate"],
            "image": hero.get("image", ""),
            "reason": reason,
        })
    for hero in recent or []:
        if is_en(lang):
            reason = "from recent events: " + " and ".join(hero["recent"])
        else:
            reason = "из последних турниров: " + " и ".join(hero["recent"])
        records.append({
            "name": hero["name"],
            "nameEn": hero.get("nameEn") or hero["name"],
            "winRate": hero["winRate"],
            "image": hero.get("image", ""),
            "reason": reason,
        })
    for hero in dropped_latest or []:
        records.append({
            "name": hero["name"],
            "nameEn": hero.get("nameEn") or hero["name"],
            "winRate": hero["winRate"],
            "image": hero.get("image", ""),
            "reason": "from the latest set" if is_en(lang) else "из последнего набора",
        })
    records.sort(key=lambda item: item["name"])
    return records


def why_kept(hero, in_roster, lang="ru"):
    if is_en(lang):
        if hero["recent"]:
            recent = "was in " + " and ".join(hero["recent"])
        else:
            recent = "not in Last Chance 2026, First Chance 2026, or Weekcup"
        place = "taken into the roster" if in_roster else "kept in the pool"
        return recent + ", overall win rate " + format_pct(hero["winRate"]) + ", " + place
    if hero["recent"]:
        recent = "был в " + " и ".join(hero["recent"])
    else:
        recent = "не входил в Last Chance 2026, First Chance 2026 и Weekcup"
    place = "взят в ростер" if in_roster else "оставлен в пуле"
    return recent + ", общий процент " + format_pct(hero["winRate"]) + ", " + place
