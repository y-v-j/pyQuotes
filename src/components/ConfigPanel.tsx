import React, { useState, useEffect } from 'react';
import { ConkyConfig } from '../types';
import { Sliders, Code, Check, AlertCircle, RefreshCw, Palette, Lock, Unlock, Zap } from 'lucide-react';

interface ConfigPanelProps {
  config: ConkyConfig;
  onUpdateConfig: (newCfg: ConkyConfig) => void;
  activeTab: 'gui' | 'json';
  setActiveTab: (tab: 'gui' | 'json') => void;
}

export const PRESETS: Array<{ name: string; cfg: Partial<ConkyConfig> }> = [
  {
    name: 'Default Dark',
    cfg: {
      bg_color: '#0a0c10',
      bg_opacity: 0.8,
      font_color: '#e8e8e8',
      accent_color: '#8ab4f8',
      font_family: 'DejaVu Sans Mono',
    },
  },
  {
    name: 'Cyberpunk Neon',
    cfg: {
      bg_color: '#0d0221',
      bg_opacity: 0.85,
      font_color: '#00f6ff',
      accent_color: '#ff007f',
      font_family: 'Ubuntu Mono',
    },
  },
  {
    name: 'Matrix Emerald',
    cfg: {
      bg_color: '#021208',
      bg_opacity: 0.9,
      font_color: '#00ff66',
      accent_color: '#33ff99',
      font_family: 'Fira Code',
    },
  },
  {
    name: 'Solarized Dark',
    cfg: {
      bg_color: '#002b36',
      bg_opacity: 0.85,
      font_color: '#839496',
      accent_color: '#b58900',
      font_family: 'Monospace',
    },
  },
  {
    name: 'Minimal Light',
    cfg: {
      bg_color: '#f8fafc',
      bg_opacity: 0.9,
      font_color: '#1e293b',
      accent_color: '#2563eb',
      font_family: 'DejaVu Sans Mono',
    },
  },
];

