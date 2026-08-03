'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { rewriteField, type Resume } from '@/services/api';

interface Props {
  resume: Resume;
  onResumeUpdate: (resume: Resume) => void;
  activeSection?: string | null;
  onSectionTag?: (section: string) => void;
}

interface Message {
  role: 'user' | 'ai' | 'system';
  content: string;
  section?: string;
  timestamp: number;
}

const SECTION_HINTS: Record<string, string> = {
  summary: 'Make my summary more impactful for scholarship applications',
  education: 'Polish my education section',
  experience: 'Rewrite my work experience with stronger action verbs',
  research: 'Improve my research/projects descriptions',
  skills: 'Organize and improve my skills list',
  certifications: 'Improve my certifications section',
  publications: 'Polish my publications section',
  awards: 'Improve my awards section',
  languages: 'Improve my languages section',
  references: 'Polish my references section',
};

export default function AIRewriteChat({ resume, onResumeUpdate, activeSection, onSectionTag }: Props) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'system',
      content: 'Hi! I can help improve your resume. Click a section on the preview or type @section to tag one, then tell me what to change.',
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
      // Don't add duplicate hint
      const lastMsg = messages[messages.length - 1];
      if (lastMsg?.role !== 'system' || !lastMsg.content.includes(activeSection)) {
        setMessages(prev => [...prev, {
          role: 'system',
          content: `Selected: ${activeSection}. ${SECTION_HINTS[activeSection]}`,
          section: activeSection,
          timestamp: Date.now(),
        }]);
      }
    }
  }, [activeSection]);

  const handleInput = (value: string) => {
    setInput(value);
    // Detect @mention
    const lastAt = value.lastIndexOf('@');
    if (lastAt >= 0 && lastAt === value.length - 1 - (value.length - 1 - lastAt)) {
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
    const targetSection = mentionedSection || activeSection;

    // Add user message
    const userMsg: Message = {
      role: 'user',
      content: trimmed,
      section: targetSection || undefined,
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setShowMentions(false);

    if (!targetSection) {
      setMessages(prev => [...prev, {
        role: 'ai',
        content: 'Please tag a section first — click one on the preview or type @section (e.g. @summary, @experience).',
        timestamp: Date.now(),
      }]);
      return;
    }

    setLoading(true);
    try {
      // Get current value for the section
      const currentValue = getSectionValue(resume, targetSection);
      const context = `Resume for ${resume.full_name || 'user'}, targeting ${resume.target_degree || 'scholarship'}. Section: ${targetSection}.`;

      const result = await rewriteField(resume.id, targetSection, currentValue, context + '\n\nUser instruction: ' + trimmed);

      setMessages(prev => [...prev, {
        role: 'ai',
        content: `Here's the improved ${targetSection}:\n\n${result.improved_value}`,
        section: targetSection,
        timestamp: Date.now(),
      }]);
    } catch (err: any) {
      setMessages(prev => [...prev, {
        role: 'ai',
        content: `Sorry, the rewrite failed. ${err?.response?.data?.detail || 'Please try again.'}`,
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
              {msg.section && msg.role === 'system' && (
                <span className="inline-block px-1.5 py-0.5 mb-1 text-[10px] font-bold bg-blue-100 text-blue-600 rounded uppercase">
                  {msg.section}
                </span>
              )}
              <p className="whitespace-pre-wrap">{msg.content}</p>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-xl px-3 py-2 text-[13px] text-gray-500 flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px] animate-spin">refresh</span>
              Rewriting...
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
            <span className="text-[11px] font-semibold text-primary">Active: {activeSection}</span>
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
            placeholder="Type @section and your instruction..."
            rows={1}
            className="flex-1 px-3 py-2 text-[13px] bg-gray-50 border border-gray-200 rounded-xl focus:ring-1 focus:ring-primary focus:border-primary outline-none resize-none transition-all"
            style={{ minHeight: 38, maxHeight: 100 }}
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

function getSectionValue(resume: Resume, section: string): string {
  switch (section) {
    case 'summary': return resume.summary || '';
    case 'education': return JSON.stringify(resume.education || []);
    case 'experience': return JSON.stringify(resume.experience || []);
    case 'research': return JSON.stringify(resume.research_projects || []);
    case 'skills': return (resume.skills || []).join(', ');
    case 'certifications': return JSON.stringify(resume.certifications || []);
    case 'publications': return JSON.stringify(resume.publications || []);
    case 'awards': return JSON.stringify(resume.awards || []);
    case 'languages': return JSON.stringify(resume.languages || []);
    case 'references': return JSON.stringify(resume.ref_list || []);
    default: return '';
  }
}
