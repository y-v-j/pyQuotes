#!/usr/bin/env bash
# ==============================================================================
# pyQuotes - installer
#
# Installs entirely in user space (no root, no rpm-ostree layering):
#   ~/.local/share/pyquotes/       app, launcher and (optionally) a venv
#   ~/.local/share/fonts/FantasqueSansMNerdFont/
#   ~/.config/autostart/pyquotes.desktop    (default startup method)
#   ~/.config/systemd/user/pyquotes.service (--startup systemd)
#
# Usage: ./install.sh [--startup autostart|systemd|none] [--python PATH]
#                     [--no-start] [--uninstall] [--help]
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="${HOME}/.local/share/pyquotes"
FONT_DIR="${HOME}/.local/share/fonts/FantasqueSansMNerdFont"
AUTOSTART_FILE="${HOME}/.config/autostart/pyquotes.desktop"
SERVICE_FILE="${HOME}/.config/systemd/user/pyquotes.service"
CONDA_ENV_NAME="${PYQUOTES_CONDA_ENV:-conky-env}"
# Nerd Font build of Fantasque Sans Mono: same typeface plus the section icons
FONT_URL="https://github.com/ryanoasis/nerd-fonts/releases/latest/download/FantasqueSansMono.tar.xz"

STARTUP="autostart"
PYTHON=""
START_NOW=1
UNINSTALL=0

BOLD="\033[1m"; CYAN="\033[36m"; GREEN="\033[32m"; YELLOW="\033[33m"; RED="\033[31m"; RESET="\033[0m"
step() { echo -e "${BOLD}${CYAN}==>${RESET} ${BOLD}$*${RESET}"; }
ok()   { echo -e "    ${GREEN}✓${RESET} $*"; }
warn() { echo -e "    ${YELLOW}!${RESET} $*"; }
die()  { echo -e "${RED}✗ $*${RESET}" >&2; exit 1; }

usage() {
  cat <<EOF
pyQuotes installer

Options:
  --startup MODE   How to launch at login: autostart (default), systemd, none
  --python PATH    Use this Python interpreter instead of auto-detecting one
                   (it must have tkinter; Tk with Xft is needed for smooth fonts)
  --no-start       Do not launch the widget after installing
  --uninstall      Remove pyQuotes (keeps the font and any conda env)
  -h, --help       Show this help

Environment:
  PYQUOTES_CONDA_ENV  Name of the conda env to create/use (default: conky-env)
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --startup)   STARTUP="${2:-}"; shift 2 ;;
    --python)    PYTHON="${2:-}"; shift 2 ;;
    --no-start)  START_NOW=0; shift ;;
    --uninstall) UNINSTALL=1; shift ;;
    -h|--help)   usage; exit 0 ;;
    *) usage; die "Unknown option: $1" ;;
  esac
done
case "$STARTUP" in autostart|systemd|none) ;; *) die "--startup must be autostart, systemd or none" ;; esac

has_systemd_user() { command -v systemctl >/dev/null && systemctl --user show-environment >/dev/null 2>&1; }

stop_running() {
  if has_systemd_user && systemctl --user is-active --quiet pyquotes.service 2>/dev/null; then
    systemctl --user stop pyquotes.service || true
  fi
  pkill -f "${APP_DIR}/pyconky.py" 2>/dev/null || true
}

disable_systemd() {
  if [[ -f "$SERVICE_FILE" ]]; then
    has_systemd_user && systemctl --user disable --now pyquotes.service >/dev/null 2>&1 || true
    rm -f "$SERVICE_FILE"
    has_systemd_user && systemctl --user daemon-reload || true
  fi
}

# ------------------------------------------------------------------------------
# Uninstall
# ------------------------------------------------------------------------------
if [[ $UNINSTALL -eq 1 ]]; then
  step "Uninstalling pyQuotes"
  stop_running
  disable_systemd
  rm -f "$AUTOSTART_FILE"
  rm -rf "$APP_DIR"
  ok "Removed app, launcher and startup entries"
  echo "    The font (${FONT_DIR}) and conda env '${CONDA_ENV_NAME}' were kept. To remove them:"
  echo "      rm -rf \"${FONT_DIR}\" && fc-cache -f"
  echo "      conda env remove -n ${CONDA_ENV_NAME}"
  exit 0
fi

