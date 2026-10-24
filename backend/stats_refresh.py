import threading
import traceback

from club_winrate import refresh_all
from data import load_sources

_lock = threading.Lock()
_state = {
    "running": False,
    "finished": False,
    "error": None,
    "done": 0,
    "total": 0,
    "percent": 0,
    "label": "",
    "detail": "",
}


def status():
    with _lock:
        return dict(_state)


def _set(**fields):
    with _lock:
        _state.update(fields)


def _run(on_reload):
    try:
        def on_progress(progress):
            _set(
                running=True,
                finished=False,
                error=None,
                done=progress["done"],
                total=progress["total"],
                percent=progress["percent"],
                label=progress["label"],
                detail=progress.get("detail") or "",
            )

        refresh_all(on_progress=on_progress)
        if on_reload:
            on_reload(load_sources())
        _set(running=False, finished=True, percent=100, label="Готово", detail="")
    except Exception as exc:
        _set(
            running=False,
            finished=True,
            error=str(exc),
            label="Ошибка",
            detail="",
        )
        traceback.print_exc()


def start(on_reload=None):
    with _lock:
        if _state["running"]:
            return False, status()
        _state.update({
            "running": True,
            "finished": False,
            "error": None,
            "done": 0,
            "total": 0,
            "percent": 0,
            "label": "Старт",
            "detail": "",
        })
    thread = threading.Thread(target=_run, args=(on_reload,), daemon=True)
    thread.start()
    return True, status()


def reset_error():
    """Сброс зависшего finished/error, чтобы можно было запустить снова из UI."""
    with _lock:
        if _state["running"]:
            return status()
        _state.update({
            "finished": False,
            "error": None,
            "done": 0,
            "total": 0,
            "percent": 0,
            "label": "",
            "detail": "",
        })
        return dict(_state)
