import json
import os
import random
import tempfile

from constants import LATEST_SET, RECENT_EVENTS, ROSTER_PATH
from data import load_sources
from maps import load_maps, map_settings_from, roll_maps, swap_maps
from nuances import collect_nuances
from roster import hero_catalog, roll, roll_above, roster_ideal, score_roster, settings_from, split_candidates, suggest_strong_pairs, suggest_swaps, swap, weak_roster
from saved import delete_roster, load_saved, store_roster

NO_PORTRAIT = {"Хеллбой", "Лиз Шерман", "Эйб Сапиен", "Баба Яга"}


def check():
    sources = load_sources()
    data = sources["all"]
    club = sources["umleague"]
    achilles = club["wins"][("Ахиллес", "Мисс Марвел")]
    marvel = club["wins"][("Мисс Марвел", "Ахиллес")]
    if achilles["wins"] != 6 or achilles["losses"] != 0 or marvel["wins"] != 0 or marvel["losses"] != 6:
        raise SystemExit("UmLeague: Ахиллес — Мисс Марвел прочитан неверно")
    club_games = sum(hero["games"] for hero in club["heroes"])
    if club["matches"] != club_games // 2 or club_games % 2:
        raise SystemExit("UmLeague: число учтённых матчей не сходится")
    if data["matches"] != sources["saskia"]["matches"] + club["matches"]:
        raise SystemExit("Общий процент не равен сумме Саскии и UmLeague")
    info = data["wins"][("Сунь Укун", "Ахиллес")]
    saskia = sources["saskia"]["wins"].get(("Сунь Укун", "Ахиллес"), {"wins": 0, "losses": 0})
    club_pair = club["wins"].get(("Сунь Укун", "Ахиллес"), {"wins": 0, "losses": 0})
    if info["wins"] != saskia["wins"] + club_pair["wins"] or info["losses"] != saskia["losses"] + club_pair["losses"]:
        raise SystemExit("Матчап Сунь Укун — Ахиллес не сложился из Саскии и UmLeague")
    settings = settings_from({})
    result = roll(data, settings, random.Random(3))
    if len(result["heroes"]) != 15 or len(result["pool"]) != 20:
        raise SystemExit("Нужны ростер из 15 и пул из 20")
    names = [hero["name"] for hero in result["heroes"]]
    pool_names = [hero["name"] for hero in result["pool"]]
    if len(set(names)) != 15 or not set(names).issubset(pool_names):
        raise SystemExit("Ростер должен быть внутри пула")
    if set(result["duels"]) < set(names) or any(len(result["duels"][name]) != 15 for name in names):
        raise SystemExit("Матчапы для наведения не совпали с ростером")
    _kept, frequent, strong = split_candidates(data)
    banned = set(frequent) | set(strong)
    if banned and set(pool_names) & banned:
        raise SystemExit("В пул попал исключённый герой")
    if not result["excluded"] or any(not item.get("reason") for item in result["excluded"]):
        raise SystemExit("У отсечённых героев нет причины")
    if any(not hero.get("reason") for hero in result["heroes"]):
        raise SystemExit("У героев ростера нет обоснования")
    played = sum(hero["games"] for hero in data["heroes"])
    if data["matches"] != played // 2 or played % 2:
        raise SystemExit("Число учтённых матчей не сходится")
    with open(ROSTER_PATH, encoding="utf-8") as handle:
        roster_names = {character["name"] for character in json.load(handle)["characters"]}
    missing = [
        hero["name"] for hero in data["heroes"]
        if hero["name"] in roster_names and not hero.get("image") and hero["name"] not in NO_PORTRAIT
    ]
    if missing:
        raise SystemExit("Нет картинок: " + ", ".join(missing))
    if len(result["matrix"]) != 15 or any(len(row) != 15 or row[index] is not None for index, row in enumerate(result["matrix"])):
        raise SystemExit("Тепловое поле должно быть 15 на 15")
    wide = roll(data, settings_from({"size": 20}), random.Random(4))
    if len(wide["heroes"]) != 20 or len(wide["pool"]) < 20:
        raise SystemExit("Ростер из 20 не собрался")
    if not set(hero["name"] for hero in wide["heroes"]).issubset(hero["name"] for hero in wide["pool"]):
        raise SystemExit("Ростер из 20 вышел за пул")
    ideal = result["summary"]["ideal"]
    if not isinstance(ideal, (int, float)) or ideal < 0 or ideal > 100:
        raise SystemExit("Идеальность должна быть процентом")
    if any(45 <= item["pct"] <= 55 for item in result["problems"]):
        raise SystemExit("В проблемные места попала ровная пара")
    wide_band = roll(data, settings_from({"bandLow": 40, "bandHigh": 60}), random.Random(2))
    if any(40 <= item["pct"] <= 60 for item in wide_band["problems"]):
        raise SystemExit("Коридор 40–60 не применился")
    if wide_band["summary"]["bandLow"] != 40 or wide_band["summary"]["bandHigh"] != 60:
        raise SystemExit("Границы коридора не сохранились")
    paired = roll(data, settings_from({"strongPairs": 1}), random.Random(7))
    strong_set = set(strong)
    in_roster = [hero["name"] for hero in paired["heroes"] if hero["name"] in strong_set]
    paired_pool = [hero["name"] for hero in paired["pool"]]
    excluded_names = {item["name"] for item in paired["excluded"]}
    if len(in_roster) != 2 or not set(in_roster).issubset(paired_pool):
        raise SystemExit("Одна пара сильных должна дать двух героев в ростере")
    if excluded_names & set(in_roster) or (strong_set - set(in_roster) - excluded_names):
        raise SystemExit("Сильные без пары должны остаться вне пула")
    if set(paired_pool) & (strong_set - set(in_roster)):
        raise SystemExit("Непарный сильный герой попал в пул")
    two = roll(data, settings_from({"strongPairs": 2}), random.Random(8))
    two_names = [hero["name"] for hero in two["heroes"] if hero["name"] in strong_set]
    if len(two_names) != 4:
        raise SystemExit("Две пары сильных должны дать четырёх героев")
    outside = next(hero["name"] for hero in data["heroes"] if hero["name"] not in names)
    swapped = swap(data, settings, names, names[0], outside, pool_names, result["excluded"])
    swapped_names = [hero["name"] for hero in swapped["heroes"]]
    if names[0] in swapped_names or outside not in swapped_names:
        raise SystemExit("Замена не применилась")
    if not isinstance(swapped["summary"]["ideal"], (int, float)):
        raise SystemExit("После замены нет процента ростера")
    if outside not in {item["name"] for item in swapped["catalog"]}:
        raise SystemExit("В списке замены нет героев")
    without_weak = roll(data, settings_from({"dropWeak": True}), random.Random(9))
    weak_names = {hero["name"] for hero in weak_roster(data)}
    seen = {hero["name"] for hero in without_weak["heroes"]} | {hero["name"] for hero in without_weak["pool"]}
    excluded_names = {item["name"] for item in without_weak["excluded"]}
    if seen & weak_names:
        raise SystemExit("Слабый герой попал в пул")
    if not {"Ангел", "Спайк", "Девушка-Белка", "Виллоу", "Баффи"} <= excluded_names:
        raise SystemExit("Ангел, Спайк, Белка, Виллоу или Баффи не выбыли")
    if any(not item.get("image") and item["name"] not in NO_PORTRAIT for item in without_weak["excluded"] if item["name"] in weak_names):
        raise SystemExit("У слабого героя нет картинки")
    fresh = roll(data, settings_from({"dropRecent": True}), random.Random(11))
    recent_names = {hero["name"] for hero in data["heroes"] if hero["recent"]}
    seen = {hero["name"] for hero in fresh["heroes"]} | {hero["name"] for hero in fresh["pool"]}
    if seen & recent_names:
        raise SystemExit("Герой Weekcup или Chance попал в пул")
    if not recent_names <= {item["name"] for item in fresh["excluded"]}:
        raise SystemExit("Участник Weekcup или Chance не выбыл")
    known = roll(data, settings_from({"dropUnknown": True}), random.Random(6))
    known_names = [hero["name"] for hero in known["heroes"]]
    for index, left in enumerate(known_names):
        for right in known_names[index + 1:]:
            played = data["wins"].get((left, right)) or data["wins"].get((right, left))
            if not played or played["games"] < 1:
                raise SystemExit("В ростере осталась пара без матчей")
    high = roll_above(data, settings, random.Random(5))
    high_names = {hero["name"] for hero in high["heroes"]}
    if len(high_names) != 15 or not isinstance(high["summary"]["ideal"], (int, float)):
        raise SystemExit("Ростер выше 90% не собрался")
    if not high_names <= {hero["name"] for hero in high["pool"]}:
        raise SystemExit("Ростер выше 90% вышел за пул")
    if high_names & banned:
        raise SystemExit("В ростер выше 90% попал исключённый герой")
    built = score_roster(data, ["Сунь Укун", "Ахиллес", "Сунь Укун", "нет такого"], settings)
    expect = round(max(0.0, 100 - abs(info["pct"] - 50) * 2), 1)
    built_names = [hero["name"] for hero in built["heroes"]]
    if built_names != ["Ахиллес", "Сунь Укун"] or built["summary"]["knownPairs"] != 1 or built["summary"]["ideal"] != expect:
        raise SystemExit("Конструктор считает идеал не так, как ростер")
    catalog = hero_catalog(data)
    if len(catalog) < len(data["heroes"]):
        raise SystemExit("В конструкторе не хватает героев")
    by_name = {item["name"]: item for item in catalog}
    if not by_name["Баффи"]["weak"] or by_name["Ахиллес"]["weak"] or "Мисс Марвел" not in by_name["Ахиллес"]["played"]:
        raise SystemExit("Каталог конструктора не пометил слабых и сыгранные пары")
    if not any(item["events"] for item in catalog) or any(not isinstance(item["events"], list) for item in catalog):
        raise SystemExit("Каталог не отдаёт Weekcup и Chance")
    pairs = suggest_strong_pairs(data, settings_from({"strongPairs": 1}))
    if len(pairs) != 1 or len(set(pairs[0])) != 2:
        raise SystemExit("Конструктор не нашёл пару сильных")
    required = {"Хеллбой", "Лиз Шерман", "Эйб Сапиен", "Баба Яга"}
    latest = roll(data, settings_from({"latestSet": True, "dropWeak": True}), random.Random(3))
    latest_names = {hero["name"] for hero in latest["heroes"]}
    if len(latest["heroes"]) != 15 or not required <= latest_names:
        raise SystemExit("Последний набор не вошёл в ростер")
    if required & {item["name"] for item in latest["excluded"]}:
        raise SystemExit("Герои последнего набора попали в исключённых")
    if not all(by_name[name]["latest"] for name in required):
        raise SystemExit("Каталог не пометил последний набор")
    blocked_latest = roll(data, settings_from({"dropLatest": True, "dropWeak": True}), random.Random(4))
    blocked_seen = {hero["name"] for hero in blocked_latest["heroes"]} | {hero["name"] for hero in blocked_latest["pool"]}
    if required & blocked_seen:
        raise SystemExit("Последний набор попал в пул при запрете")
    if not required <= {item["name"] for item in blocked_latest["excluded"]}:
        raise SystemExit("Последний набор не выбыл при запрете")
    week_only = roll(data, settings_from({"dropEvents": ["Weekcup"]}), random.Random(8))
    week_seen = {hero["name"] for hero in week_only["heroes"]} | {hero["name"] for hero in week_only["pool"]}
    week_names = {
        hero["name"]
        for hero in list(data["heroes"]) + list(data.get("unplayed") or [])
        if "Weekcup" in (hero.get("recent") or [])
    }
    if week_seen & week_names:
        raise SystemExit("Герой Weekcup попал в пул при исключении турнира")
    check_saved(data)
    check_swaps(data)
    masters_settings = settings_from({"draft": "Masters", "size": 30})
    masters = roll(data, masters_settings, random.Random(2))
    masters_names = [hero["name"] for hero in masters["heroes"]]
    masters_expect = round(roster_ideal(data, masters_names, masters_settings), 1)
    if len(masters_names) != 30 or masters["summary"].get("draft") != "Masters" or masters["summary"]["ideal"] != masters_expect:
        raise SystemExit("Masters должен считать общий процент начальной тридцатки")
    check_maps()
    check_nuances(data)
    print("ok", ideal, len(result["problems"]), result["summary"]["knownPairs"])


