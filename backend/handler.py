import json
import os
import random
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, unquote, urlparse

from constants import APP_DIR, IMAGE_DIR, MAP_IMAGE_DIR
from maps import map_settings_from, roll_maps, swap_maps
from balance import list_unknown_heroes
from roster import hero_catalog, rescore, roll, roll_above, score_roster, settings_from, suggest_strong_pairs, suggest_swaps, swap
from saved import delete_roster, load_saved, store_roster


class AppHandler(BaseHTTPRequestHandler):
    data = None
    sources = None
    maps = None

    def data_for(self, source):
        if self.sources and source in self.sources:
            return self.sources[source]
        return self.data

    def log_message(self, fmt, *args):
        print("[" + self.log_date_time_string() + "] " + (fmt % args))

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path or "/"
        if path == "/":
            path = "/index.html"
        if path.startswith("/img/"):
            self.serve_image(IMAGE_DIR, path[len("/img/"):])
            return
        if path.startswith("/maps/"):
            self.serve_image(MAP_IMAGE_DIR, path[len("/maps/"):])
            return
        if path == "/api/counted":
            sources = {}
            for key, data in (self.sources or {"all": self.data}).items():
                sources[key] = {
                    "counted": len(data["heroes"]) + len(data.get("unplayed") or []),
                    "matches": data["matches"],
                }
            current = sources.get("all") or next(iter(sources.values()))
            self.respond(200, {
                "counted": current["counted"],
                "matches": current["matches"],
                "sources": sources,
            })
            return
        if path == "/api/heroes":
            source = parse_qs(parsed.query).get("source", ["all"])[0]
            self.respond(200, {"heroes": hero_catalog(self.data_for(source))})
            return
        if path == "/api/unknown":
            query = parse_qs(parsed.query)
            source = query.get("source", ["all"])[0]
            try:
                min_games = max(0, int(query.get("minGames", ["5"])[0]))
            except ValueError:
                min_games = 5
            self.respond(200, list_unknown_heroes(self.data_for(source), {"minGames": min_games}))
            return
        if path == "/api/maps":
            self.respond(200, {
                "counted": len(self.maps["maps"]),
                "rosters": self.maps["pastTotal"],
            })
            return
        if path == "/api/saved":
            self.respond(200, {"rosters": load_saved()})
            return
        if path.startswith("/api/"):
            self.respond(404, {"error": "Не найдено"})
            return
        relative = path.lstrip("/").replace("/", os.sep)
        file_path = os.path.normpath(os.path.join(APP_DIR, relative))
        if not file_path.startswith(os.path.normpath(APP_DIR)) or not os.path.isfile(file_path):
            self.respond(404, {"error": "Не найдено"})
            return
        content_type = "text/plain; charset=utf-8"
        if file_path.endswith(".html"):
            content_type = "text/html; charset=utf-8"
        elif file_path.endswith(".css"):
            content_type = "text/css; charset=utf-8"
        elif file_path.endswith(".js"):
            content_type = "text/javascript; charset=utf-8"
        with open(file_path, "rb") as handle:
            body = handle.read()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        length = int(self.headers.get("Content-Length", "0"))
        if length > 100_000:
            self.respond(400, {"error": "Слишком большой запрос"})
            return
        raw = self.rfile.read(length) if length else b"{}"
        try:
            payload = json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            self.respond(400, {"error": "Некорректный JSON"})
            return
        if self.path in ("/api/maps/roll", "/api/maps/swap"):
            self.handle_maps(payload)
            return
        if self.path == "/api/saved":
            try:
                if payload.get("remove"):
                    rosters = delete_roster(payload.get("name"))
                else:
                    rosters = store_roster(payload.get("name"), payload.get("names") or [], self.data_for(payload.get("source")))
            except ValueError as error:
                self.respond(400, {"error": str(error)})
                return
            self.respond(200, {"rosters": rosters})
            return
        settings = settings_from(payload)
        data = self.data_for(payload.get("source"))
        rng = random.Random()
        try:
            if self.path == "/api/roll":
                result = roll(data, settings, rng)
            elif self.path == "/api/roll/above":
                result = roll_above(data, settings, rng)
            elif self.path == "/api/build":
                names = payload.get("names")
                result = score_roster(data, names if isinstance(names, list) else [], settings)
            elif self.path == "/api/build/pairs":
                result = {"pairs": suggest_strong_pairs(data, settings)}
            elif self.path == "/api/build/swaps":
                names = payload.get("names")
                result = {"swaps": suggest_swaps(data, names if isinstance(names, list) else [], settings)}
            elif self.path == "/api/rescore":
                result = rescore(
                    data,
                    settings,
                    payload.get("roster") or [],
                    payload.get("pool") or [],
                    payload.get("excluded") or [],
                )
            elif self.path == "/api/swap":
                pool_names = payload.get("pool")
                excluded = payload.get("excluded")
                result = swap(
                    data,
                    settings,
                    payload.get("roster") or [],
                    payload.get("remove"),
                    payload.get("add"),
                    pool_names if isinstance(pool_names, list) else None,
                    excluded if isinstance(excluded, list) else None,
                )
            else:
                self.respond(404, {"error": "Не найдено"})
                return
        except ValueError as error:
            self.respond(400, {"error": str(error)})
            return
        self.respond(200, result)

    def handle_maps(self, payload):
        settings = map_settings_from(payload, len(self.maps["maps"]))
        rng = random.Random()
        try:
            if self.path == "/api/maps/roll":
                result = roll_maps(self.maps, settings, rng)
            elif self.path == "/api/maps/swap":
                result = swap_maps(
                    self.maps,
                    settings,
                    payload.get("roster") or [],
                    payload.get("remove"),
                    payload.get("add"),
                )
            else:
                self.respond(404, {"error": "Не найдено"})
                return
        except ValueError as error:
            self.respond(400, {"error": str(error)})
            return
        self.respond(200, result)

    def serve_image(self, directory, name):
        filename = os.path.basename(unquote(name))
        root = os.path.normpath(directory)
        file_path = os.path.normpath(os.path.join(root, filename))
        if not file_path.startswith(root) or not os.path.isfile(file_path):
            self.respond(404, {"error": "Картинка не найдена"})
            return
        content_type = "image/jpeg"
        if file_path.lower().endswith(".png"):
            content_type = "image/png"
        elif file_path.lower().endswith(".webp"):
            content_type = "image/webp"
        with open(file_path, "rb") as handle:
            body = handle.read()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def respond(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
