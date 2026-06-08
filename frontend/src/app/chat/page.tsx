'use client';

import { useState, useEffect, useRef } from 'react';
import AppLayout from '@/components/AppLayout';
import { fetchChatSessions, createChatSession, sendMessage } from '@/services/api';
import type { ChatSession, ChatMessage } from '@/services/api';

export default function ChatPage() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSession, setCurrentSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchChatSessions()
      .then((data) => {
        setSessions(data);
        if (data.length > 0) {
          setCurrentSession(data[0]);
          setMessages(data[0].messages || []);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleNewSession() {
    const session = await createChatSession().catch(() => null);
    if (session) {
      setSessions((prev) => [session, ...prev]);
      setCurrentSession(session);
      setMessages([]);
    }
  }

  async function handleSend() {
    if (!input.trim() || !currentSession || sending) return;
    const userMsg: ChatMessage = { role: 'user', content: input.trim(), timestamp: new Date().toISOString() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setSending(true);
    try {
      const { reply } = await sendMessage(currentSession.id, userMsg.content);
      setMessages((prev) => [...prev, { role: 'assistant', content: reply, timestamp: new Date().toISOString() }]);
    } catch (err) {
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Sorry, something went wrong. Please try again.', timestamp: new Date().toISOString() }]);
    } finally {
      setSending(false);
    }
  }

  return (
    <AppLayout showRightPanel={false}>
      <div className="flex h-[calc(100vh-64px)] md:h-screen">
        {/* Session sidebar */}
        <div className="hidden md:flex w-[240px] border-r border-gray-200 bg-white flex-col">
          <div className="p-4 border-b border-gray-200">
            <button onClick={handleNewSession} className="w-full py-2.5 bg-primary text-text-inverse text-[14px] font-semibold rounded-btn hover:brightness-110 transition-all">
              + New Chat
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {sessions.map((s) => (
              <button
                key={s.id}
                onClick={() => { setCurrentSession(s); setMessages(s.messages || []); }}
                className={`w-full text-left px-4 py-3 text-[13px] border-b border-gray-200 hover:bg-gray-100 transition-colors
                  ${currentSession?.id === s.id ? 'bg-primary-light/20 text-primary font-semibold' : 'text-text-secondary'}`}
              >
                {s.messages?.[0]?.content?.slice(0, 40) || 'New conversation'}...
              </button>
            ))}
          </div>
        </div>

        {/* Chat area */}
        <div className="flex-1 flex flex-col">
          <div className="flex items-center justify-between px-4 md:px-6 py-3 border-b border-gray-200 bg-white">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">smart_toy</span>
              <h2 className="text-[16px] font-bold text-text-primary">ScholarBot</h2>
            </div>
            <span className="text-[12px] text-text-secondary">AI Scholarship Advisor</span>
          </div>

          <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4 space-y-4">
            {messages.length === 0 && (
              <div className="text-center py-16">
                <span className="material-symbols-outlined text-5xl text-text-secondary mb-4 block">chat</span>
                <p className="text-[16px] text-text-secondary">Ask ScholarBot about scholarships</p>
                <p className="text-[13px] text-text-secondary mt-1">Try: &quot;What fully funded scholarships match my profile?&quot;</p>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] px-4 py-3 rounded-card text-[14px] leading-relaxed
                  ${msg.role === 'user'
                    ? 'bg-primary text-text-inverse rounded-br-sm'
                    : 'bg-white border border-gray-200 text-text-primary rounded-bl-sm'
                  }`}>
                  {msg.content}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="px-4 py-3 rounded-card bg-white border border-gray-200 text-text-secondary text-[14px]">
                  <span className="animate-pulse">Thinking...</span>
                </div>
              </div>
            )}
            <div ref={messagesEnd} />
          </div>

          <div className="px-4 md:px-6 py-4 border-t border-gray-200 bg-white">
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Ask about scholarships..."
                className="flex-1 p-3 bg-gray-100 border border-gray-200 rounded-card text-text-primary placeholder:text-text-secondary focus:ring-2 focus:ring-primary focus:border-transparent text-[14px]"
              />
              <button onClick={handleSend} disabled={sending || !input.trim()} className="px-5 py-3 bg-primary text-text-inverse font-semibold rounded-btn hover:brightness-110 transition-all disabled:opacity-50">
                <span className="material-symbols-outlined text-[20px]">send</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
