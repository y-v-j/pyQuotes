#!/usr/bin/env python3
"""
pyQuotes — a lightweight desktop quote widget.

Shows a greeting, the date and time, and a rotating literary quote on a
rounded "Midnight Ink" card. Fully configurable through a plain JSON config
file that is hot-reloaded on save, or through the right-click menu.

Design goals:
- Zero third-party dependencies (Tkinter + ctypes/libX11 only).
- Stays on the desktop: the window is managed by the window manager and asks
  (via EWMH hints) to be kept BELOW all other windows, undecorated, sticky,
  and hidden from the taskbar, pager and Alt+Tab. Unmanaged
  (`overrideredirect`) windows would instead float above everything on
  KWin / XWayland.
- Smooth, antialiased text when Tk is built with Xft (e.g. conda-forge's
  `tk=*=xft_*`); a Nerd Font enables the header icon.
- Crash-proof periodic timers (safe_after + try/finally blocks) so
  unexpected errors in quote formatting or config reloading never freeze it.

Usage:
    python3 pyconky.py

Right-click the widget for a quick menu (new quote, edit config, toggle
lock/margins, quit). Left-click-drag to move it while unlocked.
"""

import getpass
import json
import os
import random
import shutil
import subprocess
import sys
import time
import tkinter as tk
import tkinter.font as tkfont
from tkinter import messagebox

try:
    from quotes_data import QUOTES
except ImportError:
    QUOTES = [
        ("There is some good in this world, and it’s worth fighting for.", "J.R.R. Tolkien", "The Two Towers"),
        ("It is only with the heart that one can see rightly; what is essential is invisible to the eye.", "Antoine de Saint-Exupéry", "The Little Prince")
    ]

CONFIG_DIR = os.path.expanduser("~/.config/pyconky")
CONFIG_PATH = os.path.join(CONFIG_DIR, "config.json")
DECK_PATH = os.path.join(CONFIG_DIR, "quote_deck.json")
CONFIG_VERSION = 2

# First installed family wins when "font_family" is null or not installed.
FONT_CANDIDATES = ("FantasqueSansM Nerd Font", "FantasqueSansM Nerd Font Mono",
                   "Fantasque Sans Mono", "JetBrainsMono Nerd Font",
                   "DejaVu Sans Mono", "monospace")

DEFAULT_CONFIG = {
    "config_version": CONFIG_VERSION,
    "username_override": None,        # e.g. "Alex" — null = use OS username
    "font_family": None,              # null = auto (Fantasque Sans Mono Nerd Font first)
    "font_size": 15,                  # base text size in pixels
    "font_color": "#e8e8f2",
    "accent_color": "#c4b5fd",        # lavender: quote mark, divider start
    "secondary_color": "#f9a8d4",     # rose: greeting and author
    "clock_color": "#7dd3fc",         # sky blue: time
    "bg_color": "#191926",
    "card_color": "#20202f",
    "bg_opacity": 0.96,               # 0.0 (invisible) - 1.0 (opaque)
    "show_margins": True,
    "margin_size": 18,
    # Top-right, just left of pySysMon's column (24 + 410 + 16 gap) so
    # the two widgets never overlap. Offsets are from the usable work area
    # (screen minus panels).
    "corner": "top-right",            # top-left | top-right | bottom-left | bottom-right
    "offset_x": 450,
    "offset_y": 24,
    "width": 410,
    "quote_refresh_minutes": 1,       # minutes between quotes (min 5 seconds)
    "quote_max_chars": 300,           # longer quotes are skipped
    "locked": True,                   # True = pinned, ignores drag
    "date_format": "%A, %d %B %Y",
    "time_format": "%H:%M:%S",
}

# Keys reset when upgrading a config written by an older version
STYLE_KEYS = ("font_family", "font_size", "font_color", "accent_color", "secondary_color",
              "clock_color", "bg_color", "card_color", "bg_opacity", "show_margins",
              "margin_size", "corner", "offset_x", "offset_y", "width")
OBSOLETE_KEYS = ("font_style", "own_window_type")


