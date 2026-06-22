import { useEffect, useRef, useState } from "react";
import type { Action, GameState, LobbyState } from "@polytopia/shared";
import { DEFAULT_CIV_COLORS } from "@polytopia/shared";
import { connect, defaultServerUrl, type GameSocket } from "./net.js";
import { GameView } from "./GameView.js";

export function App() {
  const socketRef = useRef<GameSocket | null>(null);
  const [serverUrl, setServerUrl] = useState(defaultServerUrl());
  const [name, setName] = useState("");
  const [color, setColor] = useState(DEFAULT_CIV_COLORS[0] ?? "#e23d3d");
  const [unlimited, setUnlimited] = useState(false);

  const [joined, setJoined] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [myId, setMyId] = useState<number | null>(null);
  const [lobby, setLobby] = useState<LobbyState | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  const resetToMenu = (reason: string | null) => {
    socketRef.current?.disconnect();
    socketRef.current = null;
    setJoined(false);
    setConnecting(false);
    setLobby(null);
    setMyId(null);
    setState(null);
    setError(reason);
  };

  const handleConnect = () => {
    // Idempotent : un seul socket, même si on appuie plusieurs fois (mobile).
    if (socketRef.current || connecting) return;
    setError(null);
    setConnecting(true);
    const socket = connect(serverUrl);
    socketRef.current = socket;
    socket.on("assigned", (id) => setMyId(id));
    socket.on("lobby", (l) => setLobby(l));
    socket.on("state", (s) => setState(s));
    socket.on("errorMsg", (m) => setError(m));
    socket.on("kicked", (reason) => resetToMenu(reason));
    // Non fatal : socket.io continue de réessayer ; on affiche juste un message.
    socket.on("connect_error", () => {
      setError(`Connexion à ${serverUrl}… (nouvelle tentative)`);
    });
    socket.on("connect", () => {
      setError(null);
      socket.emit("join", { name: name.trim() || "Joueur", color });
      setJoined(true);
      setConnecting(false);
    });
  };

  const cancelConnect = () => resetToMenu(null);

  const startGame = () => {
    socketRef.current?.emit("start", { turnLimit: unlimited ? null : undefined });
  };
  const addBot = () => socketRef.current?.emit("addBot");
  const removeBot = () => socketRef.current?.emit("removeBot");
  const kick = (playerId: number) => socketRef.current?.emit("kick", playerId);

  const send = (action: Action) => {
    socketRef.current?.emit("action", action);
  };

  const newGame = () => {
    socketRef.current?.emit("reset");
  };

  const isHost = myId !== null && myId === lobby?.hostId;

  // --- Phase 3 : en jeu ---
  if (state && myId !== null && lobby?.started) {
    return (
      <GameView state={state} myId={myId} send={send} isHost={isHost} onNewGame={newGame} />
    );
  }

  // --- Phase 2 : lobby ---
  if (joined && lobby) {
    const total = lobby.players.length;
    const hasBot = lobby.players.some((p) => p.isAI);
    const full = total >= lobby.maxPlayers;
    return (
      <div className="app">
        <h1>Lobby</h1>
        {error && <p className="error">{error}</p>}
        <ul className="players">
          {lobby.players.map((p) => (
            <li key={p.id} className={p.id === myId ? "active" : ""}>
              <span className="dot" style={{ background: p.color }} />
              {p.name}
              {p.isAI ? " (IA)" : ""}
              {p.id === lobby.hostId ? " (hôte)" : ""}
              {!p.isAI && !p.connected ? " — déconnecté" : ""}
              {isHost && p.id !== lobby.hostId && (
                <button
                  className="close-btn kick"
                  title="Exclure ce joueur"
                  onClick={() => kick(p.id)}
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
        {isHost ? (
          <div className="actions">
            <button onClick={addBot} disabled={full}>
              + IA
            </button>
            <button onClick={removeBot} disabled={!hasBot}>
              − IA
            </button>
            <label className="unlimited">
              <input
                type="checkbox"
                checked={unlimited}
                onChange={(e) => setUnlimited(e.target.checked)}
              />
              Partie illimitée
            </label>
            <button onClick={startGame} disabled={total < 2}>
              Lancer la partie
            </button>
            {total < 2 && <span className="hint">Ajoutez une IA ou un 2ᵉ joueur…</span>}
          </div>
        ) : (
          <p className="hint">En attente du lancement par l'hôte…</p>
        )}
      </div>
    );
  }

  // --- Phase 1 : menu de connexion ---
  return (
    <div className="app">
      <h1>Polytopia Clone — LAN</h1>
      {error && <p className="error">{error}</p>}
      <div className="menu">
        <label>
          Serveur
          <input value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} />
        </label>
        <label>
          Nom
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Votre nom" />
        </label>
        <div className="swatches">
          {DEFAULT_CIV_COLORS.map((c) => (
            <button
              key={c}
              className={`swatch${c === color ? " selected" : ""}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
              aria-label={`Couleur ${c}`}
            />
          ))}
        </div>
        {connecting ? (
          <div className="actions">
            <button disabled>Connexion…</button>
            <button onClick={cancelConnect}>Annuler</button>
          </div>
        ) : (
          <button onClick={handleConnect}>Rejoindre</button>
        )}
      </div>
      <p className="hint">
        L'hôte lance le serveur (<code>npm run dev:server</code>) et partage son IP locale.
      </p>
    </div>
  );
}
