import React from 'react';
import { ShieldCheck, AlertTriangle, Zap, Terminal, CheckCircle2, Clock } from 'lucide-react';

export const TechnicalExplanation: React.FC = () => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Window Pinning Breakdown */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100">1. Real Conky Window Pinning</h3>
              <p className="text-xs text-slate-400">Fixed desktop-click minimization issue</p>
            </div>
          </div>

          <div className="space-y-3 text-xs text-slate-300 leading-relaxed mb-4">
            <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-900/50 text-rose-200">
              <div className="font-semibold text-rose-300 flex items-center gap-1.5 mb-1">
                <AlertTriangle className="w-4 h-4 text-rose-400" />
                <span>The Buggy Approach (-type desktop)</span>
              </div>
              <p className="text-[11px] text-rose-200/80">
                In Linux X11/EWMH window managers (GNOME Mutter, KDE KWin, Xfce), setting <code className="bg-rose-900/40 px-1 py-0.5 rounded text-rose-100">-type desktop</code> causes the window manager to treat the widget as part of the desktop background shell. When a user clicks the desktop or presses "Show Desktop", the WM focuses the background shell, hiding or minimizing the widget.
              </p>
            </div>

            <div className="p-3 rounded-lg bg-emerald-950/40 border border-emerald-900/50 text-emerald-200">
              <div className="font-semibold text-emerald-300 flex items-center gap-1.5 mb-1">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>The Real Conky Pinning Solution</span>
              </div>
              <p className="text-[11px] text-emerald-200/80 mb-2">
                Conky bypasses window manager focus hooks by using an <code className="bg-emerald-900/40 px-1 py-0.5 rounded text-emerald-100">undecorated</code> window combined with explicit EWMH window states:
              </p>
              <ul className="list-disc list-inside space-y-1 font-mono text-[10px] text-emerald-300">
                <td>own_window_type = "desktop" — Direct attachment to desktop root canvas</td>
                <td>_NET_WM_STATE_BELOW — Pin window state strictly behind normal app windows</td>
                <td>self.keep_below() / self.lower() — Continuous lower on tick(), FocusIn, Map</td>
                <td>_NET_WM_STATE_STICKY & SKIP_TASKBAR — Stay on all workspaces without panel icons</td>
              </ul>
            </div>
          </div>
        </div>

        <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 font-mono text-[11px] text-blue-300">
          <p className="text-slate-500 mb-1"># Desktop Stacking Guarantee:</p>
          <p className="text-purple-400">self.bind("&lt;Map&gt;", lambda e: self.lower())</p>
          <p className="text-blue-300">
            subprocess.run(["xprop", "-id", wid, "-f", "_NET_WM_STATE", "32a", "-set", "_NET_WM_STATE", "_NET_WM_STATE_BELOW,_NET_WM_STATE_STICKY,_NET_WM_STATE_SKIP_TASKBAR,_NET_WM_STATE_SKIP_PAGER"])
          </p>
        </div>
      </div>

      {/* Crash-Proof Periodic Timers */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100">2. Crash-Proof Periodic Timers</h3>
              <p className="text-xs text-slate-400">Guaranteed loop continuation via safe_after + try/finally</p>
            </div>
          </div>

          <div className="space-y-3 text-xs text-slate-300 leading-relaxed mb-4">
            <p>
              Standard Tkinter <code className="bg-slate-800 px-1 py-0.5 rounded text-blue-300">self.after(ms, func)</code> loops break permanently if an exception is thrown inside the callback (e.g. malformed JSON during config edit, missing dictionary keys, or invalid time formatting string).
            </p>

            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 font-mono text-[11px] space-y-1 text-slate-300">
              <div className="text-purple-400">def safe_after(self, ms, func):</div>
              <div className="pl-3 text-slate-400">try:</div>
              <div className="pl-6 text-slate-200">if self.winfo_exists(): self.after(ms, func)</div>
              <div className="pl-3 text-slate-400">except Exception: pass</div>
            </div>

            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 font-mono text-[11px] space-y-1">
              <div className="text-purple-400">def tick(self):</div>
              <div className="pl-3 text-slate-400">try:</div>
              <div className="pl-6 text-emerald-300">if self.winfo_exists(): self.render_texts()</div>
              <div className="pl-3 text-slate-400">except Exception as e:</div>
              <div className="pl-6 text-rose-300">sys.stderr.write(f"[PyConky Error]: &#123;e&#125;\n")</div>
              <div className="pl-3 text-amber-300">finally:</div>
              <div className="pl-6 text-blue-300 font-bold">self.safe_after(1000, self.tick)</div>
            </div>
          </div>
        </div>

        <div className="text-xs text-slate-400 flex items-center gap-2 bg-slate-950 p-2.5 rounded-lg border border-slate-800">
          <Zap className="w-4 h-4 text-amber-400 shrink-0" />
          <span>The <code className="text-amber-300 font-mono">finally:</code> block guarantees that timer recursion is never broken, keeping clock & quote rotators 100% resilient.</span>
        </div>
      </div>
    </div>
  );
};
