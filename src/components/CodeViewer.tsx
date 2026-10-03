import React, { useState } from 'react';
import { PYTHON_SCRIPT_CODE } from '../data/pyconkyCode';
import { QUOTES_DATA } from '../data/quotes';
import { ConkyConfig } from '../types';
import { Code, Copy, Check, Download, FileText, Sparkles, Terminal } from 'lucide-react';

interface CodeViewerProps {
  config: ConkyConfig;
}

export const CodeViewer: React.FC<CodeViewerProps> = ({ config }) => {
  const [activeFile, setActiveFile] = useState<'pyconky.py' | 'quotes_data.py' | 'config.json'>('pyconky.py');
  const [copied, setCopied] = useState(false);

  const getActiveCode = () => {
    if (activeFile === 'pyconky.py') return PYTHON_SCRIPT_CODE;
    if (activeFile === 'config.json') return JSON.stringify(config, null, 4);
    
    // generate quotes_data.py content
    const quotesStr = QUOTES_DATA.map(
      (q) => `    (${JSON.stringify(q[0])}, ${JSON.stringify(q[1])}, ${JSON.stringify(q[2])})`
    ).join(',\n');
    return `"""\nPyConky Quotes Database\n"""\n\nQUOTES = [\n${quotesStr}\n]\n`;
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(getActiveCode());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const code = getActiveCode();
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = activeFile;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col shadow-2xl">
      {/* File Switcher Header */}
      <div className="bg-slate-950 px-4 py-2.5 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setActiveFile('pyconky.py')}
            className={`px-3 py-1.5 rounded-lg font-mono text-xs font-medium transition flex items-center gap-2 ${
              activeFile === 'pyconky.py'
                ? 'bg-blue-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>pyconky.py</span>
          </button>

          <button
            onClick={() => setActiveFile('quotes_data.py')}
            className={`px-3 py-1.5 rounded-lg font-mono text-xs font-medium transition flex items-center gap-2 ${
              activeFile === 'quotes_data.py'
                ? 'bg-blue-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>quotes_data.py</span>
          </button>

          <button
            onClick={() => setActiveFile('config.json')}
            className={`px-3 py-1.5 rounded-lg font-mono text-xs font-medium transition flex items-center gap-2 ${
              activeFile === 'config.json'
                ? 'bg-blue-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Code className="w-3.5 h-3.5" />
            <span>config.json</span>
          </button>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs transition flex items-center gap-1.5 border border-slate-700"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400 font-medium">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-slate-400" />
                <span>Copy Code</span>
              </>
            )}
          </button>

          <button
            onClick={handleDownload}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium transition flex items-center gap-1.5 shadow"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download {activeFile}</span>
          </button>
        </div>
      </div>

      {/* Code Area */}
      <div className="p-4 bg-slate-950 overflow-x-auto max-h-[500px] text-xs font-mono leading-relaxed text-slate-300">
        <pre>
          <code>{getActiveCode()}</code>
        </pre>
      </div>
    </div>
  );
};
