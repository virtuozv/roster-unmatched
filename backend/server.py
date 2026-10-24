from http.server import ThreadingHTTPServer

from check import check
from constants import HOST, PORT
from data import load_sources
from handler import AppHandler
from maps import load_maps


def main():
    import sys
    if "--check" in sys.argv:
        check()
        return
    AppHandler.sources = load_sources()
    AppHandler.data = AppHandler.sources["all"]
    AppHandler.maps = load_maps()
    server = ThreadingHTTPServer((HOST, PORT), AppHandler)
    print("Matchdraft: http://" + HOST + ":" + str(PORT))
    server.serve_forever()


if __name__ == "__main__":
    main()