def check_swaps(data):
    settings = settings_from({})
    names = ["Ахиллес", "Сунь Укун", "Баффи", "Спайк"]
    swaps = suggest_swaps(data, names, settings)
    if not swaps:
        raise SystemExit("Для слабого состава не нашлось замены")
    base = roster_ideal(data, names, settings)
    for swap in swaps:
        if swap["gain"] <= 0 or swap["remove"] not in names or swap["add"] in names:
            raise SystemExit("Замена не поднимает процент")
        trial = [name for name in names if name != swap["remove"]] + [swap["add"]]
        if round(roster_ideal(data, trial, settings), 1) != swap["ideal"] or swap["ideal"] <= round(base, 1):
            raise SystemExit("Процент после замены посчитан неверно")
    locked = suggest_swaps(data, names + ["Хеллбой"], settings_from({"latestSet": True}))
    if any(swap["remove"] == "Хеллбой" for swap in locked):
        raise SystemExit("Последний набор предложили заменить")
    recent = {hero["name"] for hero in list(data["heroes"]) + list(data.get("unplayed") or []) if hero.get("recent")}
    quiet = suggest_swaps(data, names, settings_from({"skipRecent": True}))
    if any(swap["add"] in recent for swap in quiet):
        raise SystemExit("Замена взяла героя из последних турниров")
    lowered = suggest_swaps(data, names, settings_from({"direction": "down"}))
    if not lowered or any(swap["gain"] >= 0 or swap["ideal"] >= round(base, 1) for swap in lowered):
        raise SystemExit("Замена не убавляет процент")


