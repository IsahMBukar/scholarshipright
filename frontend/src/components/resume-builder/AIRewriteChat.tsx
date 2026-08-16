'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { aiSmartEdit, type Resume } from '@/services/api';

interface Props {
  resume: Resume;
  onResumeUpdate: (resume: Resume) => void;
  activeSection?: string | null;
  onSectionTag?: (section: string) => void;
}

interface Message {
  role: 'user' | 'ai' | 'system';
  content: string;
  sections?: string[];
  timestamp: number;
}

const SECTION_HINTS: Record<string, string> = {
  summary: 'Make my summary more impactful for scholarship applications',
  education: 'Polish my education section',
  experience: 'Rewrite my work experience with stronger action verbs',
  research_projects: 'Improve my research/projects descriptions',
  skills: 'Organize and improve my skills list',
  certifications: 'Improve my certifications section',
  publications: 'Polish my publications section',
  awards: 'Improve my awards section',
  languages: 'Improve my languages section',
  ref_list: 'Polish my references section',
};

const SECTION_LABELS: Record<string, string> = {
  summary: 'Summary',
  education: 'Education',
  experience: 'Experience',
  skills: 'Skills',
  projects: 'Projects',
  research_projects: 'Research',
  certifications: 'Certifications',
  publications: 'Publications',
  awards: 'Awards',
  languages: 'Languages',
  ref_list: 'References',
};

