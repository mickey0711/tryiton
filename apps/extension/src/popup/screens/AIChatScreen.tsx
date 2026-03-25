import React, { useState, useRef, useEffect } from "react";

const API_BASE = "https://tryiton-app-f32z6.ondigitalocean.app";

interface Message {
    role: "user" | "assistant";
    content: string;
}

interface Props {
    category: string;
    fitScore: number | null;
    onBack: () => void;
}

export function AIChatScreen({ category, fitScore, onBack }: Props) {
    const [messages, setMessages] = useState<Message[]>([
        {
            role: "assistant",
            content: `Hi! 👋 I'm your AI stylist. How does this ${category} feel? Happy with the fit? I can give you sizing tips, styling ideas, or tell you what to pair it with! ✨`,
        },
    ]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const bottomRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    useEffect(() => {
        setTimeout(() => inputRef.current?.focus(), 100);
    }, []);

    const sendMessage = async () => {
        const text = input.trim();
        if (!text || loading) return;

        const newMessages: Message[] = [...messages, { role: "user", content: text }];
        setMessages(newMessages);
        setInput("");
        setLoading(true);

        try {
            const res = await fetch(`${API_BASE}/chat/fit-advisor`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    messages: newMessages,
                    category,
                    fitScore,
                }),
            });
            const data = await res.json();
            setMessages([...newMessages, { role: "assistant", content: data.message }]);
        } catch {
            setMessages([...newMessages, { role: "assistant", content: "Sorry, I had trouble connecting. Try again? 😊" }]);
        } finally {
            setLoading(false);
        }
    };

    const handleKey = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    // Quick reply chips
    const QUICK_REPLIES = ["Does it fit well?", "What size should I get?", "What to pair it with?", "Is it worth buying?"];

    return (
        <div className="screen" style={{ display: "flex", flexDirection: "column", height: "100%", padding: 0 }}>
            {/* Header */}
            <div className="header" style={{ padding: "10px 14px", borderBottom: "1px solid rgba(99,102,241,0.2)", flexShrink: 0 }}>
                <button className="btn btn-ghost" style={{ padding: "4px 8px", fontSize: 13 }} onClick={onBack}>← Back</button>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
                    <span style={{ fontSize: 18 }}>✨</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#a5b4fc" }}>AI Stylist</span>
                    {fitScore != null && (
                        <span style={{ fontSize: 11, background: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.4)", borderRadius: 10, padding: "2px 8px", color: "#c4b5fd" }}>
                            Fit {fitScore}%
                        </span>
                    )}
                </div>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
                {messages.map((msg, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
                        <div style={{
                            maxWidth: "80%",
                            padding: "8px 12px",
                            borderRadius: msg.role === "user" ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                            background: msg.role === "user"
                                ? "linear-gradient(135deg, #6366f1, #8b5cf6)"
                                : "rgba(30,30,50,0.8)",
                            border: msg.role === "assistant" ? "1px solid rgba(99,102,241,0.25)" : "none",
                            fontSize: 12.5,
                            lineHeight: "1.5",
                            color: msg.role === "user" ? "#fff" : "#e2e8f0",
                        }}>
                            {msg.content}
                        </div>
                    </div>
                ))}
                {loading && (
                    <div style={{ display: "flex", justifyContent: "flex-start" }}>
                        <div style={{
                            padding: "8px 14px",
                            borderRadius: "12px 12px 12px 2px",
                            background: "rgba(30,30,50,0.8)",
                            border: "1px solid rgba(99,102,241,0.25)",
                            fontSize: 18,
                            letterSpacing: 2,
                        }}>
                            <span style={{ animation: "pulse 1s infinite" }}>●●●</span>
                        </div>
                    </div>
                )}
                <div ref={bottomRef} />
            </div>

            {/* Quick replies */}
            {messages.length <= 2 && (
                <div style={{ padding: "0 14px 8px", display: "flex", gap: 6, flexWrap: "wrap", flexShrink: 0 }}>
                    {QUICK_REPLIES.map((q) => (
                        <button
                            key={q}
                            onClick={() => { setInput(q); setTimeout(() => sendMessage(), 50); }}
                            style={{
                                fontSize: 11,
                                padding: "4px 10px",
                                background: "rgba(99,102,241,0.1)",
                                border: "1px solid rgba(99,102,241,0.3)",
                                borderRadius: 20,
                                color: "#a5b4fc",
                                cursor: "pointer",
                                whiteSpace: "nowrap",
                            }}
                        >
                            {q}
                        </button>
                    ))}
                </div>
            )}

            {/* Input */}
            <div style={{ padding: "8px 14px 12px", borderTop: "1px solid rgba(99,102,241,0.15)", display: "flex", gap: 8, flexShrink: 0 }}>
                <input
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKey}
                    placeholder="Ask your AI stylist..."
                    disabled={loading}
                    style={{
                        flex: 1,
                        background: "rgba(15,15,30,0.8)",
                        border: "1px solid rgba(99,102,241,0.35)",
                        borderRadius: 10,
                        padding: "8px 12px",
                        fontSize: 13,
                        color: "#e2e8f0",
                        outline: "none",
                    }}
                />
                <button
                    onClick={sendMessage}
                    disabled={!input.trim() || loading}
                    style={{
                        width: 36,
                        height: 36,
                        borderRadius: 10,
                        background: input.trim() && !loading ? "linear-gradient(135deg, #6366f1, #8b5cf6)" : "rgba(99,102,241,0.2)",
                        border: "none",
                        color: "#fff",
                        fontSize: 16,
                        cursor: input.trim() && !loading ? "pointer" : "default",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        transition: "all 0.2s",
                    }}
                >
                    ➤
                </button>
            </div>
        </div>
    );
}
