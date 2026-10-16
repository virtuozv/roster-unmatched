from balance import (
    addition_score,
    cell,
    hero_by_name_map,
    known_pairs,
    oriented_match,
    pair_rank,
    weight_of,
)
from constants import LATEST_SET, POOL_SIZE, SIZE, STRONG_GAMES, STRONG_RATE, WEAK_NAMES, WEAK_RATE, drop_events_from
from nuances import collect_nuances
from reasons import cut_records, describe_pairs, format_pct, pair_reason, why_kept


def settings_from(payload):
    def number(key, default):
        try:
            return float(payload.get(key, default))
        except (TypeError, ValueError):
            return default

    excluded = payload.get("excluded") or []
    if not isinstance(excluded, list):
        excluded = []
    try:
        size = int(payload.get("size", SIZE))
    except (TypeError, ValueError):
        size = SIZE

    def percent(key, default):
        try:
            value = float(payload.get(key, default))
        except (TypeError, ValueError):
            value = default
        return min(100.0, max(0.0, value))

    band_low = percent("bandLow", 45)
    band_high = percent("bandHigh", 55)
    if band_low > band_high:
        band_low, band_high = band_high, band_low
    try:
        strong_pairs = int(payload.get("strongPairs", 0))
    except (TypeError, ValueError):
        strong_pairs = 0
    draft = str(payload.get("draft") or "")
    if draft not in ("Masters", "Weekcup", "Ladder", "Last Chance"):
        draft = ""
    drop_latest = bool(payload.get("dropLatest", False))
    drop_events = drop_events_from(payload)
    return {
        "excluded": {str(name) for name in excluded},
        "size": min(40, max(2, size)),
        "draft": draft,
        "strongPairs": min(20, max(0, strong_pairs)),
        "dropWeak": bool(payload.get("dropWeak", False)),
        "dropEvents": drop_events,
        "dropRecent": bool(drop_events),
        "skipRecent": bool(payload.get("skipRecent", False)),
        "dropUnknown": bool(payload.get("dropUnknown", False)),
        "dropLatest": drop_latest,
        "latestSet": bool(payload.get("latestSet", False)) and not drop_latest,
        "direction": "down" if str(payload.get("direction") or "") == "down" else "up",
        "bandLow": band_low,
        "bandHigh": band_high,
        "band": bool(payload.get("band", True)),
        "minGames": max(1, int(number("minGames", 5))),
        "penaltyRecent": min(2, max(0, number("penaltyRecent", 1))),
        "penaltyOften": min(2, max(0, number("penaltyOften", 0.7))),
        "penaltyStrong": min(2, max(0, number("penaltyStrong", 0.8))),
    }


def apply_swap(roster, remove, add):
    return [add if name == remove else name for name in roster]


def event_blocked(hero, settings):
    wanted = set(settings.get("dropEvents") or [])
    if not wanted:
        return False
    return bool(wanted.intersection(hero.get("recent") or []))


def dropped_event_heroes(data, settings):
    seen = set()
    found = []
    for hero in list(data["heroes"]) + list(data.get("unplayed") or []):
        if hero["name"] in seen or not event_blocked(hero, settings):
            continue
        seen.add(hero["name"])
        found.append(hero)
    return found


def dropped_latest_heroes(data):
    names = set(LATEST_SET)
    seen = set()
    found = []
    for hero in list(data["heroes"]) + list(data.get("unplayed") or []):
        if hero["name"] not in names or hero["name"] in seen:
            continue
        seen.add(hero["name"])
        found.append(hero)
    return found


def split_candidates(data, needed=POOL_SIZE):
    heroes = list(data["heroes"])
    max_recent = max((len(hero["recent"]) for hero in heroes), default=0)
    frequent = []
    strong = []
    kept = []
    for hero in heroes:
        played_most = max_recent >= 2 and len(hero["recent"]) >= max_recent
        too_strong = hero["games"] >= STRONG_GAMES and hero["winRate"] >= STRONG_RATE
        if played_most:
            frequent.append(hero["name"])
        elif too_strong:
            strong.append(hero["name"])
        else:
            kept.append(hero)
    if len(kept) < needed:
        kept = [hero for hero in heroes if hero["name"] not in set(frequent)]
        strong = []
    if len(kept) < needed:
        kept = heroes
        frequent = []
        strong = []
    return kept, frequent, strong