export const ConfigPanel: React.FC<ConfigPanelProps> = ({
  config,
  onUpdateConfig,
  activeTab,
  setActiveTab,
}) => {
  const [jsonText, setJsonText] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);

  useEffect(() => {
    setJsonText(JSON.stringify(config, null, 4));
    setJsonError(null);
  }, [config]);

  const handleJsonChange = (text: string) => {
    setJsonText(text);
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed === 'object' && parsed !== null) {
        setJsonError(null);
        onUpdateConfig({ ...config, ...parsed });
      }
    } catch (err) {
      setJsonError((err as Error).message);
    }
  };

  const applyPreset = (preset: Partial<ConkyConfig>) => {
    onUpdateConfig({ ...config, ...preset });
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col h-full shadow-xl">
      {/* Header Tabs */}
      <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800">
        <div className="flex items-center gap-2 font-semibold text-slate-200">
          <Sliders className="w-4 h-4 text-blue-400" />
          <span>Widget Config (config.json)</span>
        </div>

        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
          <button
            onClick={() => setActiveTab('gui')}
            className={`px-3 py-1 rounded-md font-medium transition flex items-center gap-1.5 ${
              activeTab === 'gui'
                ? 'bg-blue-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Palette className="w-3.5 h-3.5" />
            <span>Visual Controls</span>
          </button>
          <button
            onClick={() => setActiveTab('json')}
            className={`px-3 py-1 rounded-md font-medium transition flex items-center gap-1.5 ${
              activeTab === 'json'
                ? 'bg-blue-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Code className="w-3.5 h-3.5" />
            <span>Raw JSON</span>
          </button>
        </div>
      </div>

      {/* Preset Buttons */}
      <div className="mb-4">
        <div className="text-xs font-medium text-slate-400 mb-2 flex items-center gap-1">
          <Zap className="w-3 h-3 text-amber-400" />
          <span>Quick Themes:</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.name}
              onClick={() => applyPreset(p.cfg)}
              className="px-2.5 py-1 text-xs rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>

      {/* GUI Tab Controls */}
      {activeTab === 'gui' ? (
        <div className="space-y-4 text-xs overflow-y-auto pr-1 flex-1">
          {/* User Override */}
          <div>
            <label className="block font-medium text-slate-300 mb-1">Username Override</label>
            <input
              type="text"
              value={config.username_override || ''}
              onChange={(e) =>
                onUpdateConfig({
                  ...config,
                  username_override: e.target.value.trim() === '' ? null : e.target.value,
                })
              }
              placeholder="System Username (null)"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500 font-mono"
            />
          </div>

          {/* Colors Grid */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block font-medium text-slate-300 mb-1">Font Color</label>
              <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 p-1.5 rounded-lg">
                <input
                  type="color"
                  value={config.font_color}
                  onChange={(e) => onUpdateConfig({ ...config, font_color: e.target.value })}
                  className="w-6 h-6 rounded cursor-pointer bg-transparent border-0"
                />
                <span className="font-mono text-[11px] text-slate-300">{config.font_color}</span>
              </div>
            </div>

            <div>
              <label className="block font-medium text-slate-300 mb-1">Accent Color</label>
              <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 p-1.5 rounded-lg">
                <input
                  type="color"
                  value={config.accent_color}
                  onChange={(e) => onUpdateConfig({ ...config, accent_color: e.target.value })}
                  className="w-6 h-6 rounded cursor-pointer bg-transparent border-0"
                />
                <span className="font-mono text-[11px] text-slate-300">{config.accent_color}</span>
              </div>
            </div>

            <div>
              <label className="block font-medium text-slate-300 mb-1">BG Color</label>
              <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 p-1.5 rounded-lg">
                <input
                  type="color"
                  value={config.bg_color}
                  onChange={(e) => onUpdateConfig({ ...config, bg_color: e.target.value })}
                  className="w-6 h-6 rounded cursor-pointer bg-transparent border-0"
                />
                <span className="font-mono text-[11px] text-slate-300">{config.bg_color}</span>
              </div>
            </div>
          </div>

          {/* Opacity Slider */}
          <div>
            <div className="flex justify-between font-medium text-slate-300 mb-1">
              <span>Background Opacity (bg_opacity)</span>
              <span className="font-mono text-blue-400">{Math.round(config.bg_opacity * 100)}%</span>
            </div>
            <input
              type="range"
              min="0.1"
              max="1.0"
              step="0.05"
              value={config.bg_opacity}
              onChange={(e) => onUpdateConfig({ ...config, bg_opacity: parseFloat(e.target.value) })}
              className="w-full accent-blue-500 cursor-pointer"
            />
          </div>

          {/* Font Size & Family */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-slate-300 mb-1">Font Family</label>
              <select
                value={config.font_family}
                onChange={(e) => onUpdateConfig({ ...config, font_family: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 font-mono focus:outline-none"
              >
                <option value="DejaVu Sans Mono">DejaVu Sans Mono</option>
                <option value="Ubuntu Mono">Ubuntu Mono</option>
                <option value="Fira Code">Fira Code</option>
                <option value="Monospace">Monospace</option>
                <option value="sans-serif">Sans-Serif</option>
              </select>
            </div>

            <div>
              <div className="flex justify-between font-medium text-slate-300 mb-1">
                <span>Font Size</span>
                <span className="font-mono text-blue-400">{config.font_size}px</span>
              </div>
              <input
                type="range"
                min="10"
                max="20"
                value={config.font_size}
                onChange={(e) => onUpdateConfig({ ...config, font_size: parseInt(e.target.value, 10) })}
                className="w-full accent-blue-500 cursor-pointer"
              />
            </div>
          </div>

          {/* Width & Refresh Interval */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex justify-between font-medium text-slate-300 mb-1">
                <span>Widget Width</span>
                <span className="font-mono text-blue-400">{config.width}px</span>
              </div>
              <input
                type="range"
                min="300"
                max="600"
                step="10"
                value={config.width}
                onChange={(e) => onUpdateConfig({ ...config, width: parseInt(e.target.value, 10) })}
                className="w-full accent-blue-500 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between font-medium text-slate-300 mb-1">
                <span>Quote Interval</span>
                <span className="font-mono text-blue-400">{config.quote_refresh_minutes}m</span>
              </div>
              <input
                type="range"
                min="1"
                max="60"
                value={config.quote_refresh_minutes}
                onChange={(e) => onUpdateConfig({ ...config, quote_refresh_minutes: parseInt(e.target.value, 10) })}
                className="w-full accent-blue-500 cursor-pointer"
              />
            </div>
          </div>

          {/* Window Pinning & Type */}
          <div className="pt-2 border-t border-slate-800">
            <label className="block font-medium text-slate-300 mb-1">
              Window Pinning Mode (own_window_type)
            </label>
            <select
              value={config.own_window_type || 'desktop'}
              onChange={(e) =>
                onUpdateConfig({
                  ...config,
                  own_window_type: e.target.value as 'desktop' | 'override' | 'dock' | 'normal',
                })
              }
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 font-mono focus:outline-none"
            >
              <option value="desktop">desktop — Root background layer (Pinned under all apps)</option>
              <option value="override">override — Undecorated + _NET_WM_STATE_BELOW</option>
              <option value="dock">dock — Workspace panel dock layer</option>
              <option value="normal">normal — Standard undecorated window</option>
            </select>
            <p className="text-[10px] text-slate-400 mt-1">
              Guarantees PyConky stays pinned to desktop background beneath all open applications.
            </p>
          </div>

          {/* Toggles */}
          <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-slate-300">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.show_margins}
                onChange={(e) => onUpdateConfig({ ...config, show_margins: e.target.checked })}
                className="rounded border-slate-700 bg-slate-950 text-blue-600 focus:ring-0"
              />
              <span>Show Outer Margins</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.locked}
                onChange={(e) => onUpdateConfig({ ...config, locked: e.target.checked })}
                className="rounded border-slate-700 bg-slate-950 text-blue-600 focus:ring-0"
              />
              <span>Lock Position</span>
            </label>
          </div>
        </div>
      ) : (
        /* JSON Tab */
        <div className="flex-1 flex flex-col">
          <textarea
            value={jsonText}
            onChange={(e) => handleJsonChange(e.target.value)}
            className="w-full flex-1 bg-slate-950 border border-slate-800 rounded-lg p-3 font-mono text-xs text-blue-300 focus:outline-none focus:border-blue-500 resize-none leading-relaxed"
            spellCheck={false}
          />
          {jsonError ? (
            <div className="mt-2 p-2 bg-rose-950/80 border border-rose-800 text-rose-300 text-xs rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span className="font-mono text-[11px] truncate">{jsonError}</span>
            </div>
          ) : (
            <div className="mt-2 p-2 bg-emerald-950/60 border border-emerald-800/60 text-emerald-300 text-xs rounded-lg flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>Valid JSON — Live hot-reload active</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
