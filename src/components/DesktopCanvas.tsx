import React, { useState, useEffect, useRef } from 'react';
import { ConkyConfig, QuoteItem } from '../types';
import { QUOTES_DATA } from '../data/quotes';
import {
  Pin,
  Lock,
  Unlock,
  RefreshCw,
  Sliders,
  AlertTriangle,
  ShieldCheck,
  Terminal,
  Maximize2,
  Minus,
  X,
  Layers,
  Sparkles,
  MousePointer,
  Radio
} from 'lucide-react';

interface DesktopCanvasProps {
  config: ConkyConfig;
  onUpdateConfig: (newCfg: ConkyConfig) => void;
  onOpenConfigEditor: () => void;
}

export const DesktopCanvas: React.FC<DesktopCanvasProps> = ({
  config,
  onUpdateConfig,
  onOpenConfigEditor,
}) => {
  const [currentQuote, setCurrentQuote] = useState<QuoteItem>(QUOTES_DATA[0]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [useBuggyMode, setUseBuggyMode] = useState(false);
  const [isMinimizedDueToBug, setIsMinimizedDueToBug] = useState(false);
  const [desktopClickCount, setDesktopClickCount] = useState(0);
  const [lastDesktopClickTime, setLastDesktopClickTime] = useState<string | null>(null);
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [openApps, setOpenApps] = useState<{
    terminal: boolean;
    editor: boolean;
    browser: boolean;
  }>({
    terminal: true,
    editor: true,
    browser: false,
  });

  const toggleApp = (app: 'terminal' | 'editor' | 'browser') => {
    setOpenApps((prev) => ({ ...prev, [app]: !prev[app] }));
  };

  // Drag state
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({
    x: config.offset_x,
    y: config.offset_y,
  });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ startX: number; startY: number; initX: number; initY: number }>({
    startX: 0,
    startY: 0,
    initX: config.offset_x,
    initY: config.offset_y,
  });

  // Timer logs for crash-proof verification
  const [timerLogs, setTimerLogs] = useState<Array<{ id: number; text: string; type: 'tick' | 'quote' | 'config' | 'error' }>>([
    { id: 1, text: 'Safe timer initialized: safe_after(1000, tick)', type: 'tick' },
    { id: 2, text: 'Safe timer initialized: safe_after(ms, rotate_quote)', type: 'quote' },
    { id: 3, text: 'Safe timer initialized: safe_after(2000, watch_config)', type: 'config' }
  ]);

  // Keep dragOffset in sync when config offset changes externally
  useEffect(() => {
    setDragOffset({ x: config.offset_x, y: config.offset_y });
  }, [config.offset_x, config.offset_y]);

  // Clock tick (crash proof loop)
  useEffect(() => {
    const timer = setInterval(() => {
      try {
        setCurrentTime(new Date());
      } catch (err) {
        console.error('Timer exception caught:', err);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Pick random quote
  const rotateQuote = () => {
    try {
      const candidates = QUOTES_DATA.filter((q) => q[0].length <= config.quote_max_chars);
      const chosen = candidates.length > 0
        ? candidates[Math.floor(Math.random() * candidates.length)]
        : QUOTES_DATA[Math.floor(Math.random() * QUOTES_DATA.length)];
      setCurrentQuote(chosen);
      addTimerLog(`Quote rotated to: "${chosen[0].slice(0, 30)}..."`, 'quote');
    } catch (err) {
      addTimerLog(`Exception in rotate_quote: ${String(err)} -> Recovered via safe_after!`, 'error');
    }
  };

  const addTimerLog = (text: string, type: 'tick' | 'quote' | 'config' | 'error') => {
    setTimerLogs((prev) => [
      { id: Date.now(), text, type },
      ...prev.slice(0, 19)
    ]);
  };

  const triggerFaultInjection = () => {
    addTimerLog('FAULT INJECTED: Division by zero simulated in tick()', 'error');
    setTimeout(() => {
      addTimerLog('CRASH-PROOF RECOVERY: try/finally executed safe_after(1000, tick)', 'tick');
    }, 600);
  };

  // Handle Desktop Click
  const handleDesktopClick = () => {
    setContextMenuPos(null);
    setDesktopClickCount((prev) => prev + 1);
    setLastDesktopClickTime(new Date().toLocaleTimeString());

    if (useBuggyMode) {
      setIsMinimizedDueToBug(true);
      addTimerLog('BUG TRIGGERED: Window minimized because -type desktop lost WM focus!', 'error');
    } else {
      addTimerLog('DESKTOP CLICKED: PyConky remained pinned & visible (below/sticky/skip-taskbar)', 'config');
    }
  };

  // Dragging logic
  const handleMouseDown = (e: React.MouseEvent) => {
    if (config.locked) return;
    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initX: dragOffset.x,
      initY: dragOffset.y,
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartRef.current.startX;
    const dy = e.clientY - dragStartRef.current.startY;
    const newX = Math.max(10, dragStartRef.current.initX + dx);
    const newY = Math.max(10, dragStartRef.current.initY + dy);
    setDragOffset({ x: newX, y: newY });
  };

  const handleMouseUp = () => {
    if (!isDragging) return;
    setIsDragging(false);
    onUpdateConfig({
      ...config,
      corner: 'top-left',
      offset_x: Math.round(dragOffset.x),
      offset_y: Math.round(dragOffset.y),
    });
  };

  // Formatting date/time
  const formatDate = () => {
    const day = String(currentTime.getDate()).padStart(2, '0');
    const month = String(currentTime.getMonth() + 1).padStart(2, '0');
    const year = String(currentTime.getFullYear()).slice(-2);
    return `${day}-${month}-${year}`;
  };

  const formatTime = () => {
    const h = String(currentTime.getHours()).padStart(2, '0');
    const m = String(currentTime.getMinutes()).padStart(2, '0');
    const s = String(currentTime.getSeconds()).padStart(2, '0');
    return `${h}:${m}:${s}`;
  };

  const displayUser = config.username_override || 'alex';

  return (
    <div className="relative w-full h-[620px] rounded-xl overflow-hidden border border-slate-800 shadow-2xl flex flex-col select-none bg-slate-950">
      {/* Top Bar of Desktop Simulator */}
      <div className="bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-4 py-2 flex items-center justify-between z-30 text-xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 font-semibold text-slate-200">
            <Radio className="w-3.5 h-3.5 text-blue-400 animate-pulse" />
            <span>X11 / EWMH Desktop Simulator</span>
          </div>
          <span className="text-slate-600">|</span>
          <span className="text-slate-400">Workspace 1</span>
        </div>

        {/* Pinning mode selector & Actions */}
        <div className="flex items-center gap-2">
          {/* App Window Launchers for Z-Stacking Test */}
          <div className="flex items-center gap-1 bg-slate-950 px-2 py-0.5 rounded-md border border-slate-800 text-[11px]">
            <span className="text-slate-400 font-mono text-[10px] mr-1">Apps:</span>
            <button
              onClick={() => toggleApp('terminal')}
              className={`px-2 py-0.5 rounded transition font-mono ${
                openApps.terminal ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'text-slate-500 hover:text-slate-300'
              }`}
              title="Toggle Terminal window"
            >
              Terminal
            </button>
            <button
              onClick={() => toggleApp('editor')}
              className={`px-2 py-0.5 rounded transition font-mono ${
                openApps.editor ? 'bg-blue-950 text-blue-300 border border-blue-800' : 'text-slate-500 hover:text-slate-300'
              }`}
              title="Toggle Text Editor window"
            >
              VS Code
            </button>
            <button
              onClick={() => toggleApp('browser')}
              className={`px-2 py-0.5 rounded transition font-mono ${
                openApps.browser ? 'bg-purple-950 text-purple-300 border border-purple-800' : 'text-slate-500 hover:text-slate-300'
              }`}
              title="Toggle Firefox Browser window"
            >
              Firefox
            </button>
          </div>

          <button
            onClick={() => {
              setUseBuggyMode(!useBuggyMode);
              setIsMinimizedDueToBug(false);
            }}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition flex items-center gap-1.5 ${
              useBuggyMode
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
            }`}
            title="Toggle between buggy -type desktop mode and real Conky pinning"
          >
            {useBuggyMode ? (
              <>
                <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                <span>Mode: Buggy (-type desktop)</span>
              </>
            ) : (
              <>
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Mode: Real Conky Pinning</span>
              </>
            )}
          </button>

          <button
            onClick={rotateQuote}
            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md transition flex items-center gap-1 border border-slate-700"
          >
            <RefreshCw className="w-3 h-3 text-blue-400" />
            <span>Next Quote</span>
          </button>

          <button
            onClick={() => onUpdateConfig({ ...config, locked: !config.locked })}
            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md transition flex items-center gap-1 border border-slate-700"
          >
            {config.locked ? (
              <>
                <Lock className="w-3 h-3 text-amber-400" />
                <span>Locked</span>
              </>
            ) : (
              <>
                <Unlock className="w-3 h-3 text-emerald-400" />
                <span>Unlocked (Drag)</span>
              </>
            )}
          </button>

          <button
            onClick={triggerFaultInjection}
            className="px-2.5 py-1 bg-purple-950/80 hover:bg-purple-900 text-purple-200 border border-purple-700/60 rounded-md transition flex items-center gap-1"
            title="Test crash-proof periodic timers by throwing a simulated exception"
          >
            <Sparkles className="w-3 h-3 text-purple-400" />
            <span>Test Timer Recovery</span>
          </button>
        </div>
      </div>

      {/* Main Wallpaper Workspace Canvas */}
      <div
        className="relative flex-1 w-full bg-cover bg-center overflow-hidden cursor-crosshair"
        style={{
          backgroundImage: `radial-gradient(circle at 20% 20%, rgba(30, 41, 59, 0.8), rgba(15, 23, 42, 0.95)), repeating-linear-gradient(45deg, rgba(255,255,255,0.02) 0px, rgba(255,255,255,0.02) 1px, transparent 1px, transparent 10px)`
        }}
        onClick={handleDesktopClick}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onContextMenu={(e) => {
          e.preventDefault();
          setContextMenuPos({ x: e.clientX, y: e.clientY });
        }}
      >
        {/* Desktop Pinning Test Info Overlay */}
        <div className="absolute bottom-4 left-4 z-20 bg-slate-900/85 backdrop-blur-md p-3 rounded-lg border border-slate-800 max-w-sm text-xs text-slate-300 pointer-events-auto">
          <div className="flex items-center justify-between font-semibold mb-1 text-slate-100">
            <span className="flex items-center gap-1.5">
              <MousePointer className="w-3.5 h-3.5 text-blue-400" />
              Desktop Click Tester
            </span>
            <span className="text-slate-500 font-normal">Clicks: {desktopClickCount}</span>
          </div>
          <p className="text-slate-400 leading-relaxed mb-2">
            Click anywhere on the wallpaper to test window behavior. Real Conky uses{' '}
            <code className="bg-slate-800 text-blue-300 px-1 py-0.5 rounded">undecorated</code> +{' '}
            <code className="bg-slate-800 text-blue-300 px-1 py-0.5 rounded">below,sticky,skip-taskbar,skip-pager</code>.
          </p>
          {lastDesktopClickTime && (
            <div className={`p-1.5 rounded text-[11px] font-mono flex items-center justify-between ${
              useBuggyMode ? 'bg-rose-950/70 text-rose-300 border border-rose-800/50' : 'bg-emerald-950/70 text-emerald-300 border border-emerald-800/50'
            }`}>
              <span>Last click @ {lastDesktopClickTime}</span>
              <span>{useBuggyMode ? '❌ MINIMIZED!' : '✅ PINNED (NO MINIMIZE)'}</span>
            </div>
          )}
        </div>

        {/* PYCONKY WIDGET (z-index: 0 — Desktop Background Layer) */}
        {!isMinimizedDueToBug ? (
          <div
            className={`absolute z-0 transition-all cursor-move select-none ${
              !config.locked ? 'ring-2 ring-blue-500/50 hover:ring-blue-400' : ''
            }`}
            style={{
              left: `${dragOffset.x}px`,
              top: `${dragOffset.y}px`,
              width: `${config.width}px`,
              backgroundColor: config.bg_color,
              opacity: config.bg_opacity,
              fontFamily: config.font_family,
              padding: config.show_margins ? `${config.margin_size}px` : '4px',
              borderRadius: '8px',
              boxShadow: '0 10px 30px -5px rgba(0, 0, 0, 0.5)',
            }}
            onMouseDown={handleMouseDown}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Widget Unlock Indicator Ribbon */}
            {!config.locked && (
              <div className="absolute -top-3 left-3 bg-blue-600 text-white text-[10px] px-2 py-0.5 rounded-full font-mono flex items-center gap-1 shadow-md">
                <Unlock className="w-2.5 h-2.5" />
                <span>Unlocked - Drag to reposition</span>
              </div>
            )}

            {/* Desktop Layer Indicator Badge */}
            <div className="absolute -bottom-3 right-3 bg-slate-900 border border-slate-700 text-slate-400 text-[9px] px-2 py-0.5 rounded-md font-mono flex items-center gap-1 shadow">
              <Layers className="w-2.5 h-2.5 text-blue-400" />
              <span>Layer: Desktop Root (z:0, _NET_WM_STATE_BELOW)</span>
            </div>

            {/* User Header */}
            <div
              className="font-bold text-left mb-1"
              style={{
                color: config.accent_color,
                fontSize: `${config.font_size + 2}px`,
              }}
            >
              {displayUser}
            </div>

            {/* Date & Time */}
            <div
              className="text-left mb-3"
              style={{
                color: config.font_color,
                fontSize: `${config.font_size}px`,
                fontStyle: config.font_style.includes('italic') ? 'italic' : 'normal',
                fontWeight: config.font_style.includes('bold') ? 'bold' : 'normal',
              }}
            >
              {formatDate()}   {formatTime()}
            </div>

            {/* Divider Line */}
            <div
              className="w-full h-[2px] mb-3"
              style={{ backgroundColor: config.accent_color }}
            />

            {/* Rotating Quote */}
            <div
              className="text-left italic mb-2 leading-relaxed"
              style={{
                color: config.font_color,
                fontSize: `${config.font_size}px`,
              }}
            >
              “{currentQuote[0]}”
            </div>

            {/* Quote Attribution */}
            <div
              className="text-left font-normal"
              style={{
                color: config.accent_color,
                fontSize: `${Math.max(9, config.font_size - 1)}px`,
              }}
            >
              — {currentQuote[1]}
              {currentQuote[2] ? `, ${currentQuote[2]}` : ''}
            </div>
          </div>
        ) : (
          <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center z-30">
            <div className="w-16 h-16 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center mb-4 border border-rose-500/40">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-rose-200 mb-2">PyConky Minimized! (Buggy Mode)</h3>
            <p className="text-sm text-slate-300 max-w-md mb-6 leading-relaxed">
              When using <code className="bg-slate-800 text-rose-300 px-1.5 py-0.5 rounded">-type desktop</code>, standard Linux window managers (GNOME/KDE) treat desktop clicks as a request to focus desktop background or hide floating windows.
            </p>
            <button
              onClick={() => {
                setUseBuggyMode(false);
                setIsMinimizedDueToBug(false);
              }}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium text-sm transition shadow-lg flex items-center gap-2"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Switch to Real Conky Pinning Mode</span>
            </button>
          </div>
        )}

        {/* SIMULATED ACTIVE APPLICATION WINDOWS (z-index: 30 — Overlaps PyConky) */}
        {openApps.terminal && (
          <div
            className="absolute z-30 w-96 top-16 right-16 rounded-lg bg-slate-900 border border-slate-700 shadow-2xl overflow-hidden pointer-events-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-slate-800 px-3 py-1.5 flex items-center justify-between text-xs text-slate-300 border-b border-slate-700">
              <div className="flex items-center gap-2 font-mono">
                <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                <span>bash — python3 pyconky.py</span>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => toggleApp('terminal')} className="p-0.5 hover:bg-slate-700 rounded text-slate-400">
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>
            <div className="p-3 font-mono text-[11px] text-emerald-400 bg-slate-950/90 leading-relaxed">
              <p className="text-slate-500">$ python3 pyconky.py</p>
              <p className="text-slate-300">[PyConky] Initializing window-pinning engine...</p>
              <p className="text-blue-400">[EWMH] Applied state: _NET_WM_STATE_BELOW, STICKY, SKIP_TASKBAR, SKIP_PAGER</p>
              <p className="text-emerald-400">[Window Stack] PyConky stay locked below terminal & app windows</p>
              <p className="text-slate-400 animate-pulse mt-1">&gt; PyConky running on desktop layer under this window.</p>
            </div>
          </div>
        )}

        {openApps.editor && (
          <div
            className="absolute z-30 w-[420px] top-40 left-12 rounded-lg bg-slate-900 border border-slate-700 shadow-2xl overflow-hidden pointer-events-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-slate-800 px-3 py-1.5 flex items-center justify-between text-xs text-slate-300 border-b border-slate-700">
              <div className="flex items-center gap-2 font-mono">
                <Sliders className="w-3.5 h-3.5 text-blue-400" />
                <span>VS Code — ~/.config/pyconky/config.json</span>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => toggleApp('editor')} className="p-0.5 hover:bg-slate-700 rounded text-slate-400">
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>
            <div className="p-3 font-mono text-[11px] text-blue-300 bg-slate-950/90 leading-relaxed">
              <p className="text-slate-500">// Notice: App window overlaps ON TOP of PyConky</p>
              <p className="text-slate-300">&#123;</p>
              <p className="pl-4 text-amber-300">"own_window_type": <span className="text-emerald-300">"{config.own_window_type || 'desktop'}"</span>,</p>
              <p className="pl-4 text-slate-400">"locked": true,</p>
              <p className="pl-4 text-slate-400">"bg_color": "{config.bg_color}"</p>
              <p className="text-slate-300">&#125;</p>
            </div>
          </div>
        )}

        {openApps.browser && (
          <div
            className="absolute z-30 w-[450px] top-28 right-32 rounded-lg bg-slate-900 border border-slate-700 shadow-2xl overflow-hidden pointer-events-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-slate-800 px-3 py-1.5 flex items-center justify-between text-xs text-slate-300 border-b border-slate-700">
              <div className="flex items-center gap-2 font-mono">
                <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                <span>Firefox — Desktop Layer Pinning Guide</span>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => toggleApp('browser')} className="p-0.5 hover:bg-slate-700 rounded text-slate-400">
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>
            <div className="p-3 font-sans text-xs text-slate-300 bg-slate-950/90 leading-relaxed">
              <h4 className="font-semibold text-slate-100 mb-1">Desktop Window Stacking Guarantee</h4>
              <p className="text-slate-400 text-[11px]">
                Active application windows (terminals, browsers, text editors) sit on top of PyConky. PyConky stays pinned to the desktop canvas background via <code className="text-blue-300">_NET_WM_STATE_BELOW</code> and <code className="text-blue-300">self.lower()</code>.
              </p>
            </div>
          </div>
        )}

        {/* Right-Click Context Menu Simulation */}
        {contextMenuPos && (
          <div
            className="absolute z-50 w-52 bg-slate-900 border border-slate-700 shadow-2xl rounded-lg py-1.5 text-xs text-slate-200 font-sans"
            style={{ left: `${contextMenuPos.x - 20}px`, top: `${contextMenuPos.y - 80}px` }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => {
                rotateQuote();
                setContextMenuPos(null);
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-blue-600 hover:text-white flex items-center gap-2"
            >
              <RefreshCw className="w-3.5 h-3.5 text-blue-400" />
              <span>New quote</span>
            </button>
            <div className="my-1 border-t border-slate-800" />
            <button
              onClick={() => {
                onUpdateConfig({ ...config, locked: !config.locked });
                setContextMenuPos(null);
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-blue-600 hover:text-white flex items-center gap-2"
            >
              {config.locked ? <Lock className="w-3.5 h-3.5 text-amber-400" /> : <Unlock className="w-3.5 h-3.5 text-emerald-400" />}
              <span>Toggle lock (drag to move)</span>
            </button>
            <button
              onClick={() => {
                onUpdateConfig({ ...config, show_margins: !config.show_margins });
                setContextMenuPos(null);
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-blue-600 hover:text-white flex items-center gap-2"
            >
              <Sliders className="w-3.5 h-3.5 text-indigo-400" />
              <span>Toggle margins</span>
            </button>
            <div className="my-1 border-t border-slate-800" />
            <button
              onClick={() => {
                onOpenConfigEditor();
                setContextMenuPos(null);
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-blue-600 hover:text-white flex items-center gap-2"
            >
              <Sliders className="w-3.5 h-3.5 text-slate-400" />
              <span>Edit config file…</span>
            </button>
          </div>
        )}
      </div>

      {/* Crash-Proof Timer Event Log Feed */}
      <div className="bg-slate-900/95 border-t border-slate-800 px-4 py-2 flex items-center justify-between text-[11px] font-mono">
        <div className="flex items-center gap-2 text-slate-400 overflow-hidden">
          <span className="text-emerald-400 font-semibold flex items-center gap-1 shrink-0">
            <ShieldCheck className="w-3.5 h-3.5" />
            Crash-Proof Timers:
          </span>
          <span className="truncate text-slate-300">
            {timerLogs[0]?.text || 'Periodic safe_after loop active.'}
          </span>
        </div>
        <div className="text-slate-500 shrink-0 ml-4">
          safe_after + try/finally
        </div>
      </div>
    </div>
  );
};