for f in pyconky.py quotes_data.py pyquotes.desktop pyquotes.service; do
  [[ -f "${SCRIPT_DIR}/${f}" ]] || die "Missing ${f} next to install.sh (run it from the project folder)"
done

echo -e "${BOLD}${CYAN}"
echo "  ┌──────────────────────────────────────────────┐"
echo "  │      Installing pyQuotes Desktop Widget      │"
echo "  └──────────────────────────────────────────────┘"
echo -e "${RESET}"

# ------------------------------------------------------------------------------
# 1. Font
# ------------------------------------------------------------------------------
step "[1/4] Fantasque Sans Mono Nerd Font"
# (no grep -q: an early exit would SIGPIPE fc-list and fail under pipefail)
if fc-list : family 2>/dev/null | grep -i "FantasqueSansM Nerd Font" >/dev/null; then
  ok "Already installed"
else
  command -v curl >/dev/null || die "curl is required to download the font"
  TMP_DIR="$(mktemp -d)"
  trap 'rm -rf "$TMP_DIR"' EXIT
  curl -fsSL -o "${TMP_DIR}/fantasque.tar.xz" "$FONT_URL"
  tar -xJf "${TMP_DIR}/fantasque.tar.xz" -C "$TMP_DIR"
  mkdir -p "$FONT_DIR"
  cp "${TMP_DIR}"/FantasqueSansMNerdFont-*.ttf "${TMP_DIR}/OFL.txt" "$FONT_DIR/"
  fc-cache -f "$FONT_DIR" >/dev/null
  ok "Installed to ${FONT_DIR}"
fi

# ------------------------------------------------------------------------------
# 2. Python interpreter with tkinter (+ Xft for antialiased fonts) and psutil
# ------------------------------------------------------------------------------
has_tkinter() { "$1" -c "import tkinter" >/dev/null 2>&1; }

# A Tk built without Xft can only draw blocky X11 bitmap fonts
has_xft_tk() {
  local tkmod
  tkmod="$("$1" -c 'import _tkinter; print(_tkinter.__file__)' 2>/dev/null)" || return 1
  ldd "$tkmod" 2>/dev/null | grep -qi "libXft"
}

find_conda() {
  local c
  for c in "$(command -v conda 2>/dev/null || true)" "$(command -v mamba 2>/dev/null || true)" \
           "$HOME/miniforge3/bin/conda" "$HOME/miniconda3/bin/conda" "$HOME/anaconda3/bin/conda"; do
    [[ -n "$c" && -x "$c" ]] && { echo "$c"; return 0; }
  done
  return 1
}

step "[2/4] Python environment"
if [[ -n "$PYTHON" ]]; then
  [[ -x "$PYTHON" ]] || PYTHON="$(command -v "$PYTHON" || true)"
  [[ -n "$PYTHON" ]] || die "--python interpreter not found"
  has_tkinter "$PYTHON" || die "${PYTHON} has no tkinter module"
  "$PYTHON" -c "import psutil" 2>/dev/null || "$PYTHON" -m pip install --user psutil >/dev/null 2>&1 \
    || warn "psutil not available: top processes will be hidden"
  ok "Using ${PYTHON}"
elif CONDA="$(find_conda)"; then
  # Last line only: some conda plugins print warnings to stdout
  CONDA_BASE="$("$CONDA" info --base 2>/dev/null | tail -n 1)"
  [[ -d "$CONDA_BASE" ]] || die "Could not determine the conda base directory"
  CONDA_PREFIX_DIR="${CONDA_BASE}/envs/${CONDA_ENV_NAME}"
  if [[ -x "${CONDA_PREFIX_DIR}/bin/python" ]] && has_xft_tk "${CONDA_PREFIX_DIR}/bin/python" \
       && "${CONDA_PREFIX_DIR}/bin/python" -c "import psutil" 2>/dev/null; then
    ok "Reusing conda env '${CONDA_ENV_NAME}'"
  elif [[ -x "${CONDA_PREFIX_DIR}/bin/python" ]]; then
    echo "    Updating conda env '${CONDA_ENV_NAME}' (Xft-enabled Tk + psutil)..."
    "$CONDA" install -y -q -n "$CONDA_ENV_NAME" -c conda-forge --override-channels "tk=*=xft_*" psutil >/dev/null
    ok "Updated conda env '${CONDA_ENV_NAME}'"
  else
    echo "    Creating conda env '${CONDA_ENV_NAME}' (Python 3.12, Xft-enabled Tk, psutil)..."
    "$CONDA" create -y -q -n "$CONDA_ENV_NAME" -c conda-forge --override-channels \
      "python=3.12" "tk=8.6.*=xft_*" psutil >/dev/null
    ok "Created conda env '${CONDA_ENV_NAME}'"
  fi
  PYTHON="${CONDA_PREFIX_DIR}/bin/python"
