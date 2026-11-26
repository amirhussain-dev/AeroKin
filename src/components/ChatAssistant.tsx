import { useState, type FormEvent } from 'react';
import { Bot, Send, Sparkles, User } from 'lucide-react';
import type { ChatMessage } from '../../shared/types.ts';

interface ChatAssistantProps {
  messages: ChatMessage[];
  isSending: boolean;
  onSend: (text: string) => void;
}

const QUICK_PROMPTS = [
  'My kids have outdoor sports at 4 PM — what should we do?',
  'How do I build a DIY air cleaner under $40?',
  'Write a polite message to neighbors about idling cars & leaf burning',
  'How should we ventilate while cooking dinner tonight?',
];

export function ChatAssistant({ messages, isSending, onSend }: ChatAssistantProps) {
  const [input, setInput] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isSending) return;
    setInput('');
    onSend(trimmed);
  };

  return (
    <div className="rounded-2xl border border-slate-800/90 bg-slate-900/75 flex flex-col h-[540px]">
      <div className="border-b border-slate-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-teal-500/20 text-teal-300">
            <Bot className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-100">Ask AeroKin Assistant</h3>
            <p className="text-[11px] text-slate-400">
              Grounded in your live AQI, thermal inversion curve & household setup
            </p>
          </div>
        </div>
      </div>

      {/* Quick Prompts */}
      <div className="border-b border-slate-800/70 px-4 py-2.5 flex flex-wrap gap-1.5 bg-slate-950/40">
        {QUICK_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            disabled={isSending}
            onClick={() => onSend(prompt)}
            className="rounded-full border border-slate-700/80 bg-slate-800/70 px-2.5 py-1 text-[11px] text-slate-300 hover:border-teal-500/60 hover:text-teal-200 transition cursor-pointer disabled:opacity-50"
          >
            {prompt}
          </button>
        ))}
      </div>

      {/* Message Feed */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center px-6 text-slate-400 space-y-2">
            <Sparkles className="h-8 w-8 text-teal-400/70" />
            <p className="text-sm font-medium text-slate-200">
              Ask any question about winter smog, indoor air hacks, or family routines
            </p>
            <p className="text-xs max-w-md">
              AeroKin automatically factors in your city’s inversion window, room size, heating/cooking fuel, and family health sensitivities.
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.role === 'assistant' && (
              <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-teal-500/20 text-teal-300">
                <Bot className="h-4 w-4" />
              </div>
            )}

            <div
              className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed space-y-2 ${
                msg.role === 'user'
                  ? 'bg-teal-500 text-slate-950 font-medium'
                  : 'border border-slate-800 bg-slate-950/80 text-slate-200'
              }`}
            >
              <div className="whitespace-pre-wrap text-xs sm:text-sm">{msg.content}</div>

              {msg.impactCallout && (
                <div className="rounded-xl border border-teal-800/60 bg-teal-950/35 p-2.5 text-xs space-y-1">
                  <div className="font-semibold text-teal-300">Direct Impact Breakdown</div>
                  <div className="text-slate-300">
                    <span className="text-slate-400">Exposure:</span> {msg.impactCallout.exposureDelta}
                  </div>
                  <div className="text-slate-300">
                    <span className="text-slate-400">Emissions:</span> {msg.impactCallout.emissionDelta}
                  </div>
                  <div className="text-teal-200 font-medium">
                    Next step: {msg.impactCallout.keyAction}
                  </div>
                </div>
              )}

              {msg.role === 'assistant' && msg.source && (
                <div className="text-[10px] text-slate-500">
                  Powered by {msg.source === 'gemini' ? 'Live Gemini AI' : 'AeroKin Scientific Engine'}
                </div>
              )}
            </div>

            {msg.role === 'user' && (
              <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-slate-300">
                <User className="h-4 w-4" />
              </div>
            )}
          </div>
        ))}

        {isSending && (
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Bot className="h-4 w-4 text-teal-400 animate-pulse" />
            Calculating exposure impact & drafting tailored guidance...
          </div>
        )}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="border-t border-slate-800 p-3 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about masks, school commute, indoor cooking, DIY filters..."
          className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 focus:border-teal-400 focus:outline-none"
        />
        <button
          type="submit"
          disabled={isSending || !input.trim()}
          className="inline-flex items-center gap-1.5 rounded-xl bg-teal-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-teal-400 disabled:opacity-40 transition cursor-pointer"
        >
          <Send className="h-3.5 w-3.5" />
          Send
        </button>
      </form>
    </div>
  );
}
