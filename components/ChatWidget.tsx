import React, { useState, useRef, useEffect } from 'react';
import { Send, MessageCircle, X, AlertCircle, RotateCcw } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

interface ChatMessage {
    id: string;
    content: string;
    role: 'user' | 'model';
    created_at: string;
}

const ChatMessageContent: React.FC<{ content: string; isUser: boolean }> = ({ content, isUser }) => {
    // Helper to render bold, italic, and inline code
    const renderInline = (text: string) => {
        // Match `inline code`, **bold**, and *italic*
        const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g);
        return parts.map((part, index) => {
            if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
                return (
                    <code
                        key={index}
                        className={`px-1 py-0.5 rounded text-[11px] font-mono ${
                            isUser ? 'bg-white/25 text-white' : 'bg-slate-200/80 text-slate-800'
                        }`}
                    >
                        {part.slice(1, -1)}
                    </code>
                );
            }
            if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
                return (
                    <strong
                        key={index}
                        className={`font-bold ${isUser ? 'text-white' : 'text-slate-900'}`}
                    >
                        {part.slice(2, -2)}
                    </strong>
                );
            }
            if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
                return (
                    <em key={index} className="italic">
                        {part.slice(1, -1)}
                    </em>
                );
            }
            return <React.Fragment key={index}>{part}</React.Fragment>;
        });
    };

    const lines = content.split('\n');

    return (
        <div className="space-y-1 text-xs leading-relaxed break-words">
            {lines.map((line, idx) => {
                const trimmed = line.trim();
                if (!trimmed) {
                    return <div key={idx} className="h-1" />;
                }

                // Subheaders (### or ##)
                if (trimmed.startsWith('### ')) {
                    return (
                        <h4
                            key={idx}
                            className={`font-bold text-xs mt-2 pt-1 border-t ${
                                isUser ? 'border-white/20 text-white' : 'border-slate-200 text-slate-900'
                            }`}
                        >
                            {renderInline(trimmed.replace(/^###\s+/, ''))}
                        </h4>
                    );
                }
                if (trimmed.startsWith('## ')) {
                    return (
                        <h3
                            key={idx}
                            className={`font-bold text-[13px] mt-2 ${
                                isUser ? 'text-white' : 'text-slate-900'
                            }`}
                        >
                            {renderInline(trimmed.replace(/^##\s+/, ''))}
                        </h3>
                    );
                }

                // Numbered list items (e.g. "1. ", "2. ")
                const numMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
                if (numMatch) {
                    return (
                        <div key={idx} className="flex items-start gap-1.5 ml-0.5 my-1">
                            <span
                                className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold shrink-0 mt-0.5 ${
                                    isUser ? 'bg-white/25 text-white' : 'bg-blue-100 text-blue-700'
                                }`}
                            >
                                {numMatch[1]}
                            </span>
                            <div className="flex-1">{renderInline(numMatch[2])}</div>
                        </div>
                    );
                }

                // Bullet list items (e.g. "- ", "* ", "• ")
                if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || trimmed.startsWith('• ')) {
                    return (
                        <div key={idx} className="flex items-start gap-1.5 ml-1 my-0.5">
                            <span
                                className={`inline-block w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                                    isUser ? 'bg-white' : 'bg-blue-600'
                                }`}
                            />
                            <div className="flex-1">{renderInline(trimmed.replace(/^[-*•]\s+/, ''))}</div>
                        </div>
                    );
                }

                // Regular paragraph line
                return <p key={idx}>{renderInline(line)}</p>;
            })}
        </div>
    );
};

const INITIAL_MESSAGE: ChatMessage = {
    id: 'init',
    content: "Assalamu'alaikum warahmatullahi wabarakatuh!\n\nAna adalah **Asisten Lajnah Quran** (Sistem Informasi Tahfidz).\n\nAda yang bisa Ana bantu terkait cara penggunaan aplikasi, alur setoran, atau manajemen data santri?",
    role: 'model',
    created_at: new Date().toISOString()
};

const ChatWidget: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
    };

    useEffect(() => {
        if (isOpen) {
            scrollToBottom();
            if (messages.length === 0) {
                setMessages([INITIAL_MESSAGE]);
            }
        }
    }, [isOpen]);

    const handleClearChat = () => {
        setMessages([INITIAL_MESSAGE]);
        setError(null);
        setNewMessage('');
    };

    const sendMessageText = async (textToSend: string) => {
        const contentToSend = textToSend.trim();
        if (!contentToSend || loading) return;

        const userMsgId = Date.now().toString();
        const newHistory: ChatMessage[] = [...messages, {
            id: userMsgId,
            content: contentToSend,
            role: 'user' as const,
            created_at: new Date().toISOString()
        }];

        setMessages(newHistory);
        setNewMessage('');
        setLoading(true);
        setError(null);
        scrollToBottom();

        try {
            const { data: sessionData } = await supabase.auth.getSession();
            const accessToken = sessionData?.session?.access_token;

            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
                },
                body: JSON.stringify({
                    message: contentToSend,
                    // Send up to the last 8 messages for context
                    history: newHistory.slice(-8)
                })
            });

            const data = await response.json().catch(() => null);

            if (!response.ok) {
                const errMsg = data?.error || `Terjadi kendala server (${response.status}: ${response.statusText})`;
                throw new Error(errMsg);
            }
            
            if (data?.error) {
                throw new Error(data.error);
            }

            setMessages(prev => [...prev, {
                id: (Date.now() + 1).toString(),
                content: data?.text || 'Afwan, tidak ada balasan dari server.',
                role: 'model',
                created_at: new Date().toISOString()
            }]);
        } catch (err: any) {
            setError(err.message || 'Terjadi kesalahan saat memproses pesan.');
            setNewMessage(contentToSend); // Restore to input on failure
        } finally {
            setLoading(false);
            scrollToBottom();
        }
    };

    const handleSendMessage = (e: React.FormEvent) => {
        e.preventDefault();
        sendMessageText(newMessage);
    };

    return (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
            {isOpen && (
                <div className="mb-4 w-80 sm:w-[410px] h-[520px] max-h-[82vh] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-10 duration-200">
                    {/* Header */}
                    <div className="bg-secondary px-4 py-3.5 flex justify-between items-center text-white shrink-0 shadow-sm">
                        <h3 className="font-bold text-sm tracking-tight">Asisten Lajnah Quran</h3>
                        <div className="flex items-center space-x-1">
                            <button
                                onClick={handleClearChat}
                                title="Mulai sesi baru (bersihkan percakapan)"
                                className="text-white/80 hover:text-white hover:bg-white/20 rounded-full p-1.5 transition-colors"
                            >
                                <RotateCcw size={15} />
                            </button>
                            <button
                                onClick={() => setIsOpen(false)}
                                title="Tutup asisten"
                                className="text-white/80 hover:text-white hover:bg-white/20 rounded-full p-1.5 transition-colors"
                            >
                                <X size={17} />
                            </button>
                        </div>
                    </div>

                    {/* Messages Body */}
                    <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5 bg-slate-50">
                        {messages.map((msg) => {
                            const isMe = msg.role === 'user';
                            return (
                                <div key={msg.id} className={`flex w-full ${isMe ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`flex max-w-[88%] flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                                        <div className={`relative px-3.5 py-2.5 rounded-2xl shadow-sm ${
                                            isMe 
                                            ? 'bg-secondary text-white rounded-tr-none' 
                                            : 'bg-white border border-slate-200 text-slate-800 rounded-tl-none'
                                        }`}>
                                            <ChatMessageContent content={msg.content} isUser={isMe} />
                                        </div>
                                    </div>
                                </div>
                            );
                        })}

                        {/* Loading Indicator */}
                        {loading && (
                            <div className="flex w-full justify-start">
                                <div className="bg-white border border-slate-200 px-3.5 py-2.5 rounded-2xl rounded-tl-none flex items-center space-x-1.5 shadow-xs">
                                    <span className="text-[11px] text-slate-400 font-medium mr-1">Sedang merumuskan jawaban...</span>
                                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce"></div>
                                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce delay-100"></div>
                                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce delay-200"></div>
                                </div>
                            </div>
                        )}

                        {/* Error Message */}
                        {error && (
                            <div className="bg-red-50 border border-red-200 rounded-xl p-2.5 flex flex-col gap-1 text-[11px] text-red-700 shadow-xs">
                                <div className="flex items-center gap-1.5 font-semibold">
                                    <AlertCircle size={14} className="shrink-0 text-red-500" />
                                    <span>Pemberitahuan Sistem</span>
                                </div>
                                <p className="leading-snug pl-5 text-red-600">{error}</p>
                            </div>
                        )}

                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input Bar */}
                    <div className="p-2.5 bg-white border-t border-slate-100 shrink-0">
                        <form onSubmit={handleSendMessage} className="flex gap-2 items-center">
                            <input
                                type="text"
                                value={newMessage}
                                onChange={(e) => setNewMessage(e.target.value)}
                                placeholder="Tanyakan seputar aplikasi Tahfidz..."
                                disabled={loading}
                                className="flex-1 bg-slate-100 border-none rounded-full px-4 py-2 text-xs focus:outline-none focus:ring-1.5 focus:ring-secondary text-slate-800 disabled:opacity-50 placeholder:text-slate-400"
                            />
                            <button 
                                type="submit" 
                                disabled={!newMessage.trim() || loading}
                                className="bg-secondary text-white p-2 rounded-full hover:bg-accent disabled:opacity-40 disabled:hover:bg-secondary transition-colors shadow-sm shrink-0"
                            >
                                <Send size={15} />
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Toggle Floating Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`relative p-3.5 sm:p-4 rounded-full shadow-lg transition-all duration-300 transform hover:scale-105 ${isOpen ? 'bg-slate-700 rotate-90' : 'bg-secondary'} text-white`}
                title="Buka Asisten Lajnah Quran"
            >
                {isOpen ? <X size={22} /> : <MessageCircle size={22} />}
            </button>
        </div>
    );
};

export default ChatWidget;
