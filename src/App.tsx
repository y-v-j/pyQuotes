import React, { useState } from 'react';
import { ConkyConfig } from './types';
import { DesktopCanvas } from './components/DesktopCanvas';
import { ConfigPanel } from './components/ConfigPanel';
import { CodeViewer } from './components/CodeViewer';
import { TechnicalExplanation } from './components/TechnicalExplanation';
import {
  Monitor,
  Code,
  Sliders,
  Terminal,
  ShieldCheck,
  Download,
  BookOpen,
  Sparkles,
  Layers
} from 'lucide-react';

const DEFAULT_CONFIG: ConkyConfig = {
  username_override: null,
  font_family: 'DejaVu Sans Mono',
  font_size: 13,
  font_style: 'normal',
  font_color: '#e8e8e8',
  accent_color: '#8ab4f8',
  bg_color: '#0a0c10',
  bg_opacity: 0.8,
  show_margins: true,
  margin_size: 22,
  corner: 'top-left',
  offset_x: 40,
  offset_y: 40,
  width: 420,
  quote_refresh_minutes: 30,
  quote_max_chars: 260,
  locked: true,
  date_format: '%d-%m-%y',
  time_format: '%H:%M:%S',
};

export default function App() {
  const [config, setConfig] = useState<ConkyConfig>(DEFAULT_CONFIG);
  const [activeTab, setActiveTab] = useState<'simulator' | 'code' | 'architecture'>('simulator');
  const [configPanelTab, setConfigPanelTab] = useState<'gui' | 'json'>('gui');

  const downloadAllFiles = () => {
    const files = [
      { name: 'config.json', content: JSON.stringify(config, null, 4) },
      { name: 'pyconky.py', content: import('./data/pyconkyCode').then(m => m.PYTHON_SCRIPT_CODE) }
    ];

    files.forEach(async (f) => {
      const content = typeof f.content === 'string' ? f.content : await f.content;
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = f.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      {/* Top Navbar */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-50 px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-600/30">
            <Terminal className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-slate-100 tracking-tight">PyConky</h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                EWMH Window-Pinned
              </span>
            </div>
            <p className="text-xs text-slate-400">Pure Python Desktop Widget • Zero GUI Framework Dependencies</p>
          </div>
        </div>

        {/* View Selector Tabs */}
        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
          <button
            onClick={() => setActiveTab('simulator')}
            className={`px-3.5 py-1.5 rounded-lg font-medium transition flex items-center gap-2 ${
              activeTab === 'simulator'
                ? 'bg-blue-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Monitor className="w-4 h-4" />
            <span>Interactive Simulator</span>
          </button>

          <button
            onClick={() => setActiveTab('code')}
            className={`px-3.5 py-1.5 rounded-lg font-medium transition flex items-center gap-2 ${
              activeTab === 'code'
                ? 'bg-blue-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Code className="w-4 h-4" />
            <span>Python Source & Config</span>
          </button>

          <button
            onClick={() => setActiveTab('architecture')}
            className={`px-3.5 py-1.5 rounded-lg font-medium transition flex items-center gap-2 ${
              activeTab === 'architecture'
                ? 'bg-blue-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>Pinning & Timer Architecture</span>
          </button>
        </div>

        {/* Action Button */}
        <button
          onClick={downloadAllFiles}
          className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium transition flex items-center gap-1.5"
        >
          <Download className="w-3.5 h-3.5 text-blue-400" />
          <span>Export Python App</span>
        </button>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 flex flex-col gap-6">
        {activeTab === 'simulator' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Desktop Simulator Canvas */}
            <div className="lg:col-span-8 flex flex-col gap-4">
              <DesktopCanvas
                config={config}
                onUpdateConfig={setConfig}
                onOpenConfigEditor={() => {
                  setConfigPanelTab('json');
                }}
              />

              {/* Status Banner */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between text-xs text-slate-300">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-semibold text-slate-200 block">Conky Window-Pinning Verified</span>
                    <span className="text-slate-400 text-[11px]">
                      Undecorated frame + explicitly <code className="bg-slate-950 px-1 text-emerald-300 rounded">_NET_WM_STATE_BELOW, STICKY, SKIP_TASKBAR, SKIP_PAGER</code>
                    </span>
                  </div>
                </div>

                <div className="text-right font-mono text-[11px] text-slate-400">
                  <span>Zero Dependencies</span>
                  <span className="block text-slate-500">Pure Tkinter</span>
                </div>
              </div>
            </div>

            {/* Live Config Panel */}
            <div className="lg:col-span-4 h-[670px]">
              <ConfigPanel
                config={config}
                onUpdateConfig={setConfig}
                activeTab={configPanelTab}
                setActiveTab={setConfigPanelTab}
              />
            </div>
          </div>
        )}

        {activeTab === 'code' && (
          <div className="flex flex-col gap-6">
            <CodeViewer config={config} />
          </div>
        )}

        {activeTab === 'architecture' && (
          <div className="flex flex-col gap-6">
            <TechnicalExplanation />
          </div>
        )}
      </main>
    </div>
  );
}