def ensure_config():
    os.makedirs(CONFIG_DIR, exist_ok=True)
    if not os.path.exists(CONFIG_PATH):
        save_config(DEFAULT_CONFIG)
        return CONFIG_PATH
    # One-time upgrade of pre-v2 configs to the new look and position; the
    # user's other preferences (quote timing, formats, name, lock) are kept.
    try:
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            cfg = json.load(f)
        if isinstance(cfg, dict) and cfg.get("config_version", 1) < CONFIG_VERSION:
            shutil.copy2(CONFIG_PATH, CONFIG_PATH + ".v1.bak")
            for key in STYLE_KEYS:
                cfg[key] = DEFAULT_CONFIG[key]
            for key in OBSOLETE_KEYS:
                cfg.pop(key, None)
            cfg["config_version"] = CONFIG_VERSION
            save_config(cfg)
    except Exception as e:
        sys.stderr.write(f"[pyQuotes Config Warning]: Could not upgrade config: {e}\n")
    return CONFIG_PATH


def load_config():
    """Load config safely, filling in any missing keys with defaults."""
    cfg = {}
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                cfg = json.load(f)
        except Exception as e:
            sys.stderr.write(f"[pyQuotes Config Warning]: Failed to parse {CONFIG_PATH}: {e}\n")
            cfg = {}
    merged = dict(DEFAULT_CONFIG)
    if isinstance(cfg, dict):
        merged.update(cfg)
    return merged


def save_config(cfg):
    try:
        with open(CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump(cfg, f, indent=4)
    except Exception as e:
        sys.stderr.write(f"[pyQuotes Save Config Error]: {e}\n")


def eligible_quotes(max_chars):
    """Quotes that fit within max_chars (falls back to the shortest few if
    none fit)."""
    try:
        max_c = int(max_chars)
    except (ValueError, TypeError):
        max_c = 300
    valid = [q for q in QUOTES if isinstance(q, (tuple, list)) and len(q) == 3 and q[0]]
    candidates = [tuple(q) for q in valid if len(q[0]) <= max_c]
    if not candidates:
        candidates = [tuple(q) for q in sorted(valid, key=lambda q: len(q[0]))[:5]]
    return candidates or [("Keep calm and carry on.", "Unknown", "")]


class QuoteDeck:
    """Shuffled 'deck' of quotes: every eligible quote is shown once, in
    random order, before any quote repeats. The remaining deck is saved so
    the cycle continues across restarts and logins."""

    def __init__(self, path):
        self.path = path
        self.remaining = []
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, list):
                self.remaining = [t for t in data if isinstance(t, str)]
        except Exception:
            pass

    def _save(self):
        try:
            with open(self.path, "w", encoding="utf-8") as f:
                json.dump(self.remaining, f, ensure_ascii=False)
        except Exception as e:
            sys.stderr.write(f"[pyQuotes Deck Save Error]: {e}\n")

    def next(self, max_chars, current=None):
        by_text = {q[0]: q for q in eligible_quotes(max_chars)}
        # Drop quotes that were removed from quotes_data.py or are now too long
        self.remaining = [t for t in self.remaining if t in by_text]
        if current and current[0] in self.remaining:
            self.remaining.remove(current[0])
        if not self.remaining:
            deck = list(by_text)
            random.shuffle(deck)
            # Don't start the new round with the quote that ended the last one
            if current and len(deck) > 1 and deck[0] == current[0]:
                deck.append(deck.pop(0))
            self.remaining = deck
        text = self.remaining.pop(0)
        self._save()
        return by_text[text]


def mix_color(c1, c2, t):
    """Blend two #rrggbb colors; t=0 -> c1, t=1 -> c2."""
    try:
        a = [int(c1[i:i + 2], 16) for i in (1, 3, 5)]
        b = [int(c2[i:i + 2], 16) for i in (1, 3, 5)]
    except (ValueError, TypeError, IndexError):
        return c1
    return "#" + "".join(f"{round(x + (y - x) * t):02x}" for x, y in zip(a, b))


