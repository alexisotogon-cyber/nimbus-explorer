"use client";

import { useState, useRef, useEffect } from "react";
import { AiIcon, SparkleIcon } from "./icons";
import { useLocale } from "@/i18n/locale-provider";
import { formatPlural, type TranslationKey } from "@/i18n/translate";
import type { AtlasScreenContextInput } from "@/engine/atlas-screen-context";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  toolCalls?: { tool: string }[];
  atlasMode?: "deterministic" | "llm";
  cached?: boolean;
  totalTokens?: number;
}

/**
 * Friendly labels for tool-call badges (raw tool names never shown).
 *
 * The tool names are identifiers coming off the API response, so they stay as
 * keys; the phrase each one maps to lives in the dictionary. An unknown tool
 * still falls back to its raw name, which is the visible-bug behaviour we want.
 */
const TOOL_LABEL_KEYS: Record<string, TranslationKey> = {
  query_financial_reconciliation: "chat.toolReconciliation",
  query_upload_diagnosis: "chat.toolUploadDiagnosis",
  query_billing: "chat.toolQueryBilling",
  calculate_savings: "chat.toolCalculateSavings",
  generate_remediation: "chat.toolGenerateRemediation",
  build_report: "chat.toolBuildReport",
  lookup_knowledge: "chat.toolLookupKnowledge",
};

/** The starter questions, in the order they are offered. */
const SUGGESTION_KEYS: TranslationKey[] = [
  "chat.suggestion1",
  "chat.suggestion2",
  "chat.suggestion3",
  "chat.suggestion4",
  "chat.suggestion5",
  "chat.suggestion6",
];

/**
 * Lightweight markdown renderer for agent responses.
 * Handles: **bold**, - bullets, ## headers, `code`, and https:// links.
 * No external dependency needed.
 */
function MessageContent({ content }: { content: string }) {
  const lines = content.split("\n");

  return (
    <>
      {lines.map((line, lineIdx) => {
        // Headers
        if (line.startsWith("### ")) {
          return <p key={lineIdx} className="font-semibold text-xs mt-2 mb-0.5">{renderInline(line.slice(4))}</p>;
        }
        if (line.startsWith("## ")) {
          return <p key={lineIdx} className="font-bold text-[13px] mt-2.5 mb-0.5">{renderInline(line.slice(3))}</p>;
        }

        // Bullet points
        if (/^\s*[-*]\s/.test(line)) {
          const text = line.replace(/^\s*[-*]\s/, "");
          return (
            <div key={lineIdx} className="flex gap-1.5 ml-1 mt-0.5">
              <span className="text-ink-muted select-none">-</span>
              <span>{renderInline(text)}</span>
            </div>
          );
        }

        // Numbered lists
        if (/^\s*\d+[.)]\s/.test(line)) {
          const match = line.match(/^\s*(\d+)[.)]\s(.*)/);
          if (match) {
            return (
              <div key={lineIdx} className="flex gap-1.5 ml-1 mt-0.5">
                <span className="text-ink-muted select-none min-w-[1rem] text-right">{match[1]}.</span>
                <span>{renderInline(match[2])}</span>
              </div>
            );
          }
        }

        // Empty line = spacing
        if (line.trim() === "") {
          return <div key={lineIdx} className="h-1.5" />;
        }

        // Normal paragraph
        return <p key={lineIdx} className="mt-0.5">{renderInline(line)}</p>;
      })}
    </>
  );
}

