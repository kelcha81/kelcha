"""
New-York-time session / killzone logic for ICT.

The packaged candle data is already session-aligned to a 5pm New York rollover
(see forex-backtest/aggregate.js + package-data.js). To stay consistent we model
time the same way, in America/New_York wall clock.

We compute the US Eastern offset with a pure-Python DST rule rather than relying
on the IANA tz database, because stdlib ``zoneinfo`` needs the ``tzdata`` package
on Windows (no system zone db). The US federal rule — DST from the 2nd Sunday of
March to the 1st Sunday of November — has been stable since 2007 and matches IANA
``America/New_York`` exactly over our data range (2022+), so the bucket
boundaries line up with the JS pipeline.

ICT killzones are defined here in NY local time and are configurable.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

HOUR_MS = 3_600_000
DAY_MS = 86_400_000

EST_OFFSET_MS = -5 * HOUR_MS  # standard time
EDT_OFFSET_MS = -4 * HOUR_MS  # daylight time

# Trading-day rollover hour in NY local time (5pm NY close = classic forex day).
DAY_BOUNDARY_HOUR = 17


def _nth_weekday_utc_midnight(year: int, month: int, weekday: int, n: int) -> datetime:
    """UTC datetime at 00:00 of the n-th given weekday (Mon=0) of a month."""
    d = datetime(year, month, 1, tzinfo=timezone.utc)
    shift = (weekday - d.weekday()) % 7
    return d + timedelta(days=shift + (n - 1) * 7)


def _us_dst_window_utc(year: int) -> tuple[datetime, datetime]:
    """
    UTC instants when US Eastern DST starts/ends for ``year``.

    Start: 2nd Sunday of March, 02:00 EST  -> 07:00 UTC.
    End:   1st Sunday of November, 02:00 EDT -> 06:00 UTC.
    """
    sunday = 6  # Mon=0 .. Sun=6
    start = _nth_weekday_utc_midnight(year, 3, sunday, 2) + timedelta(hours=7)
    end = _nth_weekday_utc_midnight(year, 11, sunday, 1) + timedelta(hours=6)
    return start, end


def is_ny_dst(ts_ms: int) -> bool:
    """True if the given UTC instant is in US Eastern daylight time."""
    dt = datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc)
    start, end = _us_dst_window_utc(dt.year)
    return start <= dt < end


def ny_offset_ms(ts_ms: int) -> int:
    """Offset from UTC for New York at ``ts_ms`` (local = utc + offset)."""
    return EDT_OFFSET_MS if is_ny_dst(ts_ms) else EST_OFFSET_MS


def ny_wall(ts_ms: int) -> datetime:
    """
    A *naive* datetime whose fields read as the NY wall clock for ``ts_ms``.

    Use only for reading calendar fields (hour, weekday, date) — it is not an
    aware datetime and must not be converted back to a timestamp directly.
    """
    return datetime.fromtimestamp((ts_ms + ny_offset_ms(ts_ms)) / 1000, tz=timezone.utc).replace(tzinfo=None)


def trading_day_start(ts_ms: int) -> int:
    """
    UTC ms of the 5pm-NY rollover that opens the session day containing ``ts_ms``.

    Anything from 17:00 NY onwards belongs to the *next* calendar day's session.
    Used for prior-day levels (PDH/PDL) and intraday session ranges.
    """
    w = ny_wall(ts_ms)
    # The session that is "live" started at 17:00 of either today or yesterday.
    boundary_day = w.date() if w.hour >= DAY_BOUNDARY_HOUR else (w - timedelta(days=1)).date()
    # Reconstruct the UTC instant of 17:00 NY on boundary_day. Offset is stable
    # around 17:00 (never a DST switch hour), so a single lookup is exact.
    guess_utc = datetime(boundary_day.year, boundary_day.month, boundary_day.day,
                         DAY_BOUNDARY_HOUR, tzinfo=timezone.utc)
    approx_ms = int(guess_utc.timestamp() * 1000)
    return approx_ms - ny_offset_ms(approx_ms)


# --- killzones (NY local time windows, [start_hour, end_hour)) ----------------

KILLZONES: dict[str, tuple[float, float]] = {
    "asia": (20.0, 0.0),       # 8pm -> midnight NY (wraps)
    "london": (2.0, 5.0),      # London open killzone
    "ny_am": (7.0, 10.0),      # New York AM killzone
    "ny_lunch": (12.0, 13.0),
    "ny_pm": (13.0, 16.0),     # New York PM killzone
    "london_close": (10.0, 12.0),
}


def _hour_in_window(hour: float, start: float, end: float) -> bool:
    if start <= end:
        return start <= hour < end
    return hour >= start or hour < end  # wraps past midnight


def in_killzone(ts_ms: int, name: str, zones: Optional[dict[str, tuple[float, float]]] = None) -> bool:
    z = (zones or KILLZONES).get(name)
    if z is None:
        raise KeyError(f"unknown killzone {name!r}")
    w = ny_wall(ts_ms)
    return _hour_in_window(w.hour + w.minute / 60.0, z[0], z[1])


def killzone_at(ts_ms: int, zones: Optional[dict[str, tuple[float, float]]] = None) -> Optional[str]:
    """Name of the first killzone active at ``ts_ms``, or None."""
    z = zones or KILLZONES
    w = ny_wall(ts_ms)
    hour = w.hour + w.minute / 60.0
    for name, (start, end) in z.items():
        if _hour_in_window(hour, start, end):
            return name
    return None
