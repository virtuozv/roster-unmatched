"""Не используется.

Статистика берётся только с the-unmatched.club (source=tabletopleague и
source=unmatchedru) через club_winrate.refresh_all.
Имена героев — в names_map.
"""

from names_map import EXTRA, load_names, normalize, russian_name

__all__ = ["EXTRA", "load_names", "normalize", "russian_name"]