/** Renders inline markdown: **bold**, `code`, and https:// links. */
function renderInline(text: string): React.ReactNode[] {
  // Split by patterns: **bold**, `code`, and URLs
  const INLINE_RE = /(\*\*(.+?)\*\*|`([^`]+)`|https:\/\/[^\s)]+)/g;
  const parts: React.ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = INLINE_RE.exec(text)) !== null) {
    if (match.index > last) {
      parts.push(text.slice(last, match.index));
    }

    if (match[2]) {
      // **bold**
      parts.push(<strong key={match.index} className="font-semibold">{match[2]}</strong>);
    } else if (match[3]) {
      // `code`
      parts.push(<code key={match.index} className="bg-line px-1 py-0.5 rounded text-xs font-mono">{match[3]}</code>);
    } else {
      // URL
      const url = match[0].replace(/[.,;)]+$/, "");
      // No colour class: the link inherits `currentColor` from the bubble.
      // MessageContent renders inside both bubbles, and they are opposite fields
      // — assistant is `text-ink` on `bg-surface-2`, user is `text-brand-ink` on
      // `bg-brand` — so any pinned token is wrong on one of them. The old
      // `text-brand-soft hover:text-brand` measured 1.08:1 (light) / 1.22:1
      // (dark) on the assistant bubble, effectively invisible with only the
      // underline giving it away, and hover collapsed to 1.00:1 on the user
      // bubble where the hover colour equalled the fill. Inheriting reuses a pair
      // already verified against that bubble's own background (≥14:1 in all four
      // theme × bubble combinations) and keeps holding if either token moves.
      // Chosen over threading the bubble role into MessageContent: that value
      // would have to pass through every renderInline call site to carry
      // something the cascade already carries. Hover thickens the underline
      // rather than shifting hue, so the affordance costs no contrast.
      parts.push(
        <a
          key={match.index}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-1 underline-offset-2 hover:decoration-2 break-all"
        >
          {url.length > 50 ? url.slice(0, 47) + "..." : url}
        </a>
      );
      last = match.index + url.length;
      continue;
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));

  return parts;
}

interface AgentChatProps {
  analysisId: string;
  analysisToken: string;
  screenContext: AtlasScreenContextInput;
  onClose?: () => void;
  onMinimizedChange?: (minimized: boolean) => void;
}

export function AgentChat({ analysisId, analysisToken, screenContext, onClose, onMinimizedChange }: AgentChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const { t, dict, locale } = useLocale();
  const [sending, setSending] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [sessionId] = useState(() => `session-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const toggleMinimized = (value: boolean) => {
    setMinimized(value);
    onMinimizedChange?.(value);
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || sending || rateLimited) return;

    const userMsg: ChatMessage = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setSending(true);

    try {
      // No credentials are ever sent from the browser — Bedrock creds live on the server.
      const body: Record<string, unknown> = {
        sessionId,
        message: text,
        analysisId,
        locale,
        screenContext,
      };

      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Nimbus-Analysis-Token": analysisToken },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (data.success) {
        // Strip <thinking>...</thinking> blocks that some models (e.g. Nova Pro) include
        const cleanContent = (data.response.content || "").replace(/<thinking>[\s\S]*?<\/thinking>\s*/g, "").trim();
        setMessages((prev) => [...prev, {
          role: "assistant",
          content: cleanContent,
          toolCalls: data.response.toolCalls,
          atlasMode: data.atlas?.mode,
          cached: data.atlas?.cached,
          totalTokens: data.atlas?.usage?.totalTokens,
        }]);
      } else if (data.rateLimited) {
        setRateLimited(true);
        setMessages((prev) => [...prev, { role: "assistant", content: data.error }]);
      } else {
        setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${data.error}` }]);
      }
    } catch (err) {
      // "Error:" reads the same in both languages; only the cause needs a word.
      setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${err instanceof Error ? err.message : t("errors.unknownCause")}` }]);
    } finally {
      setSending(false);
    }
  };

  // The suggestions are both the button labels and the prompt sent to the agent,
  // so the user's language is what Atlas gets asked in.
  const suggestedQuestions = SUGGESTION_KEYS.map((key) => t(key));

  // Minimized state: show only a small tab
  if (minimized) {
    return (
      <div className="bg-shell rounded-2xl ring-1 ring-line shadow-soft-lg overflow-hidden">
        <button
          onClick={() => toggleMinimized(false)}
          className="flex items-center gap-2.5 px-4 py-3 text-shell-ink hover:bg-shell-ink/5 transition-colors w-full text-left"
        >
          <AiIcon className="w-5 h-5 text-shell-ink/90" />
          <div className="flex-1">
            <p className="text-sm font-medium">{t("chat.agentName")}</p>
            <p className="text-xs text-shell-ink/60">{messages.length > 0 ? formatPlural(dict.chat.messageCount, messages.length) : t("chat.expandHint")}</p>
          </div>
          <svg className="w-4 h-4 text-shell-ink/60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)] bg-surface rounded-2xl ring-1 ring-line shadow-2xl overflow-hidden">
      <div className="bg-shell text-shell-ink px-4 py-3 flex items-center gap-2.5">
        <AiIcon className="w-5 h-5 text-shell-ink/90" />
        <div className="flex-1">
          <p className="text-sm font-medium">{t("chat.agentName")}</p>
          <p className="text-xs text-shell-ink/60">{t("chat.agentTagline")}</p>
        </div>
        <div className="flex items-center gap-1">
          {/* Minimize button */}
          <button
            onClick={() => toggleMinimized(true)}
            className="p-1.5 rounded-lg hover:bg-shell-ink/10 transition-colors"
            title={t("chat.minimize")}
          >
            <svg className="w-4 h-4 text-shell-ink/70" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </button>
          {/* Close button */}
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-shell-ink/10 transition-colors"
              title={t("chat.closeChat")}
            >
              <svg className="w-4 h-4 text-shell-ink/70" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-6">
            <p className="text-ink-muted text-sm mb-3">{t("chat.intro")}</p>
            <div className="grid grid-cols-1 gap-2">
              {suggestedQuestions.map((q) => (
                <button key={q} onClick={() => sendMessage(q)} className="text-left text-xs px-3 py-2 bg-surface-2 hover:bg-surface-3 rounded-lg border border-line text-ink-muted transition-colors">{q}</button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-xl px-3 py-2 ${msg.role === "user" ? "bg-brand text-brand-ink" : "bg-surface-2 text-ink border border-line"}`}>
              {msg.role === "assistant" && msg.atlasMode && (
                <div className="mb-1.5">
                  <span className="inline-flex text-xs font-medium text-ink-muted bg-surface-3 px-1.5 py-0.5 rounded-full">
                    {msg.cached
                      ? t("chat.modeCached")
                      : msg.atlasMode === "deterministic"
                        ? t("chat.modeDeterministic")
                        : t("chat.modeLlm", { count: msg.totalTokens ?? 0 })}
                  </span>
                </div>
              )}
              {msg.toolCalls && msg.toolCalls.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-1.5">
                  {msg.toolCalls.map((tc, j) => (
                    <span key={j} className="inline-flex items-center gap-1 text-xs bg-brand-soft text-brand px-1.5 py-0.5 rounded-full">
                      <SparkleIcon className="w-2.5 h-2.5" /> {TOOL_LABEL_KEYS[tc.tool] ? t(TOOL_LABEL_KEYS[tc.tool]) : tc.tool}
                    </span>
                  ))}
                </div>
              )}
              <div className="text-body"><MessageContent content={msg.content} /></div>
            </div>
          </div>
        ))}

        {sending && (
          <div className="flex justify-start">
            <div className="bg-surface-2 border border-line rounded-xl px-4 py-3">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-ink-faint rounded-full animate-bounce" />
                <span className="w-2 h-2 bg-ink-faint rounded-full animate-bounce [animation-delay:0.1s]" />
                <span className="w-2 h-2 bg-ink-faint rounded-full animate-bounce [animation-delay:0.2s]" />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-line p-3">
        <form onSubmit={(e) => { e.preventDefault(); sendMessage(input); }} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={rateLimited ? t("chat.placeholderRateLimited") : t("chat.placeholder")}
            className="flex-1 px-3 py-2 border border-line-strong rounded-lg text-sm focus:ring-2 focus:ring-brand/40 focus:border-brand disabled:bg-surface-2"
            disabled={sending || rateLimited}
          />
          <button
            type="submit"
            disabled={!input.trim() || sending || rateLimited}
            className="px-4 py-2 bg-brand text-brand-ink rounded-xl text-sm font-semibold hover:bg-brand-strong disabled:opacity-40 shadow-sm hover:shadow-md transition-[background-color,box-shadow] duration-200"
          >
            {t("chat.send")}
          </button>
        </form>
      </div>
    </div>
  );
}