else
  BASE_PY=""
  for c in python3 /usr/bin/python3; do
    p="$(command -v "$c" 2>/dev/null || true)"
    [[ -n "$p" ]] && has_tkinter "$p" && { BASE_PY="$p"; break; }
  done
  [[ -n "$BASE_PY" ]] || die "No Python with tkinter found. Install Miniforge (https://conda-forge.org/download/)
  and re-run this script, or pass --python /path/to/python3 with tkinter available."
  mkdir -p "$APP_DIR"
  "$BASE_PY" -m venv "${APP_DIR}/venv"
  "${APP_DIR}/venv/bin/pip" install -q psutil || warn "psutil install failed: top processes will be hidden"
  PYTHON="${APP_DIR}/venv/bin/python"
  ok "Created venv from ${BASE_PY}"
fi

if has_xft_tk "$PYTHON"; then
  ok "Tk has Xft support (smooth, antialiased fonts)"
else
  warn "This Tk lacks Xft support: text will render with blocky bitmap fonts."
  warn "Install Miniforge/conda and re-run for smooth fonts."
fi

# ------------------------------------------------------------------------------
# 3. App files and launcher
# ------------------------------------------------------------------------------
step "[3/4] Installing app to ${APP_DIR}"
mkdir -p "$APP_DIR"
install -m 755 "${SCRIPT_DIR}/pyconky.py" "${APP_DIR}/pyconky.py"
install -m 644 "${SCRIPT_DIR}/quotes_data.py" "${APP_DIR}/quotes_data.py"

# Single launcher used by every startup method; the lock prevents duplicate
# widgets (e.g. autostart + a manual launch).
cat > "${APP_DIR}/launch.sh" <<EOF
#!/bin/sh
# Generated by pyQuotes install.sh
PY="${PYTHON}"
APP="${APP_DIR}/pyconky.py"
if command -v flock >/dev/null 2>&1; then
  exec flock -n "\${XDG_RUNTIME_DIR:-/tmp}/pyquotes.lock" "\$PY" "\$APP" "\$@"
fi
exec "\$PY" "\$APP" "\$@"
EOF
chmod 755 "${APP_DIR}/launch.sh"
ok "Launcher: ${APP_DIR}/launch.sh"

# ------------------------------------------------------------------------------
# 4. Startup at login
# ------------------------------------------------------------------------------
step "[4/4] Startup at login (${STARTUP})"
stop_running
case "$STARTUP" in
  autostart)
    disable_systemd
    mkdir -p "$(dirname "$AUTOSTART_FILE")"
    install -m 644 "${SCRIPT_DIR}/pyquotes.desktop" "$AUTOSTART_FILE"
    ok "Autostart entry: ${AUTOSTART_FILE}"
    ;;
  systemd)
    has_systemd_user || die "systemd user session not available; use --startup autostart"
    rm -f "$AUTOSTART_FILE"
    mkdir -p "$(dirname "$SERVICE_FILE")"
    install -m 644 "${SCRIPT_DIR}/pyquotes.service" "$SERVICE_FILE"
    systemctl --user daemon-reload
    systemctl --user enable pyquotes.service >/dev/null 2>&1
    ok "Enabled systemd user service: pyquotes.service"
    ;;
  none)
    disable_systemd
    rm -f "$AUTOSTART_FILE"
    ok "No startup entry installed"
    ;;
esac

# ------------------------------------------------------------------------------
# Launch
# ------------------------------------------------------------------------------
if [[ $START_NOW -eq 1 && -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]]; then
  if [[ "$STARTUP" == "systemd" ]]; then
    systemctl --user start pyquotes.service
  else
    setsid nohup "${APP_DIR}/launch.sh" >/dev/null 2>&1 < /dev/null &
  fi
  ok "pyQuotes is running"
fi

echo
echo -e "${GREEN}${BOLD}Installation complete!${RESET}"
echo "  Run:        ${APP_DIR}/launch.sh"
echo "  Stop:       pkill -f ${APP_DIR}/pyconky.py"
echo "  Uninstall:  ./install.sh --uninstall"
