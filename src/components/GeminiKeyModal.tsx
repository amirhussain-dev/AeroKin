import { useEffect, useState, type FormEvent } from 'react';
import { KeyRound, X } from 'lucide-react';

interface GeminiKeyModalProps {
  isOpen: boolean;
  currentKey: string;
  currentModel: string;
  serverHasEnvKey: boolean;
  onSave: (key: string, model: string) => void;
  onClose: () => void;
}

const MODEL_OPTIONS = [
  'gemini-3.8-flash',
  'gemini-4-hydrogen',
  'gemini-3.8-pro',
];

export function GeminiKeyModal({
  isOpen,
  currentKey,
  currentModel,
  serverHasEnvKey,
  onSave,
  onClose,
}: GeminiKeyModalProps) {
  const [draft, setDraft] = useState(currentKey);
  const [modelDraft, setModelDraft] = useState(currentModel || 'gemini-3.8-flash');

  useEffect(() => {
    if (isOpen) {
      setDraft(currentKey);
      setModelDraft(currentModel || 'gemini-3.8-flash');
    }
  }, [isOpen, currentKey, currentModel]);

  if (!isOpen) return null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSave(draft.trim(), modelDraft.trim() || 'gemini-3.8-flash');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-5 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-teal-400" />
            <h3 className="text-sm font-semibold text-slate-100">Connect Gemini GenAI</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed">
          {serverHasEnvKey
            ? 'Your server already has GEMINI_API_KEY configured in .env. You can optionally override it for this browser session below.'
            : 'Add your Google AI Studio Gemini API key to generate live, tailored routines and Q&A using the Gemini Interactions API (gemini-3.8-flash). Without a key, AeroKin automatically runs its built-in Scientific Smog & IAQ Engine.'}
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Session Gemini API Key (kept in browser sessionStorage only)
            </label>
            <input
              type="password"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="AIza..."
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-teal-400 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Gemini Model
            </label>
            <select
              value={MODEL_OPTIONS.includes(modelDraft) ? modelDraft : 'custom'}
              onChange={(e) => {
                if (e.target.value !== 'custom') setModelDraft(e.target.value);
              }}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 focus:border-teal-400 focus:outline-none"
            >
              <option value="gemini-3.8-flash">gemini-3.8-flash (Recommended)</option>
              <option value="gemini-4-hydrogen">gemini-4-hydrogen</option>
              <option value="gemini-3.8-pro">gemini-3.8-pro</option>
              {!MODEL_OPTIONS.includes(modelDraft) && (
                <option value="custom">Custom ({modelDraft})</option>
              )}
            </select>
          </div>

          <div className="flex items-center justify-end gap-2">
            {currentKey && (
              <button
                type="button"
                onClick={() => {
                  setDraft('');
                  onSave('', modelDraft.trim() || 'gemini-3.8-flash');
                  onClose();
                }}
                className="rounded-xl border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 cursor-pointer"
              >
                Clear Key
              </button>
            )}
            <button
              type="submit"
              className="rounded-xl bg-teal-500 px-4 py-1.5 text-xs font-semibold text-slate-950 hover:bg-teal-400 cursor-pointer"
            >
              Save & Refresh Plan
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