def greeting():
    hour = time.localtime().tm_hour
    if hour < 5:
        return "Good night"
    if hour < 12:
        return "Good morning"
    if hour < 17:
        return "Good afternoon"
    return "Good evening"


# ------------------------------------------------------------------------------
# X11 / EWMH helper (pure ctypes + libX11, no extra packages or CLI tools)
# Keeps the widget below all windows, undecorated, on every virtual desktop,
# out of the taskbar / pager / Alt+Tab, and reads the usable work area.
# ------------------------------------------------------------------------------
class X11Desktop:
    STATES = ("_NET_WM_STATE_BELOW", "_NET_WM_STATE_STICKY",
              "_NET_WM_STATE_SKIP_TASKBAR", "_NET_WM_STATE_SKIP_PAGER",
              "_KDE_NET_WM_STATE_SKIP_SWITCHER")

    def __init__(self):
        self.xlib = None
        self.display = None
        try:
            import ctypes
            import ctypes.util
            xlib = ctypes.cdll.LoadLibrary(ctypes.util.find_library("X11") or "libX11.so.6")
            vp, ul, ci = ctypes.c_void_p, ctypes.c_ulong, ctypes.c_int
            xlib.XOpenDisplay.restype = vp
            xlib.XOpenDisplay.argtypes = [ctypes.c_char_p]
            xlib.XInternAtom.restype = ul
            xlib.XInternAtom.argtypes = [vp, ctypes.c_char_p, ci]
            xlib.XDefaultRootWindow.restype = ul
            xlib.XDefaultRootWindow.argtypes = [vp]
            xlib.XChangeProperty.argtypes = [vp, ul, ul, ul, ci, ci, vp, ci]
            xlib.XSendEvent.argtypes = [vp, ul, ci, ctypes.c_long, vp]
            xlib.XFlush.argtypes = [vp]
            xlib.XFree.argtypes = [vp]
            xlib.XQueryTree.argtypes = [vp, ul, ctypes.POINTER(ul), ctypes.POINTER(ul),
                                        ctypes.POINTER(vp), ctypes.POINTER(ctypes.c_uint)]
            xlib.XGetWindowProperty.argtypes = [vp, ul, ul, ctypes.c_long, ctypes.c_long, ci, ul,
                                                ctypes.POINTER(ul), ctypes.POINTER(ci),
                                                ctypes.POINTER(ul), ctypes.POINTER(ul),
                                                ctypes.POINTER(vp)]
            display = xlib.XOpenDisplay(None)
            if display:
                self.ct, self.xlib, self.display = ctypes, xlib, display
        except Exception:
            pass

    def _atom(self, name):
        return self.xlib.XInternAtom(self.display, name.encode(), 0)

    def _wrapper(self, inner):
        """Tk's managed toplevel is the parent of the widget's inner window."""
        ct = self.ct
        root, parent = ct.c_ulong(), ct.c_ulong()
        children, n = ct.c_void_p(), ct.c_uint()
        if not self.xlib.XQueryTree(self.display, inner, ct.byref(root), ct.byref(parent),
                                    ct.byref(children), ct.byref(n)):
            return None
        if children:
            self.xlib.XFree(children)
        return parent.value if parent.value and parent.value != root.value else inner

    def workarea(self):
        """(x, y, w, h) of the usable screen area excluding panels, or None."""
        if not self.display:
            return None
        ct = self.ct
        actual_type, actual_format = ct.c_ulong(), ct.c_int()
        nitems, after, data = ct.c_ulong(), ct.c_ulong(), ct.c_void_p()
        root = self.xlib.XDefaultRootWindow(self.display)
        ok = self.xlib.XGetWindowProperty(self.display, root, self._atom("_NET_WORKAREA"), 0, 4,
                                          0, 6, ct.byref(actual_type), ct.byref(actual_format),
                                          ct.byref(nitems), ct.byref(after), ct.byref(data))
        if ok != 0 or not data:
            return None
        try:
            if actual_format.value != 32 or nitems.value < 4:
                return None
            vals = ct.cast(data, ct.POINTER(ct.c_long))
            return tuple(int(vals[i]) for i in range(4))
        finally:
            self.xlib.XFree(data)

    def keep_on_desktop(self, inner_window_id):
        if not self.display:
            return
        ct = self.ct
        window = self._wrapper(inner_window_id)
        if not window:
            return
        # Borderless: _MOTIF_WM_HINTS flags=decorations, decorations=0
        hints = (ct.c_long * 5)(2, 0, 0, 0, 0)
        motif = self._atom("_MOTIF_WM_HINTS")
        self.xlib.XChangeProperty(self.display, window, motif, motif, 32, 0, hints, 5)

        class XClientMessageEvent(ct.Structure):
            _fields_ = [("type", ct.c_int), ("serial", ct.c_ulong), ("send_event", ct.c_int),
                        ("display", ct.c_void_p), ("window", ct.c_ulong),
                        ("message_type", ct.c_ulong), ("format", ct.c_int),
                        ("data", ct.c_long * 5)]

        class XEvent(ct.Union):
            _fields_ = [("xclient", XClientMessageEvent), ("pad", ct.c_long * 24)]

        root = self.xlib.XDefaultRootWindow(self.display)
        net_wm_state = self._atom("_NET_WM_STATE")
        mask = (1 << 20) | (1 << 19)  # SubstructureRedirect | SubstructureNotify
        for state in self.STATES:
            ev = XEvent()
            ev.xclient.type = 33  # ClientMessage
            ev.xclient.window = window
            ev.xclient.message_type = net_wm_state
            ev.xclient.format = 32
            ev.xclient.data[0] = 1  # _NET_WM_STATE_ADD
            ev.xclient.data[1] = self._atom(state)
            ev.xclient.data[3] = 1  # source indication: normal application
            self.xlib.XSendEvent(self.display, root, 0, mask, ct.byref(ev))
        self.xlib.XFlush(self.display)