def has_match(data, left, right):
    info = oriented_match(data, left, right)
    return bool(info and info["games"] >= 1)


def played_all(data, name, others):
    return all(has_match(data, name, other) for other in others)


def build_group(data, candidates, count, settings, rng, hero_by_name, locked=None, allow_short=False):
    if count <= 0:
        return []
    if settings.get("dropUnknown"):
        found = build_known_group(data, candidates, count, settings, rng, hero_by_name, locked or [])
        if len(found) < count and not allow_short:
            raise ValueError("Не хватает героев, у которых есть матчи со всеми в составе")
        return found
    if len(candidates) < count:
        raise ValueError("Не хватает героев для состава")
    seeds = [hero for hero in candidates if 46 <= hero["winRate"] <= 54 and hero["games"] >= 40]
    if len(seeds) < 4:
        seeds = list(candidates)
    weights = [weight_of(hero, settings, data) for hero in seeds]
    chosen = [rng.choices(seeds, weights=weights, k=1)[0]["name"]]
    while len(chosen) < count:
        ranked = []
        for hero in candidates:
            if hero["name"] in chosen:
                continue
            ranked.append((addition_score(data, chosen, hero["name"], settings, hero_by_name), hero["name"]))
        ranked.sort(key=lambda item: item[0])
        cutoff = ranked[min(4, len(ranked) - 1)][0] + 0.6
        shortlist = [item for item in ranked[:6] if item[0] <= cutoff]
        if not shortlist:
            shortlist = ranked[:1]
        chosen.append(rng.choice(shortlist)[1])
    return chosen


def build_known_group(data, candidates, count, settings, rng, hero_by_name, locked):
    locked = list(locked)
    for index, left in enumerate(locked):
        if not played_all(data, left, locked[index + 1:]):
            return []
    best = list(locked) if len(locked) >= count else []
    seeds = [hero for hero in candidates if hero["name"] not in set(locked) and played_all(data, hero["name"], locked)]
    seeds.sort(key=lambda hero: sum(1 for other in candidates if has_match(data, hero["name"], other["name"])), reverse=True)
    seeds = seeds[:12]
    if len(seeds) > 8:
        seeds = rng.sample(seeds, 8)
    if not seeds:
        return locked[:count] if len(locked) >= count else []
    for seed in seeds:
        chosen = list(locked)
        chosen.append(seed["name"])
        while len(chosen) < count:
            ranked = []
            chosen_set = set(chosen)
            for hero in candidates:
                if hero["name"] in chosen_set or not played_all(data, hero["name"], chosen):
                    continue
                ranked.append((addition_score(data, chosen, hero["name"], settings, hero_by_name), hero["name"]))
            if not ranked:
                break
            ranked.sort(key=lambda item: item[0])
            cutoff = ranked[min(4, len(ranked) - 1)][0] + 0.6
            shortlist = [item for item in ranked[:6] if item[0] <= cutoff]
            if not shortlist:
                shortlist = ranked[:1]
            chosen.append(rng.choice(shortlist)[1])
        if len(chosen) > len(best):
            best = chosen
        if len(best) >= count:
            return best[:count]
    if len(locked) >= count:
        return locked[:count]
    return best


def recover_strong(data, kept, frequent, strong):
    if strong:
        return kept, strong
    frequent_names = set(frequent)
    restored = []
    for hero in data["heroes"]:
        if hero["name"] in frequent_names:
            continue
        if hero["games"] >= STRONG_GAMES and hero["winRate"] >= STRONG_RATE:
            restored.append(hero["name"])
    if not restored:
        return kept, strong
    blocked = set(restored)
    kept = [hero for hero in kept if hero["name"] not in blocked]
    return kept, restored


