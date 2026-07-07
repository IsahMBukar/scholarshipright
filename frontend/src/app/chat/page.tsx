'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import MobileNav from '@/components/MobileNav';
import { EligibilityCard, ReadinessCard, RoadmapCard, DiscoverCard, DocumentCard, type EligibilityCardData, type ReadinessCardData, type RoadmapCardData, type DiscoverCardData, type DocumentCardData } from '@/components/AgentCards';
import OnboardingGate from '@/components/OnboardingGate';
import {
  fetchAgentContext,
  agentChatStream,
} from '@/services/api';
import type { AgentContext } from '@/services/api';
import { markChatted, useOnboarding } from '@/hooks/useOnboarding';

const ACTIONS = [
  { id: 'discover', icon: 'explore', label: 'Find Opportunities', desc: 'Smart discovery', color: 'bg-blue-50 text-blue-600' },
  { id: 'eligibility', icon: 'verified', label: 'Check Eligibility', desc: 'Instant verdict', color: 'bg-green-50 text-green-600' },
  { id: 'readiness', icon: 'assessment', label: 'Readiness Score', desc: 'Application check', color: 'bg-purple-50 text-purple-600' },
  { id: 'roadmap', icon: 'route', label: 'Career Roadmap', desc: 'Path to eligibility', color: 'bg-orange-50 text-orange-600' },
  { id: 'generate', icon: 'edit_document', label: 'Draft Documents', desc: 'SOP, CV, letters', color: 'bg-pink-50 text-pink-600' },
  { id: 'chat', icon: 'chat', label: 'Ask Scholara', desc: 'General advice', color: 'bg-gray-50 text-gray-600' },
];

const DOC_TYPES = [
  { id: 'sop', label: 'Statement of Purpose', icon: 'article' },
  { id: 'motivation_letter', label: 'Motivation Letter', icon: 'mail' },
  { id: 'research_proposal', label: 'Research Proposal', icon: 'science' },
  { id: 'cv', label: 'CV / Resume', icon: 'description' },
  { id: 'cover_letter', label: 'Cover Letter', icon: 'forward_to_inbox' },
];

const TOOL_LABELS: Record<string, string> = {
  get_user_profile: 'Looking up your profile',
  get_user_resume: 'Checking your resume',
  search_scholarships: 'Searching scholarships',
  get_scholarship_detail: 'Fetching scholarship details',
  get_user_matches: 'Computing your matches',
  get_saved_scholarships: 'Checking saved scholarships',
};

interface ReasoningStep {
  type: 'thinking' | 'tool_call' | 'tool_result';
  content: string;
  toolName?: string;
  toolResult?: unknown;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content?: string;
  action?: string;
  data?: unknown;
  timestamp: Date;
  reasoning?: ReasoningStep[];
  isStreaming?: boolean;
}

function renderInlineMarkdown(text: string) {
  const parts = text.split(/(\[[^\]]+\]\([^\)]+\)|\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, idx) => {
    const link = part.match(/^\[([^\]]+)\]\(([^\)]+)\)$/);
    if (link) {
      return (
        <a key={idx} href={link[2]} target="_blank" rel="noreferrer" className="text-[#c88700] font-semibold underline underline-offset-2">
          {link[1]}
        </a>
      );
    }
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={idx} className="font-bold text-text-primary">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={idx} className="px-1 py-0.5 rounded bg-gray-100 text-[12px] text-[#8a5a00]">{part.slice(1, -1)}</code>;
    }
    return <span key={idx}>{part}</span>;
  });
}

function MarkdownText({ content }: { content: string }) {
  const lines = content.split('\n');
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) {
      i += 1;
      continue;
    }

    if (line.startsWith('### ')) {
      blocks.push(<h4 key={i} className="mt-3 first:mt-0 mb-1 text-[14px] font-bold text-text-primary">{renderInlineMarkdown(line.slice(4))}</h4>);
      i += 1;
      continue;
    }
    if (line.startsWith('## ')) {
      blocks.push(<h3 key={i} className="mt-3 first:mt-0 mb-1 text-[15px] font-extrabold text-text-primary">{renderInlineMarkdown(line.slice(3))}</h3>);
      i += 1;
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ''));
        i += 1;
      }
      blocks.push(
        <ul key={i} className="my-2 space-y-1.5 list-disc pl-5 marker:text-[#f5b942]">
          {items.map((item, idx) => <li key={idx}>{renderInlineMarkdown(item)}</li>)}
        </ul>
      );
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ''));
        i += 1;
      }
      blocks.push(
        <ol key={i} className="my-2 space-y-1.5 list-decimal pl-5 marker:text-[#f5b942] marker:font-bold">
          {items.map((item, idx) => <li key={idx}>{renderInlineMarkdown(item)}</li>)}
        </ol>
      );
      continue;
    }

    const paragraph = [line];
    i += 1;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trim().startsWith('## ') &&
      !/^[-*]\s+/.test(lines[i].trim()) &&
      !/^\d+\.\s+/.test(lines[i].trim())
    ) {
      paragraph.push(lines[i].trim());
      i += 1;
    }
    blocks.push(<p key={i} className="my-2 first:mt-0 last:mb-0">{renderInlineMarkdown(paragraph.join(' '))}</p>);
  }

  return <div className="space-y-1">{blocks}</div>;
}