def check_saved(data):
    handle = tempfile.NamedTemporaryFile(suffix=".csv", delete=False)
    path = handle.name
    handle.close()
    try:
        store_roster("Один", ["Ахиллес", "нет такого", "Сунь Укун"], data, path)
        store_roster("Два", ["Хеллбой"], data, path)
        store_roster("Один", ["Баба Яга", "Лиз Шерман"], data, path)
        rows = {row["name"]: row["heroes"] for row in load_saved(path)}
        if set(rows) != {"Один", "Два"} or rows["Один"] != ["Баба Яга", "Лиз Шерман"] or rows["Два"] != ["Хеллбой"]:
            raise SystemExit("Сохранённые ростеры затёрли друг друга")
        left = {row["name"]: row["heroes"] for row in delete_roster("Два", path)}
        if set(left) != {"Один"} or left["Один"] != ["Баба Яга", "Лиз Шерман"]:
            raise SystemExit("Удаление ростера задело остальные")
    finally:
        os.remove(path)


def check_nuances(data):
    scope = ["Хеллбой", "Пандора", "Лиз Шерман"]
    groups = {group["id"]: group for group in collect_nuances(data, names=scope)["groups"]}
    if set(groups) != {"one", "sweep", "thin", "lopsided", "quiet"}:
        raise SystemExit("Нюансы: не те группы")
    one = {(row["hero"], row["opponent"]) for row in groups["one"]["rows"]}
    if one != {("Хеллбой", "Пандора")}:
        raise SystemExit("Нюансы: Хеллбой — Пандора не в одном матче")
    quiet = {row["hero"] for row in groups["quiet"]["rows"]}
    if quiet != {"Хеллбой", "Лиз Шерман"}:
        raise SystemExit("Нюансы взяли героя вне ростера")
    rolled = roll(data, settings_from({}), random.Random(1))
    names = {hero["name"] for hero in rolled["heroes"]}
    for group in rolled["nuances"]:
        for row in group["rows"]:
            outside = row["hero"] not in names
            if group["id"] != "quiet":
                outside = outside or row["opponent"] not in names
            if outside:
                raise SystemExit("Нюансы ростера вышли за его состав")


