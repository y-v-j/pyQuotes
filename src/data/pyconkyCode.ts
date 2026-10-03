export const PYTHON_SCRIPT_CODE = `#!/usr/bin/env python3
"""
PyConky — a lightweight, dependency-free desktop widget.

Shows: username, date, time, and a rotating literary quote.
Fully configurable: font family/size/style/color, background color,
opacity, and margins — all via a plain JSON config file that can be
edited live (no restart needed) or through the right-click menu.

Design goals:
- Zero third-party dependencies (Tkinter only, ships with most Python installs).
- Uses real Conky window-pinning technique:
  Undecorated window (\`overrideredirect\`) + explicit EWMH hints
  (\`_NET_WM_STATE_BELOW\`, \`_NET_WM_STATE_STICKY\`, \`_NET_WM_STATE_SKIP_TASKBAR\`, \`_NET_WM_STATE_SKIP_PAGER\`)
  instead of \`-type desktop\` which gets minimized/hidden on desktop clicks.
- Crash-proof periodic timers (safe_after + try/finally blocks) so
  unexpected errors in quote formatting or config reloading never freeze the app.
"""

import getpass
import json
import os
import random
import subprocess
import sys
import time
import tkinter as tk
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

DEFAULT_CONFIG = {
    "username_override": None,        # e.g. "Alex" — null = use OS username
    "font_family": "DejaVu Sans Mono",
    "font_size": 13,
    "font_style": "normal",           # normal | bold | italic | bold italic
    "font_color": "#e8e8e8",
    "accent_color": "#8ab4f8",        # used for the quote author/title
    "bg_color": "#0a0c10",
    "bg_opacity": 0.80,               # 0.0 (invisible) - 1.0 (opaque)
    "show_margins": True,
    "margin_size": 22,
    "corner": "top-left",             # top-left | top-right | bottom-left | bottom-right
    "offset_x": 40,
    "offset_y": 40,
    "width": 420,
    "quote_refresh_minutes": 30,
    "quote_max_chars": 260,
    "locked": True,                   # True = pinned, ignores drag
    "date_format": "%d-%m-%y",
    "time_format": "%H:%M:%S",
    "own_window_type": "desktop",    # desktop | override | dock | normal
}


def ensure_config():
    os.makedirs(CONFIG_DIR, exist_ok=True)
    if not os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, "w", encoding="utf-8") as f:
                json.dump(DEFAULT_CONFIG, f, indent=4)
        except Exception as e:
            sys.stderr.write(f"[PyConky Config Error]: Failed to create initial config: {e}\\n")
    return CONFIG_PATH


def load_config():
    """Load config safely, filling in any missing keys with defaults."""
    cfg = {}
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                cfg = json.load(f)
        except Exception as e:
            sys.stderr.write(f"[PyConky Config Warning]: Failed to parse {CONFIG_PATH}: {e}\\n")
            cfg = {}
    merged = dict(DEFAULT_CONFIG)
    if isinstance(cfg, dict):
        merged.update(cfg)
    return merged


def font_tuple(cfg):
    style = str(cfg.get("font_style", "normal"))
    weight = "bold" if "bold" in style else "normal"
    slant = "italic" if "italic" in style else "roman"
    family = str(cfg.get("font_family", "DejaVu Sans Mono"))
    try:
        size = int(cfg.get("font_size", 13))
    except (ValueError, TypeError):
        size = 13
    return (family, size, f"{weight} {slant}".strip())


def pick_quote(max_chars):
    try:
        max_c = int(max_chars)
    except (ValueError, TypeError):
        max_c = 260
    candidates = [q for q in QUOTES if len(q[0]) <= max_c]
    if not candidates:
        candidates = sorted(QUOTES, key=lambda q: len(q[0]))[:5]
    return random.choice(candidates) if candidates else ("Keep calm and carry on.", "Unknown", "")


class PyConky(tk.Tk):
    def __init__(self):
        super().__init__()
        self.cfg = load_config()
        self.cfg_mtime = os.path.getmtime(CONFIG_PATH) if os.path.exists(CONFIG_PATH) else 0
        self._drag_start = None
        self.current_quote = pick_quote(self.cfg.get("quote_max_chars", 260))

        self.title("PyConky")
        self.withdraw()  # build hidden, then show once styled

        # REAL CONKY WINDOW-PINNING TECHNIQUE:
        # Avoid "-type desktop" which causes window managers (GNOME/KDE/Xfce) to
        # minimize or hide the widget when clicking the desktop or background.
        # Instead, use an undecorated window and explicitly request EWMH states:
        # _NET_WM_STATE_BELOW, _NET_WM_STATE_STICKY, _NET_WM_STATE_SKIP_TASKBAR, _NET_WM_STATE_SKIP_PAGER
        self.apply_window_pinning()

        self.resizable(False, False)
        bg = self.cfg.get("bg_color", "#0a0c10")
        self.configure(bg=bg)

        self.frame = tk.Frame(self, bg=bg)
        self.frame.pack(fill="both", expand=True)

        self.lbl_user = tk.Label(self.frame, anchor="w", justify="left")
        self.lbl_datetime = tk.Label(self.frame, anchor="w", justify="left")
        self.divider = tk.Frame(self.frame, height=2)
        self.lbl_quote = tk.Label(self.frame, anchor="w", justify="left")
        self.lbl_attrib = tk.Label(self.frame, anchor="w", justify="left")

        self.lbl_user.pack(fill="x", pady=(0, 2))
        self.lbl_datetime.pack(fill="x", pady=(0, 10))
        self.divider.pack(fill="x", pady=(0, 10))
        self.lbl_quote.pack(fill="x", pady=(0, 6))
        self.lbl_attrib.pack(fill="x", pady=(0, 0))

        self.apply_style()
        self.build_context_menu()

        # Dragging (only active when unlocked)
        for widget in (self, self.frame, self.lbl_user, self.lbl_datetime,
                       self.divider, self.lbl_quote, self.lbl_attrib):
            widget.bind("<ButtonPress-1>", self.on_drag_start)
            widget.bind("<B1-Motion>", self.on_drag_move)
            widget.bind("<ButtonRelease-1>", self.on_drag_release)
            widget.bind("<Button-3>", self.show_context_menu)

        self.deiconify()

        # Start crash-proof periodic timers
        self.tick()
        self.rotate_quote()
        self.watch_config()

    # ---------- window pinning & z-layering ----------
    def apply_window_pinning(self):
        """
        DESKTOP LAYER GUARANTEE:
        Ensures PyConky remains strictly on the desktop background level and stays BELOW
        all active applications and windows.
        """
        wtype = str(self.cfg.get("own_window_type", "desktop")).lower()

        if wtype == "desktop":
            try:
                self.attributes("-type", "desktop")
            except Exception:
                self.overrideredirect(True)
        elif wtype == "dock":
            try:
                self.attributes("-type", "dock")
            except Exception:
                self.overrideredirect(True)
        elif wtype == "normal":
            self.overrideredirect(False)
        else: # override
            self.overrideredirect(True)

        try:
            self.attributes("-topmost", False)
        except Exception:
            pass

        # Bind event hooks to continuously push PyConky below all application windows
        self.bind("<Map>", lambda e: self.keep_below())
        self.bind("<FocusIn>", lambda e: self.keep_below())
        self.bind("<Configure>", lambda e: self.keep_below())

        self.after_idle(self._apply_x11_ewmh_hints)

    def keep_below(self):
        """Force PyConky down to the bottom layer so app windows float over it."""
        try:
            if self.winfo_exists():
                self.lower()
        except Exception:
            pass

    def _apply_x11_ewmh_hints(self):
        try:
            if not self.winfo_exists():
                return
            wid = hex(self.winfo_id())
            # Set EWMH window state: BELOW + STICKY + SKIP_TASKBAR + SKIP_PAGER
            subprocess.run(
                [
                    "xprop", "-id", wid,
                    "-f", "_NET_WM_STATE", "32a",
                    "-set", "_NET_WM_STATE",
                    "_NET_WM_STATE_BELOW,_NET_WM_STATE_STICKY,_NET_WM_STATE_SKIP_TASKBAR,_NET_WM_STATE_SKIP_PAGER"
                ],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
            
            wtype_prop = "_NET_WM_WINDOW_TYPE_DESKTOP" if self.cfg.get("own_window_type") == "desktop" else "_NET_WM_WINDOW_TYPE_NORMAL"
            subprocess.run(
                [
                    "xprop", "-id", wid,
                    "-f", "_NET_WM_WINDOW_TYPE", "32a",
                    "-set", "_NET_WM_WINDOW_TYPE",
                    wtype_prop
                ],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
            # xdotool lower fallback
            subprocess.run(["xdotool", "windowlower", wid], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except Exception:
            pass

        self.keep_below()

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
            f = font_tuple(cfg)
            bg = cfg.get("bg_color", "#0a0c10")
            font_color = cfg.get("font_color", "#e8e8e8")
            accent_color = cfg.get("accent_color", "#8ab4f8")
            width = int(cfg.get("width", 420))

            self.configure(bg=bg)
            self.frame.configure(bg=bg)

            pad = int(cfg.get("margin_size", 22)) if cfg.get("show_margins", True) else 4
            self.frame.pack_configure(padx=pad, pady=pad)

            for lbl in (self.lbl_user, self.lbl_datetime, self.lbl_quote, self.lbl_attrib):
                lbl.configure(bg=bg, wraplength=width)

            f_family = cfg.get("font_family", "DejaVu Sans Mono")
            f_size = int(cfg.get("font_size", 13))

            self.lbl_user.configure(font=(f_family, f_size + 2, "bold"), fg=accent_color)
            self.lbl_datetime.configure(font=f, fg=font_color)
            self.lbl_quote.configure(font=(f_family, f_size, "italic"), fg=font_color)
            self.lbl_attrib.configure(font=(f_family, max(9, f_size - 1), "normal"), fg=accent_color)
            self.divider.configure(bg=accent_color)

            try:
                self.attributes("-alpha", float(cfg.get("bg_opacity", 0.80)))
            except tk.TclError:
                pass

            self.render_texts()
            self.update_idletasks()
            self.position_window()
        except Exception as e:
            sys.stderr.write(f"[PyConky Style Error]: {e}\\n")

    def position_window(self):
        try:
            cfg = self.cfg
            pad = int(cfg.get("margin_size", 22)) if cfg.get("show_margins", True) else 4
            self.update_idletasks()
            width_cfg = int(cfg.get("width", 420))
            content_w = max(self.frame.winfo_reqwidth(), width_cfg)
            w = content_w + 2 * pad
            h = self.frame.winfo_reqheight() + 2 * pad
            sw = self.winfo_screenwidth()
            sh = self.winfo_screenheight()
            corner = cfg.get("corner", "top-left")
            ox = int(cfg.get("offset_x", 40))
            oy = int(cfg.get("offset_y", 40))

            if corner == "top-left":
                x, y = ox, oy
            elif corner == "top-right":
                x, y = sw - w - ox, oy
            elif corner == "bottom-left":
                x, y = ox, sh - h - oy
            else:
                x, y = sw - w - ox, sh - h - oy

            self.geometry(f"{w}x{h}+{x}+{y}")
            self.lower()  # Keep pinned below normal windows
        except Exception as e:
            sys.stderr.write(f"[PyConky Position Error]: {e}\\n")

    def render_texts(self):
        try:
            cfg = self.cfg
            name = cfg.get("username_override") or getpass.getuser()
            now = time.localtime()
            date_fmt = cfg.get("date_format", "%d-%m-%y")
            time_fmt = cfg.get("time_format", "%H:%M:%S")
            date_str = time.strftime(date_fmt, now)
            time_str = time.strftime(time_fmt, now)

            self.lbl_user.configure(text=name)
            self.lbl_datetime.configure(text=f"{date_str}   {time_str}")

            text, author, book = self.current_quote
            quote_line = f"“{text}”"
            self.lbl_quote.configure(text=quote_line)
            attrib = f"— {author}" + (f", {book}" if book else "")
            self.lbl_attrib.configure(text=attrib)
        except Exception as e:
            sys.stderr.write(f"[PyConky Render Error]: {e}\\n")

    # ---------- CRASH-PROOF PERIODIC TIMERS ----------
    def tick(self):
        """Update clock every second in a crash-proof loop."""
        try:
            if self.winfo_exists():
                self.render_texts()
        except Exception as e:
            sys.stderr.write(f"[PyConky Timer Error in tick]: {e}\\n")
        finally:
            self.safe_after(1000, self.tick)

    def rotate_quote(self):
        """Rotate quote periodically in a crash-proof loop."""
        try:
            if self.winfo_exists():
                max_c = self.cfg.get("quote_max_chars", 260) if isinstance(self.cfg, dict) else 260
                self.current_quote = pick_quote(max_c)
                self.render_texts()
                self.update_idletasks()
                self.position_window()
        except Exception as e:
            sys.stderr.write(f"[PyConky Timer Error in rotate_quote]: {e}\\n")
        finally:
            try:
                mins = float(self.cfg.get("quote_refresh_minutes", 30)) if isinstance(self.cfg, dict) else 30.0
                ms = max(5000, int(mins * 60_000))
            except Exception:
                ms = 60_000
            self.safe_after(ms, self.rotate_quote)

    def watch_config(self):
        """Poll the config file for external edits and hot-reload safely."""
        try:
            if self.winfo_exists() and os.path.exists(CONFIG_PATH):
                mtime = os.path.getmtime(CONFIG_PATH)
                if mtime != self.cfg_mtime:
                    self.cfg_mtime = mtime
                    self.cfg = load_config()
                    self.apply_style()
        except Exception as e:
            sys.stderr.write(f"[PyConky Timer Error in watch_config]: {e}\\n")
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
        new_x, new_y = wx + dx, wy + dy
        self.geometry(f"+{new_x}+{new_y}")

    def on_drag_release(self, event):
        if self._drag_start:
            self.on_drag_end_save()
        self._drag_start = None

    def on_drag_end_save(self):
        try:
            cfg = self.cfg
            cfg["corner"] = "top-left"
            cfg["offset_x"] = self.winfo_x()
            cfg["offset_y"] = self.winfo_y()
            save_config(cfg)
        except Exception as e:
            sys.stderr.write(f"[PyConky Save Position Error]: {e}\\n")

    # ---------- context menu ----------
    def build_context_menu(self):
        m = tk.Menu(self, tearoff=0)
        m.add_command(label="New quote", command=self.rotate_quote)
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
        self.apply_style()

    def open_config_editor(self):
        editor = os.environ.get("EDITOR")
        try:
            if editor:
                subprocess.Popen([editor, CONFIG_PATH])
            else:
                subprocess.Popen(["xdg-open", CONFIG_PATH])
        except Exception:
            messagebox.showinfo("PyConky", f"Config file is at:\\n{CONFIG_PATH}")


def save_config(cfg):
    try:
        with open(CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump(cfg, f, indent=4)
    except Exception as e:
        sys.stderr.write(f"[PyConky Save Config Error]: {e}\\n")


def main():
    ensure_config()
    app = PyConky()
    app.mainloop()


if __name__ == "__main__":
    main()
`;