def pick_strong_pairs(data, strong, settings, hero_by_name):
    requested = min(settings["strongPairs"], len(strong) // 2, settings["size"] // 2)
    if requested <= 0:
        return []
    ranked = []
    for index, left in enumerate(strong):
        for right in strong[index + 1:]:
            if settings.get("dropUnknown") and not has_match(data, left, right):
                continue
            missing, distance, info = pair_rank(data, left, right, settings, hero_by_name)
            ranked.append((missing, distance, left, right, info))
    ranked.sort(key=lambda item: (item[0], item[1], item[2], item[3]))
    used = set()
    chosen = []
    for _known, _distance, left, right, info in ranked:
        if left in used or right in used:
            continue
        chosen.append((left, right, info))
        used.add(left)
        used.add(right)
        if len(chosen) == requested:
            break
    return chosen


def weak_roster(data):
    found = [hero for hero in data["heroes"] if hero["winRate"] < WEAK_RATE or hero["name"] in WEAK_NAMES]
    seen = {hero["name"] for hero in found}
    for hero in data.get("unplayed") or []:
        if hero["name"] not in seen:
            found.append(hero)
    return found


def field(data, settings):
    hero_by_name = hero_by_name_map(data)
    size = settings["size"]
    pool_size = max(POOL_SIZE, size)
    kept, frequent, strong = split_candidates(data, pool_size)
    if settings["strongPairs"]:
        kept, strong = recover_strong(data, kept, frequent, strong)
    weak = []
    if settings["dropWeak"]:
        frequent_names = set(frequent)
        weak = [hero for hero in weak_roster(data) if hero["name"] not in frequent_names]
        weak_names = {hero["name"] for hero in weak}
        kept = [hero for hero in kept if hero["name"] not in weak_names]
        strong = [name for name in strong if name not in weak_names]
    recent = []
    if settings.get("dropEvents"):
        recent = dropped_event_heroes(data, settings)
        recent_names = {hero["name"] for hero in recent}
        kept = [hero for hero in kept if hero["name"] not in recent_names]
        strong = [name for name in strong if name not in recent_names]
        frequent = [name for name in frequent if name not in recent_names]
    dropped_latest = []
    if settings.get("dropLatest"):
        dropped_latest = dropped_latest_heroes(data)
        latest_names = {hero["name"] for hero in dropped_latest}
        kept = [hero for hero in kept if hero["name"] not in latest_names]
        strong = [name for name in strong if name not in latest_names]
        frequent = [name for name in frequent if name not in latest_names]
        weak = [hero for hero in weak if hero["name"] not in latest_names]
        recent = [hero for hero in recent if hero["name"] not in latest_names]
    if settings.get("latestSet"):
        required = set(LATEST_SET)
        weak = [hero for hero in weak if hero["name"] not in required]
        recent = [hero for hero in recent if hero["name"] not in required]
        dropped_latest = [hero for hero in dropped_latest if hero["name"] not in required]
    blocked = settings["excluded"]
    strong = [name for name in strong if name not in blocked]
    pairs = pick_strong_pairs(data, strong, settings, hero_by_name)
    paired_names = [name for left, right, _info in pairs for name in (left, right)]
    paired_set = set(paired_names)
    strong = [name for name in strong if name not in paired_set]
    kept = [hero for hero in kept if hero["name"] not in settings["excluded"] and hero["name"] not in paired_set]
    regular_roster = size - len(paired_names)
    if len(kept) < regular_roster:
        raise ValueError("После исключений осталось меньше " + str(size) + " героев")
    pair_reasons = {}
    for left, right, info in pairs:
        pair_reasons[left] = pair_reason(hero_by_name[left], right, info)
        pair_reasons[right] = pair_reason(hero_by_name[right], left, oriented_match(data, right, left))
    return {
        "hero_by_name": hero_by_name,
        "size": size,
        "pool_size": pool_size,
        "kept": kept,
        "frequent": frequent,
        "strong": strong,
        "weak": weak,
        "recent": recent,
        "droppedLatest": dropped_latest,
        "dropEvents": settings.get("dropEvents") or [],
        "dropRecent": bool(settings.get("dropEvents")),
        "dropUnknown": settings["dropUnknown"],
        "dropLatest": settings.get("dropLatest", False),
        "latestSet": settings.get("latestSet", False),
        "pairs": pairs,
        "paired_names": paired_names,
        "regular_roster": regular_roster,
        "pair_reasons": pair_reasons,
    }


def pool_note(ready, pool_count):
    frequent = ready["frequent"]
    strong = ready["strong"]
    weak = ready["weak"]
    if ready.get("dropEvents"):
        note = "Пул из " + str(pool_count) + " собран без героев " + " и ".join(ready["dropEvents"])
    else:
        note = "Пул из " + str(pool_count) + " собран без самых частых героев недавних ростеров"
    parts = []
    if frequent:
        parts.append("убраны герои, которые были и в Chance 2026, и в Weekcup")
    if strong:
        parts.append("убраны герои с общим процентом побед от " + str(STRONG_RATE))
    if weak:
        parts.append("убраны слабые: процент побед ниже " + str(WEAK_RATE) + ", герои без игр, Баффи, Ангел, Виллоу, Спайк и Белка")
    if parts:
        note += ": " + ", ".join(parts) + "."
    else:
        note += "."
    note += " Ростер из " + str(ready["size"]) + " взят только из этого пула."
    if ready["dropUnknown"] and not settings_latest(ready):
        note += " Пар без сыгранных матчей в ростере нет."
    if ready["pairs"]:
        note += " " + describe_pairs(ready["pairs"])
    if settings_latest(ready):
        note += " В состав входят Хеллбой, Лиз Шерман, Эйб Сапиен и Баба Яга."
    if ready.get("dropLatest"):
        note += " Хеллбой, Лиз Шерман, Эйб Сапиен и Баба Яга не берутся."
    return note


def settings_latest(ready):
    return bool(ready.get("latestSet"))


def apply_latest(roster, pool_names, settings, hero_by_name, protected=()):
    if not settings.get("latestSet"):
        return list(roster), list(pool_names)
    required = [name for name in LATEST_SET if name in hero_by_name]
    required_set = set(required)
    protect = set(protected)
    others = []
    seen = set()
    for name in roster:
        if name in required_set or name in seen:
            continue
        seen.add(name)
        others.append(name)
    paired = [name for name in others if name in protect]
    fillers = [name for name in others if name not in protect]
    room = max(settings["size"] - len(required), len(paired))
    roster = paired + fillers[: room - len(paired)] + required
    pool = list(pool_names)
    for name in required:
        if name not in pool:
            pool.append(name)
    return roster, pool


def roll(data, settings, rng):
    ready = field(data, settings)
    hero_by_name = ready["hero_by_name"]
    if settings.get("dropUnknown"):
        paired_heroes = [hero_by_name[name] for name in ready["paired_names"]]
        roster = build_group(
            data,
            ready["kept"] + paired_heroes,
            ready["size"],
            settings,
            rng,
            hero_by_name,
            locked=ready["paired_names"],
        )
        open_settings = dict(settings)
        open_settings["dropUnknown"] = False
        remaining = [hero for hero in ready["kept"] if hero["name"] not in set(roster)]
        extras_needed = ready["pool_size"] - len(roster)
        extras = []
        if extras_needed > 0 and remaining:
            extras = build_group(
                data,
                remaining,
                min(extras_needed, len(remaining)),
                open_settings,
                rng,
                hero_by_name,
            )
        pool_names = list(roster) + extras
    else:
        regular_pool = min(ready["pool_size"] - len(ready["paired_names"]), len(ready["kept"]))
        pool_names = build_group(data, ready["kept"], regular_pool, settings, rng, hero_by_name)
        pool_heroes = [hero_by_name[name] for name in pool_names]
        roster = build_group(data, pool_heroes, ready["regular_roster"], settings, rng, hero_by_name)
        roster.extend(ready["paired_names"])
        pool_names.extend(ready["paired_names"])
    note = pool_note(ready, len(pool_names))
    if settings["strongPairs"] and not ready["pairs"]:
        note += " Пар сильных не нашлось."
    if settings.get("draft") == "Masters":
        note += " Процент — общий по начальной расстановке, до банов и пиков."
    excluded = cut_records(hero_by_name, ready["frequent"], ready["strong"], ready["weak"], ready["recent"], ready.get("droppedLatest"))
    roster, pool_names = apply_latest(roster, pool_names, settings, hero_by_name, ready["paired_names"])
    return finish(data, roster, settings, [note], "roll", pool_names, excluded, ready["pair_reasons"])


def roster_ideal(data, names, settings):
    pairs = known_pairs(data, names, settings)
    if not pairs:
        return 0.0
    total = 0.0
    for item in pairs:
        total += max(0.0, 100 - item[3] * 2)
    return total / len(pairs)


def climb_free(data, settings, rng, free_pool, locked, steps):
    need = settings["size"] - len(locked)
    if need <= 0:
        return [], roster_ideal(data, locked, settings)
    locked_set = set(locked)
    if settings.get("dropUnknown"):
        by_name = hero_by_name_map(data)
        heroes = [by_name[name] for name in free_pool if name in by_name]
        full = build_group(data, heroes, need + len(locked), settings, rng, by_name, locked=list(locked))
        current = [name for name in full if name not in locked_set]
    else:
        current = rng.sample(free_pool, need)
    taken = set(current)
    value = roster_ideal(data, locked + current, settings)
    for _ in range(steps):
        if round(value, 1) > 90:
            break
        index = rng.randrange(need)
        add = free_pool[rng.randrange(len(free_pool))]
        if add in taken or add in locked_set:
            continue
        previous = current[index]
        others = [name for name in locked + current if name != previous]
        if settings.get("dropUnknown") and not played_all(data, add, others):
            continue
        current[index] = add
        taken.remove(previous)
        taken.add(add)
        trial = roster_ideal(data, locked + current, settings)
        if trial >= value:
            value = trial
        else:
            current[index] = previous
            taken.remove(add)
            taken.add(previous)
    return current, value


def roll_above(data, settings, rng):
    ready = field(data, settings)
    hero_by_name = ready["hero_by_name"]
    locked = list(ready["paired_names"])
    free_pool = [hero["name"] for hero in ready["kept"]]
    best_free = None
    best_value = -1.0
    for restart in range(4):
        if ready["regular_roster"] <= 0:
            found = []
            value = roster_ideal(data, locked, settings)
        elif restart == 0:
            if settings.get("dropUnknown"):
                paired_heroes = [hero_by_name[name] for name in locked]
                full = build_group(
                    data,
                    ready["kept"] + paired_heroes,
                    ready["size"],
                    settings,
                    rng,
                    hero_by_name,
                    locked=locked,
                )
                start = [name for name in full if name not in set(locked)]
            else:
                regular_pool = min(ready["pool_size"] - len(locked), len(ready["kept"]))
                pool_names = build_group(data, ready["kept"], regular_pool, settings, rng, hero_by_name)
                pool_heroes = [hero_by_name[name] for name in pool_names]
                start = build_group(data, pool_heroes, ready["regular_roster"], settings, rng, hero_by_name)
            current = list(start)
            taken = set(current)
            value = roster_ideal(data, locked + current, settings)
            need = len(current)
            for _ in range(700):
                if round(value, 1) > 90:
                    break
                index = rng.randrange(need)
                add = free_pool[rng.randrange(len(free_pool))]
                if add in taken:
                    continue
                previous = current[index]
                others = [name for name in locked + current if name != previous]
                if settings.get("dropUnknown") and not played_all(data, add, others):
                    continue
                current[index] = add
                taken.remove(previous)
                taken.add(add)
                trial = roster_ideal(data, locked + current, settings)
                if trial >= value:
                    value = trial
                else:
                    current[index] = previous
                    taken.remove(add)
                    taken.add(previous)
            found = current
        else:
            found, value = climb_free(data, settings, rng, free_pool, locked, 700)
        if value > best_value:
            best_free = found
            best_value = value
        if round(best_value, 1) > 90:
            break
    if best_free is None:
        raise ValueError("При этих настройках ростер выше 90% не нашёлся")
    reached = round(best_value, 1) > 90
    roster = list(best_free) + locked
    extras_needed = ready["pool_size"] - len(roster)
    remaining = [hero for hero in ready["kept"] if hero["name"] not in best_free]
    extras = []
    if extras_needed > 0 and remaining:
        extras = build_group(
            data,
            remaining,
            min(extras_needed, len(remaining)),
            settings,
            rng,
            hero_by_name,
            allow_short=True,
        )
    pool_names = list(best_free) + extras + locked
    note = pool_note(ready, len(pool_names))
    if settings["strongPairs"] and not ready["pairs"]:
        note += " Пар сильных не нашлось."
    if settings.get("draft") == "Masters":
        note += " Процент — общий по начальной расстановке, до банов и пиков."
    if reached:
        note += " Идеал выше 90%."
    else:
        note += " Выше 90% не нашлось, показан лучший из найденных."
    excluded = cut_records(hero_by_name, ready["frequent"], ready["strong"], ready["weak"], ready["recent"], ready.get("droppedLatest"))
    roster, pool_names = apply_latest(roster, pool_names, settings, hero_by_name, ready["paired_names"])
    return finish(data, roster, settings, [note], "roll", pool_names, excluded, ready["pair_reasons"])


def rescore(data, settings, roster_names, pool_names, excluded):
    hero_by_name = hero_by_name_map(data)
    roster = []
    for name in roster_names or []:
        if isinstance(name, str) and name in hero_by_name and name not in roster:
            roster.append(name)
    pool = []
    for name in pool_names or []:
        if isinstance(name, str) and name in hero_by_name and name not in pool:
            pool.append(name)
    kept = []
    seen = set(roster)
    for item in excluded or []:
        name = item.get("name") if isinstance(item, dict) else item
        if not isinstance(name, str) or name not in hero_by_name or name in seen:
            continue
        seen.add(name)
        hero = dict(hero_by_name[name])
        hero["reason"] = "не вошёл в пул, общий процент " + format_pct(hero["winRate"])
        kept.append(hero)
    return finish(data, roster, settings, [], "roll", pool, kept)


def score_roster(data, names, settings):
    hero_by_name = hero_by_name_map(data)
    roster = []
    seen = set()
    for name in names or []:
        if not isinstance(name, str) or name in seen or name not in hero_by_name:
            continue
        seen.add(name)
        roster.append(name)
        if len(roster) >= 40:
            break
    return finish(data, roster, settings, [], "build")


def suggest_swaps(data, names, settings, limit=8):
    hero_by_name = hero_by_name_map(data)
    roster = []
    seen = set()
    for name in names or []:
        if isinstance(name, str) and name in hero_by_name and name not in seen:
            seen.add(name)
            roster.append(name)
    if len(roster) < 2:
        return []
    base = roster_ideal(data, roster, settings)
    pool = []
    for hero in list(data["heroes"]) + list(data.get("unplayed") or []):
        name = hero["name"]
        if name in seen:
            continue
        weak = hero.get("games", 0) <= 0 or hero.get("winRate", 0) < WEAK_RATE or name in WEAK_NAMES
        if settings.get("dropWeak") and weak:
            continue
        if settings.get("dropLatest") and name in LATEST_SET:
            continue
        if settings.get("skipRecent") and hero.get("recent"):
            continue
        if event_blocked(hero, settings):
            continue
        pool.append(hero)
    best = []
    for remove in roster:
        if settings.get("latestSet") and remove in LATEST_SET:
            continue
        others = [name for name in roster if name != remove]
        top = None
        for hero in pool:
            add = hero["name"]
            if settings.get("dropUnknown") and not played_all(data, add, others):
                continue
            value = roster_ideal(data, others + [add], settings)
            gain = round(value - base, 1)
            downward = settings.get("direction") == "down"
            if downward:
                if gain >= 0:
                    continue
                better = top is None or gain < top["gain"] or (gain == top["gain"] and add < top["add"])
            else:
                if gain <= 0:
                    continue
                better = top is None or gain > top["gain"] or (gain == top["gain"] and add < top["add"])
            if better:
                top = {
                    "remove": remove,
                    "add": add,
                    "ideal": round(value, 1),
                    "gain": gain,
                    "removeImage": hero_by_name[remove].get("image") or "",
                    "addImage": hero.get("image") or "",
                }
        if top:
            best.append(top)
    if settings.get("direction") == "down":
        best.sort(key=lambda item: (item["gain"], item["remove"], item["add"]))
    else:
        best.sort(key=lambda item: (-item["gain"], item["remove"], item["add"]))
    return best[:limit]


def catalog_item(hero, played=None):
    games = hero.get("games", 0)
    rate = hero.get("winRate", 0)
    return {
        "name": hero["name"],
        "image": hero.get("image", ""),
        "winRate": rate,
        "games": games,
        "aliases": hero.get("aliases") or [],
        "recent": bool(hero.get("recent")),
        "events": list(hero.get("recent") or []),
        "weak": games <= 0 or rate < WEAK_RATE or hero["name"] in WEAK_NAMES,
        "latest": hero["name"] in LATEST_SET,
        "played": played or [],
    }


def hero_catalog(data):
    played = {}
    for (hero, opponent), info in data["wins"].items():
        if hero == opponent or info["games"] < 1:
            continue
        played.setdefault(hero, []).append(opponent)
    catalog = []
    seen = set()
    for hero in list(data["heroes"]) + list(data.get("unplayed") or []):
        if hero["name"] in seen:
            continue
        seen.add(hero["name"])
        catalog.append(catalog_item(hero, played.get(hero["name"], [])))
    catalog.sort(key=lambda item: item["name"])
    return catalog


def suggest_strong_pairs(data, settings):
    hero_by_name = hero_by_name_map(data)
    kept, frequent, strong = split_candidates(data, max(POOL_SIZE, settings["size"]))
    kept, strong = recover_strong(data, kept, frequent, strong)
    if settings["dropWeak"]:
        weak_names = {hero["name"] for hero in weak_roster(data)}
        strong = [name for name in strong if name not in weak_names]
    if settings.get("dropEvents"):
        recent_names = {hero["name"] for hero in dropped_event_heroes(data, settings)}
        strong = [name for name in strong if name not in recent_names]
    if settings.get("dropLatest"):
        latest_names = set(LATEST_SET)
        strong = [name for name in strong if name not in latest_names]
    strong = [name for name in strong if name not in settings["excluded"]]
    return [[left, right] for left, right, _info in pick_strong_pairs(data, strong, settings, hero_by_name)]


def swap(data, settings, roster, remove, add, pool_names=None, excluded=None):
    hero_by_name = hero_by_name_map(data)
    if remove not in roster or add in roster or add not in hero_by_name:
        raise ValueError("Такая замена недоступна")
    if settings.get("latestSet") and remove in LATEST_SET:
        raise ValueError("Хеллбой, Лиз Шерман, Эйб Сапиен и Баба Яга остаются в составе")
    if settings.get("dropLatest") and add in LATEST_SET:
        raise ValueError("Хеллбой, Лиз Шерман, Эйб Сапиен и Баба Яга не берутся")
    if add in settings["excluded"]:
        raise ValueError("Этот герой исключён")
    roster = apply_swap(list(roster), remove, add)
    if isinstance(pool_names, list):
        pool_names = list(pool_names)
        if add not in pool_names:
            pool_names.append(add)
        if remove not in pool_names:
            pool_names.append(remove)
    else:
        pool_names = None
    kept = []
    for item in excluded or []:
        if isinstance(item, dict) and item.get("name") != add:
            kept.append(item)
    info = cell(data, add, remove)
    note = add + " входит вместо " + remove + "."
    if info:
        note += " Личная встреча: " + format_pct(info["pct"]) + " в " + str(info["games"]) + " играх."
    return finish(data, roster, settings, [note], "swap", pool_names, kept)


def finish(data, roster, settings, notes, mode, pool_names=None, excluded=None, pair_reasons=None):
    hero_by_name = hero_by_name_map(data)
    pair_reasons = pair_reasons or {}
    roster = sorted(roster, key=lambda name: name)
    pairs = known_pairs(data, roster, settings)
    if pairs:
        closeness = [max(0.0, 100 - item[3] * 2) for item in pairs]
        ideal = round(sum(closeness) / len(closeness), 1)
    else:
        ideal = 0
    problems = []
    for hero_name, opponent_name, info, deviation, in_band in pairs:
        if in_band:
            continue
        problems.append({
            "hero": hero_by_name[hero_name]["name"],
            "heroImage": hero_by_name[hero_name].get("image", ""),
            "opponent": hero_by_name[opponent_name]["name"],
            "opponentImage": hero_by_name[opponent_name].get("image", ""),
            "pct": info["pct"],
            "wins": info["wins"],
            "losses": info["losses"],
            "games": info["games"],
            "gap": round(deviation, 1),
        })
    problems.sort(key=lambda item: item["gap"], reverse=True)
    heroes = []
    for name in roster:
        hero = dict(hero_by_name[name])
        hero["reason"] = pair_reasons.get(name, why_kept(hero, True))
        heroes.append(hero)

    matrix = []
    for hero in roster:
        row = []
        for opponent in roster:
            if hero == opponent:
                row.append(None)
                continue
            info = cell(data, hero, opponent)
            if not info:
                row.append(None)
                continue
            row.append({
                "pct": info["pct"],
                "wins": info["wins"],
                "losses": info["losses"],
                "games": info["games"],
            })
        matrix.append(row)

    pool = []
    if pool_names:
        for name in sorted(pool_names):
            hero = dict(hero_by_name[name])
            hero["inRoster"] = name in set(roster)
            hero["reason"] = pair_reasons.get(name, why_kept(hero, hero["inRoster"]))
            pool.append(hero)

    duels = {}
    for index, name in enumerate(roster):
        duels[name] = matrix[index]

    def duel_row(name):
        row = []
        for opponent in roster:
            if name == opponent:
                row.append(None)
                continue
            info = cell(data, name, opponent)
            if not info:
                row.append(None)
                continue
            row.append({
                "pct": info["pct"],
                "wins": info["wins"],
                "losses": info["losses"],
                "games": info["games"],
            })
        return row

    for hero in pool + (excluded or []):
        if hero["name"] not in duels:
            duels[hero["name"]] = duel_row(hero["name"])

    catalog = []
    seen = set()
    for hero in list(data["heroes"]) + list(data.get("unplayed") or []):
        if hero["name"] in seen:
            continue
        seen.add(hero["name"])
        catalog.append(catalog_item(hero))
    catalog.sort(key=lambda item: item["name"])

    return {
        "mode": mode,
        "notes": notes,
        "heroes": heroes,
        "catalog": catalog,
        "pool": pool,
        "excluded": excluded or [],
        "matrix": matrix,
        "duels": duels,
        "summary": {
            "knownPairs": len(pairs),
            "ideal": ideal,
            "bandLow": settings["bandLow"],
            "bandHigh": settings["bandHigh"],
            "minGames": settings["minGames"],
            "draft": settings.get("draft") or "",
        },
        "problems": problems,
        "nuances": collect_nuances(data, floor=max(1, int(settings["minGames"])), names=roster)["groups"],
    }