def check_maps():
    data = load_maps()
    missing = {"New York City", "Technodrome", "The White House"}
    if len(data["maps"]) != 34 or set(data["withoutImage"]) != missing:
        raise SystemExit("Новые карты без картинки должны оставаться в ростере")
    alamo = next(item for item in data["maps"] if item["name"] == "The Alamo")
    if "Alamo" not in alamo["aliases"] or set(alamo["recent"]) != {"Last Chance 2026", "First Chance 2026"}:
        raise SystemExit("Alamo не привязан к Last Chance и First Chance")
    sarpedon = next(item for item in data["maps"] if item["name"] == "Sarpedon")
    if set(sarpedon["recent"]) != {"Last Chance 2026", "First Chance 2026", "Weekcup"}:
        raise SystemExit("Sarpedon должен быть в трёх последних турнирах")
    soho = next(item for item in data["maps"] if item["name"] == "Soho")
    if soho["recent"] or not soho["image"].startswith("/maps/"):
        raise SystemExit("Soho должен быть свободной картой с картинкой")
    if map_settings_from({}, len(data["maps"]))["overlap"] != 3:
        raise SystemExit("По умолчанию нужны 3 совпадения")
    settings = map_settings_from({"size": 12, "overlap": 3, "dropEvents": list(RECENT_EVENTS)}, len(data["maps"]))
    result = roll_maps(data, settings, random.Random(3))
    names = [item["name"] for item in result["maps"]]
    repeated = [item for item in result["maps"] if item["recent"]]
    if len(names) != 12 or len(set(names)) != 12 or len(repeated) != 3:
        raise SystemExit("Ростер из 12 должен включать 3 карты прошлых турниров")
    if not missing <= set(names):
        raise SystemExit("New York City, Technodrome или The White House не попали в ростер")
    if result["summary"]["fresh"] != 9 or result["summary"]["freshPct"] != 75:
        raise SystemExit("Процент должен считать карты вне Last Chance и Weekcup")
    if not result["excluded"]:
        raise SystemExit("Карты последних турниров не показаны")
    clean = roll_maps(data, map_settings_from({"size": 12, "overlap": 0, "dropEvents": list(RECENT_EVENTS)}, 34), random.Random(4))
    if clean["summary"]["freshPct"] != 100 or any(item["recent"] for item in clean["maps"]):
        raise SystemExit("Ноль совпадений должен обойтись без карт последних турниров")
    wide = roll_maps(data, map_settings_from({"size": 25, "overlap": 3, "dropEvents": list(RECENT_EVENTS)}, 34), random.Random(2))
    if wide["summary"]["fresh"] != 19:
        raise SystemExit("Лишние места должны заполняться картами последних турниров")
    removed = clean["maps"][0]["name"]
    swapped = swap_maps(data, settings, [item["name"] for item in clean["maps"]], removed, "The Alamo")
    swapped_names = [item["name"] for item in swapped["maps"]]
    if removed in swapped_names or "The Alamo" not in swapped_names:
        raise SystemExit("Замена карты не применилась")
    if swapped["summary"]["freshPct"] >= 100:
        raise SystemExit("Замена на карту Last Chance не снизила процент")
