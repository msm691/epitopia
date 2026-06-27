import { useEffect, useRef, useState } from "react";
import type { Action, EndVoteState, GameSettings, GameState, LobbyState, LobbyInfo } from "@polytopia/shared";
import { MAP_SIZE_PRESETS, MAP_TYPE_PRESETS, TURN_SECONDS_PRESETS } from "@polytopia/shared";
import { connect, defaultServerUrl, type GameSocket } from "./net.js";
import { GameView } from "./GameView.js";
import { MenuBackground } from "./three/MenuScene.js";
import { MapPreview } from "./MapPreview.js";
import { Chat } from "./Chat.js";
import type { ChatMessage } from "@polytopia/shared";
import { LobbyBrowser } from "./LobbyBrowser.js";

async function hashPassword(password: string): Promise<string> {
  // L'API Web Crypto (crypto.subtle) n'est disponible qu'en HTTPS ou localhost.
  // Si elle n'est pas dispo (ex: HTTP sur IP), on fait un encodage de secours simple.
  if (!window.crypto || !window.crypto.subtle) {
    return "fallback_" + btoa(encodeURIComponent(password));
  }
  const msgUint8 = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function getOrGenerateSessionId(): string {
  let sid = localStorage.getItem("epitopia_session");
  if (!sid) {
    sid = Math.random().toString(36).substring(2, 15);
    localStorage.setItem("epitopia_session", sid);
  }
  return sid;
}

export function App() {
  const socketRef = useRef<GameSocket | null>(null);
  const [serverUrl, setServerUrl] = useState(defaultServerUrl());
  const [name, setName] = useState(() => localStorage.getItem("epitopia_name") || "");

  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  
  const [lobbies, setLobbies] = useState<LobbyInfo[]>([]);
  const [inLobbyBrowser, setInLobbyBrowser] = useState(false);

  const [myId, setMyId] = useState<number | null>(null);
  const [lobby, setLobby] = useState<LobbyState | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [turnSeconds, setTurnSeconds] = useState<number | null>(null);
  const [endVote, setEndVote] = useState<EndVoteState | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);

  // Auto-reconnect if we already have a name in local storage
  useEffect(() => {
    if (name.trim()) {
      handleConnect();
    }
  }, []);

  useEffect(() => {
    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  const resetToMenu = (reason: string | null) => {
    socketRef.current?.disconnect();
    socketRef.current = null;
    setConnected(false);
    setConnecting(false);
    setInLobbyBrowser(false);
    setLobby(null);
    setMyId(null);
    setState(null);
    setTurnSeconds(null);
    setEndVote(null);
    setError(reason);
    setMessages([]);
  };

  const handleConnect = () => {
    if (socketRef.current || connecting) return;
    const finalName = name.trim() || "Joueur";
    localStorage.setItem("epitopia_name", finalName);
    setName(finalName);

    setError(null);
    setConnecting(true);
    const socket = connect(serverUrl);
    socketRef.current = socket;
    
    socket.on("assigned", (id) => setMyId(id));
    socket.on("lobby", (l) => {
      setLobby(l);
      setInLobbyBrowser(false);
    });
    socket.on("state", (s) => setState(s));
    socket.on("errorMsg", (m) => setError(m));
    socket.on("kicked", (reason) => {
      setLobby(null);
      setState(null);
      setInLobbyBrowser(true);
      setError(reason);
    });
    socket.on("turnTimer", (s) => setTurnSeconds(s));
    socket.on("endVote", (v) => setEndVote(v));
    socket.on("chatMessage", (msg) => setMessages((prev) => [...prev, msg]));
    
    socket.on("lobbiesList", (list) => {
      setLobbies(list);
      // Only show lobby browser if we aren't already in a game/lobby
      if (!lobby && !state) {
        setInLobbyBrowser(true);
      }
    });

    socket.on("joinedLobby", () => {
      setInLobbyBrowser(false);
      setError(null);
    });
    
    socket.on("lobbyUpdate", (l) => {
      setLobby(l);
      setInLobbyBrowser(false);
    });

    socket.on("connect_error", () => {
      setError(`Connexion à ${serverUrl}… (nouvelle tentative)`);
    });
    socket.on("connect", () => {
      setError(null);
      socket.emit("join", { name: finalName, sessionId: getOrGenerateSessionId() });
      setConnected(true);
      setConnecting(false);
    });
  };

  const cancelConnect = () => resetToMenu(null);

  const startGame = () => socketRef.current?.emit("start");
  const addBot = () => socketRef.current?.emit("addBot");
  const removeBot = () => socketRef.current?.emit("removeBot");
  const kick = (playerId: number) => socketRef.current?.emit("kick", playerId);
  const updateSettings = (patch: Partial<GameSettings>) => {
    if (lobby) socketRef.current?.emit("setSettings", { ...lobby.settings, ...patch });
  };
  const startEndVote = () => socketRef.current?.emit("endVoteStart");
  const castEndVote = (approve: boolean) => socketRef.current?.emit("endVoteCast", approve);

  const send = (action: Action) => {
    socketRef.current?.emit("action", action);
  };

  const newGame = () => {
    socketRef.current?.emit("reset");
  };

  const leaveLobby = () => {
    socketRef.current?.emit("leaveLobby");
    setLobby(null);
    setState(null);
    setInLobbyBrowser(true);
  };

  const isHost = myId !== null && myId === lobby?.hostId;

  // --- Phase 4 : en jeu ---
  if (state && myId !== null && lobby?.started) {
    return (
      <>
        <GameView
          state={state}
          myId={myId}
          send={send}
          isHost={isHost}
          onNewGame={newGame}
          onLeaveGame={leaveLobby}
          turnSeconds={turnSeconds}
          endVote={endVote}
          onEndVoteStart={startEndVote}
          onEndVoteCast={castEndVote}
        />
        <Chat
          messages={messages}
          state={state}
          onSend={(text) => socketRef.current?.emit("sendChat", text)}
        />
      </>
    );
  }

  // --- Phase 3 : lobby (salle d'attente) ---
  if (connected && lobby) {
    const total = lobby.players.length;
    const hasBot = lobby.players.some((p) => p.isAI);
    const full = total >= lobby.maxPlayers;
    return (
      <>
        <MenuBackground />
        <div className="app">
          <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", maxWidth: "min(90vw, 1000px)", margin: "0 auto"}}>
            <h1>{lobby.name}</h1>
            <button className="secondary" onClick={leaveLobby}>Quitter le salon</button>
          </div>
          {error && <p className="error">{error}</p>}
        <div className="lobby-layout">
        <div className="panel">
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
        {/* Réglages de la partie */}
        <div className="settings">
          <h2>⚙️ Réglages</h2>
          <div className="setting">
            <span className="setting-label">🏁 Limite de tours</span>
            <div className="setting-ctrl">
              <div className="seg">
                <button
                  className={`seg-btn${lobby.settings.turnLimit !== null ? " active" : ""}`}
                  disabled={!isHost}
                  onClick={() => updateSettings({ turnLimit: 30 })}
                >
                  Limité
                </button>
                <button
                  className={`seg-btn${lobby.settings.turnLimit === null ? " active" : ""}`}
                  disabled={!isHost}
                  onClick={() => updateSettings({ turnLimit: null })}
                >
                  Illimité
                </button>
              </div>
              {lobby.settings.turnLimit !== null && (
                <div className="stepper">
                  <button
                    disabled={!isHost}
                    onClick={() =>
                      updateSettings({ turnLimit: Math.max(5, (lobby.settings.turnLimit ?? 30) - 5) })
                    }
                  >
                    −
                  </button>
                  <span>{lobby.settings.turnLimit} tours</span>
                  <button
                    disabled={!isHost}
                    onClick={() =>
                      updateSettings({ turnLimit: (lobby.settings.turnLimit ?? 30) + 5 })
                    }
                  >
                    +
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="setting">
            <span className="setting-label">⏱️ Temps par tour</span>
            <div className="seg wrap">
              {TURN_SECONDS_PRESETS.map((p) => (
                <button
                  key={p.label}
                  className={`seg-btn${lobby.settings.turnSeconds === p.value ? " active" : ""}`}
                  disabled={!isHost}
                  onClick={() => updateSettings({ turnSeconds: p.value })}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div className="setting">
            <span className="setting-label">🗺️ Taille de carte</span>
            <div className="seg wrap">
              {MAP_SIZE_PRESETS.map((p) => (
                <button
                  key={p.label}
                  className={`seg-btn${lobby.settings.mapSize === p.value ? " active" : ""}`}
                  disabled={!isHost}
                  onClick={() => updateSettings({ mapSize: p.value })}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        
        {/* Helper function for the toggles */}
        {(() => {
          const Toggle = ({ checked, onChange }: { checked: boolean, onChange: (c: boolean) => void }) => {
            const topColor = checked ? "#4CAF50" : "#F44336";
            const botColor = checked ? "#388E3C" : "#D32F2F";
            const lipColor = checked ? "#2E7D32" : "#B71C1C";
            return (
              <button
                disabled={!isHost}
                onClick={() => onChange(!checked)}
                style={{
                  "--btn-top": topColor,
                  "--btn-bot": botColor,
                  "--btn-lip": lipColor,
                  "--btn-fg": "white",
                  padding: "0.25rem 0.75rem",
                  cursor: !isHost ? "not-allowed" : "pointer",
                  opacity: !isHost ? 0.6 : 1,
                  width: "70px",
                  fontWeight: "bold",
                } as React.CSSProperties}
              >
                {checked ? "OUI" : "NON"}
              </button>
            );
          };
          
          return (
            <div className="settings-grid" style={{ marginTop: "1rem" }}>
              <div className="setting" style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <span className="setting-label">⛈️ Météo Dynamique</span>
                <Toggle checked={!!lobby.settings.weatherEnabled} onChange={(v) => updateSettings({ weatherEnabled: v })} />
              </div>
              <div className="setting" style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <span className="setting-label">🐉 Boss Mythologiques</span>
                <Toggle checked={!!lobby.settings.bossesEnabled} onChange={(v) => updateSettings({ bossesEnabled: v })} />
              </div>
              <div className="setting" style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <span className="setting-label">🗡️ Mode RPG (Héros)</span>
                <Toggle checked={!!lobby.settings.rpgModeEnabled} onChange={(v) => updateSettings({ rpgModeEnabled: v })} />
              </div>
              <div className="setting" style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <span className="setting-label">🏛️ Merveilles Exclusives</span>
                <Toggle checked={!!lobby.settings.wondersEnabled} onChange={(v) => updateSettings({ wondersEnabled: v })} />
              </div>
              <div className="setting" style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <span className="setting-label">⚓ Batailles Navales (Galions)</span>
                <Toggle checked={!!lobby.settings.navalCombatEnabled} onChange={(v) => updateSettings({ navalCombatEnabled: v })} />
              </div>
            </div>
          );
        })()}

        {isHost ? (
          <div className="actions">
            <button onClick={addBot} disabled={full}>
              + IA
            </button>
            <button onClick={removeBot} disabled={!hasBot}>
              − IA
            </button>
            <button onClick={startGame} disabled={total < 2}>
              Lancer la partie
            </button>
            {total < 2 && <span className="hint">Ajoutez une IA ou un 2ᵉ joueur…</span>}
          </div>
        ) : (
          <p className="hint">En attente du lancement par l'hôte…</p>
        )}
        </div>

        <div className="map-rail">
          {MAP_TYPE_PRESETS.map((p) => (
            <button
              key={p.value}
              className={`map-card${lobby.settings.mapType === p.value ? " active" : ""}`}
              disabled={!isHost}
              onClick={() => updateSettings({ mapType: p.value })}
            >
              <MapPreview type={p.value} />
              <span className="map-card-label">{p.label}</span>
            </button>
          ))}
        </div>
        </div>
        </div>
      </>
    );
  }

  // --- Phase 2 : Lobby Browser ---
  if (connected && inLobbyBrowser) {
    return (
      <>
        <MenuBackground />
        <div className="app">
          {error && <p className="error" style={{marginBottom: "1rem"}}>{error}</p>}
          <LobbyBrowser 
            lobbies={lobbies} 
            onBack={() => resetToMenu(null)}
            onCreateLobby={async (name, password) => {
              const hash = password ? await hashPassword(password) : undefined;
              socketRef.current?.emit("createLobby", {name, password: hash});
            }}
            onJoinLobby={async (lobbyId, password) => {
              const hash = password ? await hashPassword(password) : undefined;
              socketRef.current?.emit("joinLobby", {lobbyId, password: hash});
            }}
          />
        </div>
      </>
    );
  }

  // --- Phase 1 : menu de connexion ---
  return (
    <>
      <MenuBackground />
      <div className="app">
        <h1>Epitopia</h1>
      {error && <p className="error">{error}</p>}
      <div className="menu">
        <label>
          Nom
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Votre nom" />
        </label>
        {connecting ? (
          <div className="actions">
            <button disabled>Connexion…</button>
            <button onClick={cancelConnect}>Annuler</button>
          </div>
        ) : (
          <button onClick={handleConnect}>Jouer en ligne</button>
        )}
      </div>
      </div>
    </>
  );
}