export default function AgentPage() {
  const [context, setContext] = useState<AgentContext | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [selectedDocType, setSelectedDocType] = useState('sop');
  const [showScholarshipPicker, setShowScholarshipPicker] = useState(false);
  const [showDocPicker, setShowDocPicker] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [showReasoning, setShowReasoning] = useState<Record<string, boolean>>({});
  const messagesEnd = useRef<HTMLDivElement>(null);
  const streamingContent = useRef('');

  // Drives the OnboardingGate wrapper below. We refresh after each successful
  // send so the gate lifts itself the moment a user chats for the first time.
  const onboarding = useOnboarding();
  const chatLocked = !onboarding.loading && !(onboarding.hasProfile && onboarding.hasResume);

  useEffect(() => {
    fetchAgentContext().then(setContext).catch((e) => console.error('[Chat] Agent context:', e));
  }, []);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function addUserMessage(text: string, action?: string) {
    const msg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      action,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, msg]);
    // First-time chat signal so the onboarding checklist completes itself.
    markChatted();
  }

  function addAssistantMessage(content?: string, action?: string, data?: any, reasoning?: ReasoningStep[]) {
    const msg: ChatMessage = {
      id: Date.now().toString() + '-a',
      role: 'assistant',
      content,
      action,
      data,
      timestamp: new Date(),
      reasoning,
    };
    setMessages((prev) => [...prev, msg]);
  }

  // ── Streaming chat handler ──────────────────────────────────
  const handleStreamChat = useCallback(async (
    text: string,
    options: { action?: string; scholarshipId?: string; documentType?: string } = {},
  ) => {
    const streamAction = options.action || 'chat';
    addUserMessage(text, streamAction);
    setLoading(true);
    streamingContent.current = '';

    const reasoningSteps: ReasoningStep[] = [];
    const assistantId = Date.now().toString() + '-a-streaming';

    // Add placeholder message that we'll update
    setMessages((prev) => [...prev, {
      id: assistantId,
      role: 'assistant',
      content: '',
      action: streamAction,
      timestamp: new Date(),
      reasoning: [],
      isStreaming: true,
    }]);

    await agentChatStream(text, sessionId, {
      onThinking: (step) => {
        reasoningSteps.push({ type: 'thinking', content: step });
        setMessages((prev) => prev.map(m =>
          m.id === assistantId ? { ...m, reasoning: [...reasoningSteps] } : m
        ));
      },
      onToolCall: (name, args) => {
        const label = TOOL_LABELS[name] || `Using ${name}`;
        reasoningSteps.push({ type: 'tool_call', content: label, toolName: name });
        setMessages((prev) => prev.map(m =>
          m.id === assistantId ? { ...m, reasoning: [...reasoningSteps] } : m
        ));
      },
      onToolResult: (name, result) => {
        reasoningSteps.push({ type: 'tool_result', content: `Got data from ${name}`, toolName: name, toolResult: result });
        setMessages((prev) => prev.map(m =>
          m.id === assistantId ? { ...m, reasoning: [...reasoningSteps] } : m
        ));
      },
      onToken: (token) => {
        streamingContent.current += token;
        setMessages((prev) => prev.map(m =>
          m.id === assistantId ? { ...m, content: streamingContent.current } : m
        ));
      },
      onDone: (result) => {
        const sid = result?._session_id;
        if (typeof sid === 'string') setSessionId(sid);
        // Check if it's a structured response
        if (result && result.type && result.type !== 'text') {
          setMessages((prev) => prev.map(m =>
            m.id === assistantId ? {
              ...m,
              content: undefined,
              action: result.type,
              data: result,
              isStreaming: false,
              reasoning: reasoningSteps,
            } : m
          ));
        } else {
          const rawContent = result?.content;
          const finalContent = typeof rawContent === 'string' && rawContent
            ? rawContent
            : streamingContent.current;
          setMessages((prev) => prev.map(m =>
            m.id === assistantId ? {
              ...m,
              content: finalContent,
              isStreaming: false,
              reasoning: reasoningSteps,
            } : m
          ));
        }
        setLoading(false);
      },
      onError: (error) => {
        setMessages((prev) => prev.map(m =>
          m.id === assistantId ? {
            ...m,
            content: `Sorry, something went wrong: ${error}`,
            isStreaming: false,
          } : m
        ));
        setLoading(false);
      },
      onSession: (sid) => {
        setSessionId(sid);
      },
    }, options);
  }, [sessionId]);

  // ── Action handlers (structured, non-streaming) ─────────────
  async function handleAction(actionId: string) {
    setActiveAction(actionId);

    if (actionId === 'eligibility' || actionId === 'roadmap') {
      setShowScholarshipPicker(true);
      return;
    }
    if (actionId === 'generate') {
      setShowScholarshipPicker(true);
      setShowDocPicker(true);
      return;
    }
    if (actionId === 'readiness') {
      setShowScholarshipPicker(true);
      return;
    }
    if (actionId === 'discover') {
      setInput('I am interested in ');
      return;
    }
    if (actionId === 'chat') {
      setInput('');
      return;
    }
  }

  async function handleScholarshipSelect(scholarshipId: string) {
    setShowScholarshipPicker(false);
    setShowDocPicker(false);
    const sch = context?.top_matches.find((s) => s.id === scholarshipId);
    const schName = sch?.name || scholarshipId;

    if (activeAction === 'eligibility') {
      await handleStreamChat(`Check eligibility for ${schName}`, { action: 'eligibility', scholarshipId });
    } else if (activeAction === 'roadmap') {
      await handleStreamChat(`Generate roadmap for ${schName}`, { action: 'roadmap', scholarshipId });
    } else if (activeAction === 'readiness') {
      await handleStreamChat(`Assess readiness for ${schName}`, { action: 'readiness', scholarshipId });
    } else if (activeAction === 'generate') {
      const docLabel = DOC_TYPES.find((d) => d.id === selectedDocType)?.label || selectedDocType;
      await handleStreamChat(`Generate ${docLabel} for ${schName}`, { action: 'generate', scholarshipId, documentType: selectedDocType });
    }
    setActiveAction(null);
  }

  async function handleSend() {
    if (!input.trim() || loading) return;
    const text = input.trim();
    setInput('');

    if (activeAction === 'discover') {
      await handleStreamChat(text, { action: 'discover' });
      setActiveAction(null);
      return;
    }

    // Use streaming for all other messages
    await handleStreamChat(text);
    setActiveAction(null);
  }

  function toggleReasoning(msgId: string) {
    setShowReasoning(prev => ({ ...prev, [msgId]: !prev[msgId] }));
  }

  function renderReasoningSteps(steps: ReasoningStep[], msgId: string) {
    if (!steps || steps.length === 0) return null;
    const isExpanded = showReasoning[msgId];

    return (
      <div className="mb-2">
        <button
          onClick={() => toggleReasoning(msgId)}
          className="flex items-center gap-1.5 text-[11px] text-text-secondary hover:text-[#f5b942] transition-colors"
        >
          <span className="material-symbols-outlined text-[14px]">
            {isExpanded ? 'expand_less' : 'expand_more'}
          </span>
          <span className="font-medium">{steps.length} reasoning steps</span>
        </button>
        {isExpanded && (
          <div className="mt-1.5 ml-2 border-l-2 border-[#f5b942]/30 pl-3 space-y-1">
            {steps.map((step, i) => (
              <div key={i} className="flex items-start gap-2 text-[11px]">
                {step.type === 'thinking' && (
                  <>
                    <span className="material-symbols-outlined text-[12px] text-blue-500 mt-0.5">psychology</span>
                    <span className="text-text-secondary">{step.content}</span>
                  </>
                )}
                {step.type === 'tool_call' && (
                  <>
                    <span className="material-symbols-outlined text-[12px] text-[#f5b942] mt-0.5">build</span>
                    <span className="text-[#f5b942] font-medium">{step.content}</span>
                  </>
                )}
                {step.type === 'tool_result' && (
                  <>
                    <span className="material-symbols-outlined text-[12px] text-green-500 mt-0.5">check_circle</span>
                    <span className="text-green-600">Data loaded</span>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  function renderMessage(msg: ChatMessage) {
    if (msg.role === 'user') {
      return (
        <div key={msg.id} className="flex justify-end">
          <div className="max-w-[80%] px-4 py-3 rounded-2xl rounded-br-sm bg-[#f5b942] text-white text-[14px] leading-relaxed">
            {msg.content}
          </div>
        </div>
      );
    }

    return (
      <div key={msg.id} className="flex justify-start">
        <div className="max-w-[90%]">
          {/* Action badge */}
          {msg.action && msg.action !== 'chat' && (
            <div className="flex items-center gap-1.5 mb-2">
              <span className="material-symbols-outlined text-[16px] text-[#f5b942]">smart_toy</span>
              <span className="text-[11px] font-bold text-[#f5b942] uppercase tracking-wider">
                Scholara • {msg.action}
              </span>
            </div>
          )}

          {/* Reasoning chain */}
          {msg.reasoning && msg.reasoning.length > 0 && renderReasoningSteps(msg.reasoning, msg.id)}

          {/* Structured responses */}
          {msg.action === 'eligibility' && msg.data ? (
            <EligibilityCard data={msg.data as EligibilityCardData} />
          ) : msg.action === 'readiness' && msg.data ? (
            <ReadinessCard data={msg.data as ReadinessCardData} />
          ) : msg.action === 'roadmap' && msg.data ? (
            <RoadmapCard data={msg.data as RoadmapCardData} />
          ) : msg.action === 'discover' && msg.data ? (
            <DiscoverCard data={msg.data as DiscoverCardData} />
          ) : msg.action === 'generate' && msg.data ? (
            <DocumentCard data={msg.data as DocumentCardData} />
          ) : (
            <div className="px-4 py-3 rounded-2xl rounded-bl-sm bg-white border border-gray-200 text-[14px] leading-relaxed text-text-primary">
              {msg.content ? <MarkdownText content={msg.content} /> : (msg.isStreaming ? (
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    <div className="w-1.5 h-1.5 bg-[#f5b942] rounded-full animate-bounce" />
                    <div className="w-1.5 h-1.5 bg-[#f5b942] rounded-full animate-bounce delay-100" />
                    <div className="w-1.5 h-1.5 bg-[#f5b942] rounded-full animate-bounce delay-200" />
                  </div>
                  <span className="text-text-secondary text-[13px]">Starting response...</span>
                </div>
              ) : null)}
              {msg.isStreaming && msg.content && (
                <span className="inline-block w-[2px] h-[16px] bg-[#f5b942] animate-pulse ml-0.5 align-middle" />
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <AppLayout showRightPanel={false}>
      <MobileNav />
      {chatLocked ? (
        <OnboardingGate
          requires="resume"
          icon="smart_toy"
          title="Scholara needs your profile and resume first"
          description="Scholara gives personalized answers by reading your profile and resume. Add both, then come back to chat — it only takes a couple of minutes."
        />
      ) : (
      <div className="flex h-[calc(100vh-64px)] md:h-screen">
        {/* Mobile sidebar toggle */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="md:hidden fixed bottom-20 left-4 z-50 w-12 h-12 bg-[#f5b942] text-white rounded-full shadow-lg flex items-center justify-center"
        >
          <span className="material-symbols-outlined">{sidebarOpen ? 'close' : 'tune'}</span>
        </button>

        {/* Sidebar */}
        <div className={`${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 fixed md:static inset-y-0 left-0 z-40 w-[280px] bg-white border-r border-gray-200 flex flex-col transition-transform`}>
          {/* Agent header */}
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#f5b942] to-orange-400 flex items-center justify-center">
                <span className="material-symbols-outlined text-white text-[22px]">smart_toy</span>
              </div>
              <div>
                <h2 className="text-[15px] font-bold text-text-primary">Scholara</h2>
                <p className="text-[11px] text-text-secondary">AI Scholarship Advisor</p>
              </div>
            </div>
          </div>

          {/* Quick actions */}
          <div className="p-3 border-b border-gray-200">
            <h3 className="text-[11px] font-bold text-text-secondary uppercase tracking-wider px-2 mb-2">Quick Actions</h3>
            <div className="space-y-1">
              {ACTIONS.map((action) => (
                <button
                  key={action.id}
                  onClick={() => { handleAction(action.id); setSidebarOpen(false); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${
                    activeAction === action.id ? 'bg-[#f5b942]/10 text-[#f5b942]' : 'hover:bg-gray-50 text-text-primary'
                  }`}
                >
                  <span className={`material-symbols-outlined text-[20px] ${activeAction === action.id ? 'text-[#f5b942]' : 'text-text-secondary'}`}>
                    {action.icon}
                  </span>
                  <div>
                    <p className="text-[13px] font-semibold">{action.label}</p>
                    <p className="text-[11px] text-text-secondary">{action.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* New chat button */}
          <div className="p-3 border-b border-gray-200">
            <button
              onClick={() => { setMessages([]); setSessionId(null); setActiveAction(null); }}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-gray-300 hover:border-[#f5b942] hover:bg-[#f5b942]/5 transition-all text-text-secondary hover:text-[#f5b942]"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              <span className="text-[13px] font-medium">New Conversation</span>
            </button>
          </div>

          {/* User context */}
          {context && (
            <div className="flex-1 overflow-y-auto p-3">
              {/* Profile summary */}
              <div className="mb-4">
                <h3 className="text-[11px] font-bold text-text-secondary uppercase tracking-wider px-2 mb-2">Your Profile</h3>
                <div className="bg-gray-50 rounded-xl p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[16px] text-text-secondary">person</span>
                    <span className="text-[13px] font-medium text-text-primary">{context.profile.name}</span>
                  </div>
                  {context.profile.degree && (
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[16px] text-text-secondary">school</span>
                      <span className="text-[12px] text-text-secondary">{context.profile.degree} • {context.profile.field}</span>
                    </div>
                  )}
                  {context.profile.country && (
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[16px] text-text-secondary">flag</span>
                      <span className="text-[12px] text-text-secondary">{context.profile.country}</span>
                    </div>
                  )}
                  {context.profile.has_ielts && (
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[16px] text-text-secondary">translate</span>
                      <span className="text-[12px] text-text-secondary">IELTS {context.profile.ielts_score}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Resume score */}
              {context.resume.has_resume && (
                <div className="mb-4">
                  <h3 className="text-[11px] font-bold text-text-secondary uppercase tracking-wider px-2 mb-2">Resume Score</h3>
                  <div className="bg-gray-50 rounded-xl p-3">
                    <div className="flex items-center gap-3">
                      <div className={`text-[28px] font-bold ${
                        context.resume.score >= 70 ? 'text-green-600' : context.resume.score >= 50 ? 'text-yellow-600' : 'text-red-500'
                      }`}>
                        {context.resume.score}
                      </div>
                      <div>
                        <p className="text-[13px] font-medium text-text-primary">{context.resume.title || 'Your Resume'}</p>
                        <p className="text-[11px] text-text-secondary">
                          {context.resume.score >= 70 ? 'Strong profile' : context.resume.score >= 50 ? 'Needs improvement' : 'Upload a resume'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Top matches */}
              <div>
                <h3 className="text-[11px] font-bold text-text-secondary uppercase tracking-wider px-2 mb-2">Top Matches</h3>
                <div className="space-y-1">
                  {context.top_matches.slice(0, 5).map((sch) => (
                    <div key={sch.id} className="px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors">
                      <p className="text-[12px] font-medium text-text-primary truncate">{sch.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {sch.match_score && (
                          <span className={`text-[11px] font-bold ${
                            sch.match_score >= 70 ? 'text-green-600' : sch.match_score >= 40 ? 'text-yellow-600' : 'text-red-500'
                          }`}>{Math.round(sch.match_score)}%</span>
                        )}
                        <span className="text-[11px] text-text-secondary">{sch.host_country}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Main chat area */}
        <div className="flex-1 flex flex-col bg-gray-50">
          {/* Chat header */}
          <div className="flex items-center justify-between px-4 md:px-6 py-3 border-b border-gray-200 bg-white">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[#f5b942]">smart_toy</span>
              <h2 className="text-[16px] font-bold text-text-primary">Scholara</h2>
              {activeAction && (
                <span className="text-[11px] px-2 py-0.5 bg-[#f5b942]/10 text-[#f5b942] rounded-full font-medium">
                  {ACTIONS.find((a) => a.id === activeAction)?.label}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {sessionId && (
                <span className="text-[11px] px-2 py-0.5 bg-green-50 text-green-600 rounded-full font-medium flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                  Session active
                </span>
              )}
              <span className="text-[12px] text-text-secondary">Powered by GPT-5.5</span>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4 space-y-4">
            {messages.length === 0 && (
              <div className="text-center py-16">
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#f5b942]/20 to-[#f5b942]/5 flex items-center justify-center mx-auto mb-4">
                  <span className="material-symbols-outlined text-[40px] text-[#f5b942]">smart_toy</span>
                </div>
                <h3 className="text-[18px] font-bold text-text-primary mb-2">Welcome to Scholara</h3>
                <p className="text-[14px] text-text-secondary max-w-md mx-auto mb-6">
                  Your AI scholarship advisor. I can check eligibility, assess your readiness, create roadmaps, discover opportunities, and draft application documents.
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {ACTIONS.slice(0, 4).map((action) => (
                    <button
                      key={action.id}
                      onClick={() => handleAction(action.id)}
                      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 hover:border-[#f5b942] hover:bg-[#f5b942]/5 transition-all ${action.color}`}
                    >
                      <span className="material-symbols-outlined text-[18px]">{action.icon}</span>
                      <span className="text-[13px] font-medium">{action.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map(renderMessage)}

            {/* Scholarship picker modal */}
            {showScholarshipPicker && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-200 rounded-xl p-4 max-w-[400px]">
                  <h4 className="text-[14px] font-bold text-text-primary mb-2">
                    {showDocPicker ? 'Select document type first:' : 'Select a scholarship:'}
                  </h4>

                  {showDocPicker && (
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      {DOC_TYPES.map((dt) => (
                        <button
                          key={dt.id}
                          onClick={() => { setSelectedDocType(dt.id); setShowDocPicker(false); }}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-left transition-colors ${
                            selectedDocType === dt.id ? 'border-[#f5b942] bg-[#f5b942]/5' : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <span className="material-symbols-outlined text-[18px] text-text-secondary">{dt.icon}</span>
                          <span className="text-[12px] font-medium">{dt.label}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {!showDocPicker && (
                    <div className="space-y-1 max-h-[300px] overflow-y-auto">
                      {context?.top_matches.map((sch) => (
                        <button
                          key={sch.id}
                          onClick={() => handleScholarshipSelect(sch.id)}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors text-left"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-medium text-text-primary truncate">{sch.name}</p>
                            <p className="text-[11px] text-text-secondary">{sch.host_country} • {sch.provider}</p>
                          </div>
                          {sch.match_score && (
                            <span className={`text-[12px] font-bold ${
                              sch.match_score >= 70 ? 'text-green-600' : sch.match_score >= 40 ? 'text-yellow-600' : 'text-red-500'
                            }`}>{Math.round(sch.match_score)}%</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}

                  <button
                    onClick={() => { setShowScholarshipPicker(false); setShowDocPicker(false); setActiveAction(null); }}
                    className="mt-2 text-[12px] text-text-secondary hover:text-text-primary"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {loading && !messages.some(m => m.isStreaming) && (
              <div className="flex justify-start">
                <div className="px-4 py-3 rounded-2xl rounded-bl-sm bg-white border border-gray-200">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 bg-[#f5b942] rounded-full animate-bounce" />
                      <div className="w-2 h-2 bg-[#f5b942] rounded-full animate-bounce delay-100" />
                      <div className="w-2 h-2 bg-[#f5b942] rounded-full animate-bounce delay-200" />
                    </div>
                    <span className="text-[13px] text-text-secondary">Scholara is thinking...</span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEnd} />
          </div>

          {/* Input area */}
          <div className="px-4 md:px-6 py-4 border-t border-gray-200 bg-white">
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                placeholder={
                  activeAction === 'discover' ? 'Describe what you\'re looking for...' :
                  activeAction === 'chat' ? 'Ask Scholara anything...' :
                  'Ask me anything about scholarships...'
                }
                className="flex-1 p-3 bg-gray-50 border border-gray-200 rounded-xl text-[14px] text-text-primary placeholder:text-text-secondary focus:ring-2 focus:ring-[#f5b942] focus:border-transparent outline-none"
              />
              <button
                onClick={handleSend}
                disabled={loading || !input.trim()}
                className="px-5 py-3 bg-[#f5b942] text-white font-semibold rounded-xl hover:brightness-110 transition-all disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[20px]">send</span>
              </button>
            </div>
          </div>
        </div>
      </div>
      )}
    </AppLayout>
  );
}