class PyQuotes(tk.Tk):
    def __init__(self):
        super().__init__()
        self.cfg = load_config()
        self.cfg_mtime = os.path.getmtime(CONFIG_PATH) if os.path.exists(CONFIG_PATH) else 0
        self._drag_start = None
        self.deck = QuoteDeck(DECK_PATH)
        self.current_quote = self.deck.next(self.cfg.get("quote_max_chars", 300))
        self.height = 0
        self._rotate_job = None
        self.x11 = X11Desktop()

        self.title("pyQuotes")
        self.withdraw()  # build hidden, then show once styled to avoid flicker
        self.resizable(False, False)

        self.cv = tk.Canvas(self, bd=0, highlightthickness=1)
        self.cv.pack(fill="both", expand=True)

        self.apply_style()
        self.build_context_menu()

        self.cv.bind("<ButtonPress-1>", self.on_drag_start)
        self.cv.bind("<B1-Motion>", self.on_drag_move)
        self.cv.bind("<ButtonRelease-1>", self.on_drag_release)
        self.cv.bind("<Button-3>", self.show_context_menu)

        self.deiconify()
        self.update_idletasks()
        self.x11.keep_on_desktop(self.winfo_id())
        # Re-assert once the WM has finished managing the window (KWin may
        # also adjust the initial position when it first maps the window)
        self.after(500, self.reassert_window)

        # Start crash-proof periodic timers
        self.tick()
        self.schedule_quote_rotation()
        self.watch_config()

    def reassert_window(self):
        self.x11.keep_on_desktop(self.winfo_id())
        if self.height:
            self.position_window(self.height)

    # ---------- crash-proof timer helper ----------
    def safe_after(self, ms, func):
        """Safely schedule a timer callback without crashing if the window is destroyed."""
        try:
            if self.winfo_exists():
                self.after(ms, func)
        except Exception:
            pass

    # ---------- styling / layout ----------
    def apply_style(self):
        try:
            cfg = self.cfg
            installed = set(tkfont.families(self))
            family = cfg.get("font_family")
            if family not in installed:
                family = next((f for f in FONT_CANDIDATES if f in installed), "monospace")
            try:
                px = int(cfg.get("font_size", 15))
            except (ValueError, TypeError):
                px = 15
            # Negative sizes are pixels, independent of Tk scaling
            self.f_title = tkfont.Font(family=family, size=-px, weight="bold")
            self.f_small = tkfont.Font(family=family, size=-(px - 2))
            self.f_quote = tkfont.Font(family=family, size=-(px + 1), slant="italic")
            self.f_mark = tkfont.Font(family=family, size=-int(px * 3.4), weight="bold")
            self.icon = "" if "Nerd" in family else ""  # book

            bg = cfg.get("bg_color", "#191926")
            self.configure(bg=bg)
            self.cv.configure(bg=bg, highlightbackground=mix_color(bg, "#ffffff", 0.09))
            try:
                self.attributes("-alpha", float(cfg.get("bg_opacity", 0.96)))
            except (tk.TclError, ValueError, TypeError):
                pass  # compositor / WM doesn't support per-window alpha

            self.render()
        except Exception as e:
            sys.stderr.write(f"[pyQuotes Style Error]: {e}\n")

    def position_window(self, h):
        try:
            cfg = self.cfg
            w = int(cfg.get("width", 410))
            wx, wy, ww, wh = self.x11.workarea() or (0, 0, self.winfo_screenwidth(),
                                                    self.winfo_screenheight())
            corner = cfg.get("corner", "top-right")
            ox = int(cfg.get("offset_x", 450))
            oy = int(cfg.get("offset_y", 24))
            x = wx + ox if corner.endswith("left") else wx + ww - w - ox
            y = wy + oy if corner.startswith("top") else wy + wh - h - oy
            self.geometry(f"{w}x{h}+{x}+{y}")
        except Exception as e:
            sys.stderr.write(f"[pyQuotes Position Error]: {e}\n")

    def rrect(self, x1, y1, x2, y2, r, **kw):
        r = max(0, min(r, (x2 - x1) / 2, (y2 - y1) / 2))
        pts = [x1 + r, y1, x2 - r, y1, x2, y1, x2, y1 + r, x2, y2 - r, x2, y2,
               x2 - r, y2, x1 + r, y2, x1, y2, x1, y2 - r, x1, y1 + r, x1, y1]
        return self.cv.create_polygon(pts, smooth=True, splinesteps=10, **kw)

    def gradient_line(self, x1, x2, y, colors, segments=48):
        seg_w = (x2 - x1) / segments
        for i in range(segments):
            t = i / (segments - 1) * (len(colors) - 1)
            k = min(int(t), len(colors) - 2)
            c = mix_color(colors[k], colors[k + 1], t - k)
            self.cv.create_line(x1 + i * seg_w, y, x1 + (i + 1) * seg_w + 1, y, fill=c, width=2)

    def render(self):
        try:
            cfg = self.cfg
            cv = self.cv
            fg = cfg.get("font_color", "#e8e8f2")
            accent = cfg.get("accent_color", "#c4b5fd")
            secondary = cfg.get("secondary_color", "#f9a8d4")
            clock = cfg.get("clock_color", "#7dd3fc")
            card = cfg.get("card_color", "#20202f")
            bg = cfg.get("bg_color", "#191926")
            dim = mix_color(bg, fg, 0.42)
            W = int(cfg.get("width", 410))
            pad = int(cfg.get("margin_size", 18)) if cfg.get("show_margins", True) else 8

            name = cfg.get("username_override") or getpass.getuser()
            now = time.localtime()
            try:
                date_str = time.strftime(cfg.get("date_format", "%A, %d %B %Y"), now)
                time_str = time.strftime(cfg.get("time_format", "%H:%M:%S"), now)
            except Exception:
                date_str, time_str = time.strftime("%d-%m-%y", now), time.strftime("%H:%M:%S", now)

            cv.delete("all")
            y = pad

            # ── Header: greeting + clock, date ────────────────────────────
            tx = pad
            if self.icon:
                cv.create_text(tx, y, text=self.icon, font=self.f_title, fill=accent, anchor="nw")
                tx += 24
            cv.create_text(tx, y, text=f"{greeting()}, {name}", font=self.f_title,
                           fill=secondary, anchor="nw")
            cv.create_text(W - pad, y, text=time_str, font=self.f_title, fill=clock, anchor="ne")
            y += self.f_title.metrics("linespace") + 2
            cv.create_text(tx, y, text=date_str, font=self.f_small, fill=dim, anchor="nw")
            y += self.f_small.metrics("linespace") + 10
            self.gradient_line(pad, W - pad, y, [clock, accent, secondary])
            y += 14

            # ── Quote card ───────────────────────────────────────────────
            text, author, book = self.current_quote
            top = y
            inset = 14
            mark = cv.create_text(pad + inset - 2, y + 2, text="“", font=self.f_mark,
                                  fill=mix_color(card, accent, 0.55), anchor="nw")
            qx = pad + inset + 30
            qy = y + inset
            quote = cv.create_text(qx, qy, text=text, font=self.f_quote, fill=fg, anchor="nw",
                                   width=W - pad - inset - qx, justify="left")
            y = max(cv.bbox(quote)[3], cv.bbox(mark)[3] - 30) + 12
            cv.create_text(W - pad - inset, y, text=f"— {author}", font=self.f_title,
                           fill=secondary, anchor="ne")
            y += self.f_title.metrics("linespace")
            if book:
                cv.create_text(W - pad - inset, y, text=book, font=self.f_small,
                               fill=dim, anchor="ne")
                y += self.f_small.metrics("linespace")
            y += inset
            card_item = self.rrect(pad, top, W - pad, y, 12, fill=card,
                                   outline=mix_color(card, "#ffffff", 0.06))
            notch = self.rrect(pad, top + 14, pad + 3, top + 14 + self.f_title.metrics("linespace"),
                               1.5, fill=accent, outline="")
            cv.tag_lower(notch)
            cv.tag_lower(card_item)

            height = int(y + pad)
            if height != self.height:
                self.height = height
                self.position_window(height)
        except Exception as e:
            sys.stderr.write(f"[pyQuotes Render Error]: {e}\n")

    # ---------- CRASH-PROOF PERIODIC TIMERS ----------
    def tick(self):
        """Update the clock every second in a crash-proof loop."""
        try:
            if self.winfo_exists():
                self.render()
        except Exception as e:
            sys.stderr.write(f"[pyQuotes Timer Error in tick]: {e}\n")
        finally:
            self.safe_after(1000, self.tick)

    def new_quote(self):
        try:
            max_c = self.cfg.get("quote_max_chars", 300) if isinstance(self.cfg, dict) else 300
            self.current_quote = self.deck.next(max_c, self.current_quote)
            self.render()
        except Exception as e:
            sys.stderr.write(f"[pyQuotes Error in new_quote]: {e}\n")

    def rotation_interval_ms(self):
        try:
            mins = float(self.cfg.get("quote_refresh_minutes", 1)) if isinstance(self.cfg, dict) else 1.0
            return max(5000, int(mins * 60_000))
        except Exception:
            return 60_000

    def manual_new_quote(self):
        self.new_quote()
        self.schedule_quote_rotation()  # next automatic change a full interval later

    def schedule_quote_rotation(self):
        """(Re)start the quote rotation timer; any pending rotation is
        cancelled so an interval change in the config applies immediately."""
        try:
            if self._rotate_job:
                self.after_cancel(self._rotate_job)
            self._rotate_job = self.after(self.rotation_interval_ms(), self.rotate_quote)
        except Exception as e:
            self._rotate_job = None
            sys.stderr.write(f"[pyQuotes Timer Error in schedule_quote_rotation]: {e}\n")

    def rotate_quote(self):
        self._rotate_job = None
        try:
            if self.winfo_exists():
                self.new_quote()
        finally:
            self.schedule_quote_rotation()

    def watch_config(self):
        """Poll the config file for external edits and hot-reload safely."""
        try:
            if self.winfo_exists() and os.path.exists(CONFIG_PATH):
                mtime = os.path.getmtime(CONFIG_PATH)
                if mtime != self.cfg_mtime:
                    self.cfg_mtime = mtime
                    old_interval = self.rotation_interval_ms()
                    self.cfg = load_config()
                    self.height = 0  # force re-position
                    self.apply_style()
                    if self.rotation_interval_ms() != old_interval:
                        self.schedule_quote_rotation()
        except Exception as e:
            sys.stderr.write(f"[pyQuotes Timer Error in watch_config]: {e}\n")
        finally:
            self.safe_after(2000, self.watch_config)

    # ---------- dragging ----------
    def on_drag_start(self, event):
        if self.cfg.get("locked", True):
            self._drag_start = None
            return
        self._drag_start = (event.x_root, event.y_root,
                            self.winfo_x(), self.winfo_y())

    def on_drag_move(self, event):
        if not self._drag_start:
            return
        sx, sy, wx, wy = self._drag_start
        dx, dy = event.x_root - sx, event.y_root - sy
        self.geometry(f"+{wx + dx}+{wy + dy}")

    def on_drag_release(self, event):
        if self._drag_start:
            self.on_drag_end_save()
        self._drag_start = None

    def on_drag_end_save(self):
        """Persist current position back to config as top-left offsets."""
        try:
            cfg = self.cfg
            wx, wy, _, _ = self.x11.workarea() or (0, 0, 0, 0)
            cfg["corner"] = "top-left"
            cfg["offset_x"] = self.winfo_x() - wx
            cfg["offset_y"] = self.winfo_y() - wy
            save_config(cfg)
        except Exception as e:
            sys.stderr.write(f"[pyQuotes Save Position Error]: {e}\n")

    # ---------- context menu ----------
    def build_context_menu(self):
        card = self.cfg.get("card_color", "#20202f")
        fg = self.cfg.get("font_color", "#e8e8f2")
        accent = self.cfg.get("accent_color", "#c4b5fd")
        m = tk.Menu(self, tearoff=0, bg=card, fg=fg, bd=0, relief="flat",
                    activebackground=mix_color(card, accent, 0.35), activeforeground=fg,
                    font=self.f_small)
        m.add_command(label="New quote", command=self.manual_new_quote)
        m.add_separator()
        m.add_command(label="Toggle lock (drag to move)", command=self.toggle_lock)
        m.add_command(label="Toggle margins", command=self.toggle_margins)
        m.add_separator()
        m.add_command(label="Edit config file…", command=self.open_config_editor)
        m.add_command(label="Reload config", command=self.reload_config_manual)
        m.add_separator()
        m.add_command(label="Quit", command=self.destroy)
        self.menu = m

    def show_context_menu(self, event):
        self.menu.tk_popup(event.x_root, event.y_root)

    def toggle_lock(self):
        self.cfg["locked"] = not self.cfg.get("locked", True)
        if self.cfg["locked"]:
            self.on_drag_end_save()
        save_config(self.cfg)

    def toggle_margins(self):
        self.cfg["show_margins"] = not self.cfg.get("show_margins", True)
        save_config(self.cfg)
        self.apply_style()

    def reload_config_manual(self):
        self.cfg = load_config()
        if os.path.exists(CONFIG_PATH):
            self.cfg_mtime = os.path.getmtime(CONFIG_PATH)
        self.height = 0
        self.apply_style()
        self.schedule_quote_rotation()

    def open_config_editor(self):
        editor = os.environ.get("EDITOR")
        try:
            if editor:
                subprocess.Popen([editor, CONFIG_PATH])
            else:
                subprocess.Popen(["xdg-open", CONFIG_PATH])
        except Exception:
            messagebox.showinfo("pyQuotes", f"Config file is at:\n{CONFIG_PATH}")


def main():
    ensure_config()
    app = PyQuotes()
    app.mainloop()


if __name__ == "__main__":
    main()
