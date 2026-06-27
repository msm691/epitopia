import { useState, useRef, useEffect } from "react";
import type { ChatMessage, GameState } from "@polytopia/shared";

interface ChatProps {
  messages: ChatMessage[];
  state: GameState;
  onSend: (text: string) => void;
}

export function Chat({ messages, state, onSend }: ChatProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      endRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, open]);

  if (!open) {
    return (
      <button className="fab chat-fab" onClick={() => setOpen(true)}>
        💬 Chat ({messages.length})
      </button>
    );
  }

  return (
    <div className="chat-window floating">
      <div className="chat-header">
        <h3>Historique & Chat</h3>
        <button className="close-btn" onClick={() => setOpen(false)}>✕</button>
      </div>
      <div className="chat-messages">
        {messages.map((m) => {
          const isSys = m.senderId === undefined;
          const sender = !isSys ? state.players[m.senderId!] : null;
          return (
            <div key={m.id} className={`chat-msg ${isSys ? "sys-msg" : ""}`}>
              <span className="time">
                {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
              {!isSys && sender && (
                <strong style={{ color: sender.color }}>{sender.civName}: </strong>
              )}
              {isSys && <strong>🤖 Système: </strong>}
              <span>{m.text}</span>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          if (input.trim()) {
            onSend(input.trim());
            setInput("");
          }
        }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Écrire un message..."
        />
        <button type="submit">Envoyer</button>
      </form>
    </div>
  );
}