export default function AIRewriteChat({ resume, onResumeUpdate, activeSection, onSectionTag }: Props) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'system',
      content: 'Hi! I can improve your resume using AI. Just tell me what you want to change — I\'ll read your full resume for context. You can also click a section on the preview or type @section to be specific.',
      timestamp: Date.now(),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const sections = Object.keys(SECTION_HINTS);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // When activeSection changes from preview click, show quick action
  useEffect(() => {
    if (activeSection && SECTION_HINTS[activeSection]) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg?.role !== 'system' || !lastMsg.content.includes(activeSection)) {
        setMessages(prev => [...prev, {
          role: 'system',
          content: `Selected: ${SECTION_LABELS[activeSection] || activeSection}. ${SECTION_HINTS[activeSection]}`,
          sections: [activeSection],
          timestamp: Date.now(),
        }]);
      }
    }
  }, [activeSection, messages]);

  const handleInput = (value: string) => {
    setInput(value);
    // Detect @mention — show dropdown when text after last @ has no spaces
    const lastAt = value.lastIndexOf('@');
    if (lastAt >= 0) {
      const afterAt = value.slice(lastAt + 1);
      if (!afterAt.includes(' ') && afterAt.length < 20) {
        setMentionFilter(afterAt.toLowerCase());
        setShowMentions(true);
        return;
      }
    }
    setShowMentions(false);
  };

  const insertMention = (section: string) => {
    const lastAt = input.lastIndexOf('@');
    const before = input.slice(0, lastAt);
    setInput(before + `@${section} `);
    setShowMentions(false);
    onSectionTag?.(section);
    inputRef.current?.focus();
  };

  const extractMentionedSection = (text: string): string | null => {
    const match = text.match(/@(\w+)/);
    if (match) {
      const found = sections.find(s => s.startsWith(match[1].toLowerCase()));
      return found || null;
    }
    return null;
  };

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const mentionedSection = extractMentionedSection(trimmed);

    // Add user message
    const userMsg: Message = {
      role: 'user',
      content: trimmed,
      sections: mentionedSection ? [mentionedSection] : undefined,
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setShowMentions(false);

    setLoading(true);
    try {
      // Build the prompt — if user tagged a section, prepend it for clarity
      let prompt = trimmed;
      if (mentionedSection) {
        prompt = `@${mentionedSection} ${trimmed}`;
      }

      // Call smart edit — backend reads the full resume and auto-applies changes
      const updatedResume = await aiSmartEdit(resume.id, prompt);

      // Figure out which sections changed by comparing old vs new
      const changedSections: string[] = [];
      const fieldMap: Record<string, keyof Resume> = {
        summary: 'summary',
        education: 'education',
        experience: 'experience',
        skills: 'skills',
        projects: 'projects',
        research_projects: 'research_projects',
        certifications: 'certifications',
        publications: 'publications',
        awards: 'awards',
        languages: 'languages',
        ref_list: 'ref_list',
      };

      for (const [section, field] of Object.entries(fieldMap)) {
        const oldVal = JSON.stringify(resume[field] ?? '');
        const newVal = JSON.stringify(updatedResume[field] ?? '');
        if (oldVal !== newVal) {
          changedSections.push(section);
        }
      }

      const sectionNames = changedSections
        .map(s => SECTION_LABELS[s] || s)
        .join(', ');

      // Build a summary of what changed
      let changeSummary = '';
      if (changedSections.length > 0) {
        changeSummary = `Updated ${sectionNames} and applied to your resume.`;
      } else {
        changeSummary = 'No changes were needed — your resume already looks good for that request.';
      }

      setMessages(prev => [...prev, {
        role: 'ai',
        content: changeSummary,
        sections: changedSections,
        timestamp: Date.now(),
      }]);

      // Update the parent with the new resume data
      onResumeUpdate(updatedResume);

    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setMessages(prev => [...prev, {
        role: 'ai',
        content: `Sorry, the edit failed. ${detail || 'Please try again.'}`,
        timestamp: Date.now(),
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const filteredSections = sections.filter(s =>
    s.includes(mentionFilter) || s.replace('_', '').includes(mentionFilter)
  );

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-xl px-3 py-2 text-[13px] leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-primary text-white'
                  : msg.role === 'system'
                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                  : 'bg-gray-100 text-gray-700'
              }`}
            >
              {msg.sections && msg.sections.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-1">
                  {msg.sections.map(s => (
                    <span key={s} className="inline-block px-1.5 py-0.5 text-[10px] font-bold bg-blue-100 text-blue-600 rounded uppercase">
                      {SECTION_LABELS[s] || s}
                    </span>
                  ))}
                </div>
              )}
              <p className="whitespace-pre-wrap">{formatAIContent(msg.content)}</p>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-xl px-3 py-2 text-[13px] text-gray-500 flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px] animate-spin">refresh</span>
              Reading your resume and editing...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Active section hint */}
      {activeSection && !loading && (
        <div className="px-3 pb-1">
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-primary/5 rounded-lg border border-primary/20">
            <span className="material-symbols-outlined text-[14px] text-primary">target</span>
            <span className="text-[11px] font-semibold text-primary">Active: {SECTION_LABELS[activeSection] || activeSection}</span>
            <button
              onClick={() => {
                setInput(prev => prev + `@${activeSection} `);
                inputRef.current?.focus();
              }}
              className="ml-auto text-[10px] text-primary hover:underline"
            >
              Tag in chat
            </button>
          </div>
        </div>
      )}

      {/* Mention dropdown */}
      {showMentions && filteredSections.length > 0 && (
        <div className="mx-3 mb-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          {filteredSections.map(s => (
            <button
              key={s}
              onClick={() => insertMention(s)}
              className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-left hover:bg-gray-50 transition-colors"
            >
              <span className="font-semibold text-gray-700">@{s}</span>
              <span className="text-gray-400 text-[11px]">{SECTION_HINTS[s]?.slice(0, 40)}</span>
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="px-3 pb-3">
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => handleInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Tell me what to change (e.g. make my summary professional)..."
            rows={3}
            className="flex-1 px-3 py-2 text-[16px] bg-gray-50 border border-gray-200 rounded-xl focus:ring-1 focus:ring-primary focus:border-primary outline-none resize-none transition-all"
            style={{ minHeight: 80, maxHeight: 160 }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading}
            className="w-9 h-9 flex items-center justify-center bg-primary text-white rounded-xl hover:brightness-110 disabled:opacity-40 transition-all flex-shrink-0"
          >
            <span className="material-symbols-outlined text-[18px]">send</span>
          </button>
        </div>
      </div>
    </div>
  );
}

/** Format AI response content — render JSON as readable key/value, plain text as-is. */
function formatAIContent(content: string): React.ReactNode {
  const trimmed = content.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return (
          <>
            {parsed.map((item, i) => (
              <span key={i} className="block mb-1">
                {typeof item === 'string' ? `• ${item}` : JSON.stringify(item)}
              </span>
            ))}
          </>
        );
      }
      if (typeof parsed === 'object' && parsed !== null) {
        return (
          <>
            {Object.entries(parsed).map(([k, v]) => {
              const val = Array.isArray(v) ? v.join(', ') : typeof v === 'object' ? JSON.stringify(v) : String(v ?? '');
              if (!val) return null;
              return (
                <span key={k} className="block">
                  <span className="font-semibold">{k.replace(/_/g, ' ')}:</span> {val}
                </span>
              );
            })}
          </>
        );
      }
    } catch {
      // Not valid JSON — fall through to plain text
    }
  }
  return content;
}
