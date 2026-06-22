import { Sparkles, MessageSquare, Send, Loader2 } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAskAI } from '../lib/hooks';
import { markdownToHtml } from '../lib/markdown';

interface Message {
    role: 'user' | 'assistant';
    content: string;
}

export default function MentorPage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState<Message[]>([]);
    const askAI = useAskAI();
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const hasAutoAsked = useRef(false);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    useEffect(() => {
        const query = searchParams.get('q') || searchParams.get('query');
        if (query && !hasAutoAsked.current) {
            hasAutoAsked.current = true;
            // Clear parameters from URL
            setSearchParams({}, { replace: true });
            
            // Run helper to send
            (async () => {
                setMessages(prev => [...prev, { role: 'user', content: query }]);
                try {
                    const result = await askAI.mutateAsync(query);
                    let answer: string;
                    if (typeof result === 'string') {
                        answer = result;
                    } else if (result && typeof result === 'object' && 'answer' in result) {
                        answer = (result as { answer: string }).answer;
                    } else {
                        answer = JSON.stringify(result);
                    }
                    setMessages(prev => [...prev, { role: 'assistant', content: answer }]);
                } catch (err) {
                    const message = err instanceof Error ? err.message : 'Failed to get response';
                    setMessages(prev => [...prev, { role: 'assistant', content: `⚠ Error: ${message}` }]);
                }
            })();
        }
    }, [searchParams, askAI, setSearchParams]);

    const handleSend = async () => {
        const query = input.trim();
        if (!query || askAI.isPending) return;

        setInput('');
        setMessages(prev => [...prev, { role: 'user', content: query }]);

        try {
            const result = await askAI.mutateAsync(query);
            let answer: string;
            if (typeof result === 'string') {
                answer = result;
            } else if (result && typeof result === 'object' && 'answer' in result) {
                answer = (result as { answer: string }).answer;
            } else {
                answer = JSON.stringify(result);
            }
            setMessages(prev => [...prev, { role: 'assistant', content: answer }]);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to get response';
            setMessages(prev => [...prev, { role: 'assistant', content: `⚠ Error: ${message}` }]);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleSuggestion = (q: string) => {
        setInput(q);
    };

    return (
        <div className="flex h-[calc(100vh-5rem)] flex-col">
            {/* Page Header */}
            <div className="mb-6">
                <div className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-indigo-400" />
                    <h2 className="text-xl font-semibold tracking-tight text-white">AI Mentor</h2>
                </div>
                <p className="mt-1 text-sm text-neutral-500">
                    Private, judgment-free AI assistant for codebase questions
                </p>
            </div>

            {/* Chat Area */}
            <div className="flex flex-1 flex-col rounded-2xl border border-white/[0.06] bg-white/[0.02]">
                {/* Messages / Empty state */}
                <div className="flex flex-1 flex-col overflow-y-auto p-6">
                    {messages.length === 0 ? (
                        <div className="flex flex-1 flex-col items-center justify-center text-center">
                            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-500/10">
                                <MessageSquare className="h-8 w-8 text-indigo-400" />
                            </div>
                            <h3 className="text-lg font-medium text-neutral-200">Ask me anything about this codebase</h3>
                            <p className="mt-2 max-w-md text-sm text-neutral-600">
                                I can help you understand how modules connect, explain complex functions,
                                or suggest refactoring approaches. No question is too basic.
                            </p>
                            <div className="mt-6 flex flex-wrap justify-center gap-2">
                                {[
                                    'How does the graph resolver work?',
                                    'Explain blast radius scoring',
                                    'What are the main modules?',
                                    'Which files have the highest complexity?',
                                ].map((q) => (
                                    <button
                                        key={q}
                                        onClick={() => handleSuggestion(q)}
                                        className="rounded-full border border-white/[0.06] bg-white/[0.03] px-4 py-2 text-xs text-neutral-400 transition-all hover:border-indigo-500/30 hover:bg-indigo-500/[0.06] hover:text-indigo-300"
                                    >
                                        {q}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {messages.map((msg, i) => (
                                <div
                                    key={i}
                                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                                >
                                    <div
                                        className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${msg.role === 'user'
                                            ? 'bg-indigo-500/15 text-indigo-200'
                                            : 'md-response bg-white/[0.04] text-neutral-300'
                                            }`}
                                    >
                                        {msg.role === 'user' ? (
                                            <pre className="whitespace-pre-wrap font-sans">{msg.content}</pre>
                                        ) : (
                                            <div
                                                className="md-content"
                                                dangerouslySetInnerHTML={{ __html: markdownToHtml(msg.content) }}
                                            />
                                        )}
                                    </div>
                                </div>
                            ))}
                            {askAI.isPending && (
                                <div className="flex justify-start">
                                    <div className="flex items-center gap-2 rounded-2xl bg-white/[0.04] px-4 py-3 text-sm text-neutral-500">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Thinking...
                                    </div>
                                </div>
                            )}
                            <div ref={messagesEndRef} />
                        </div>
                    )}
                </div>

                {/* Input */}
                <div className="border-t border-white/[0.06] p-4">
                    <div className="flex items-center gap-3">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Ask about architecture, patterns, or code..."
                            disabled={askAI.isPending}
                            className="flex-1 rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-2.5 text-sm text-neutral-300 placeholder-neutral-600 outline-none transition-all focus:border-white/[0.12] focus:bg-white/[0.05] disabled:opacity-50"
                        />
                        <button
                            onClick={handleSend}
                            disabled={askAI.isPending || !input.trim()}
                            className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.08] text-neutral-400 transition-all hover:bg-white/[0.12] hover:text-white disabled:opacity-30"
                        >
                            {askAI.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <Send className="h-4 w-4" />
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
