import { useEffect, useRef, useState } from "react";
import type { Action, EndVoteState, GameSettings, GameState, LobbyState } from "@polytopia/shared";
import { MAP_SIZE_PRESETS, MAP_TYPE_PRESETS, TURN_SECONDS_PRESETS } from "@polytopia/shared";
import { connect, defaultServerUrl, type GameSocket } from "./net.js";
import { GameView } from "./GameView.js";
import { MenuBackground } from "./three/MenuScene.js";
import { MapPreview } from "./MapPreview.js";

export function App() {
  const socketRef = useRef<GameSocket | null>(null);
  const [serverUrl, setServerUrl] = useState(defaultServerUrl());
  const [name, setName] = useState("");

  const [joined, setJoined] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [myId, setMyId] = useState<number | null>(null);
  const [lobby, setLobby] = useState<LobbyState | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Limite de temps du tour courant (secondes, null = aucune) + vote de fin.
  const [turnSeconds, setTurnSeconds] = useState<number | null>(null);
  const [endVote, setEndVote] = useState<EndVoteState | null>(null);

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
    setTurnSeconds(null);
    setEndVote(null);
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
    socket.on("turnTimer", (s) => setTurnSeconds(s));
    socket.on("endVote", (v) => setEndVote(v));
    // Non fatal : socket.io continue de réessayer ; on affiche juste un message.
    socket.on("connect_error", () => {
      setError(`Connexion à ${serverUrl}… (nouvelle tentative)`);
    });
    socket.on("connect", () => {
      setError(null);
      socket.emit("join", { name: name.trim() || "Joueur" });
      setJoined(true);
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

  const isHost = myId !== null && myId === lobby?.hostId;

  // --- Phase 3 : en jeu ---
  if (state && myId !== null && lobby?.started) {
    return (
      <GameView
        state={state}
        myId={myId}
        send={send}
        isHost={isHost}
        onNewGame={newGame}
        turnSeconds={turnSeconds}
        endVote={endVote}
        onEndVoteStart={startEndVote}
        onEndVoteCast={castEndVote}
      />
    );
  }

  // --- Phase 2 : lobby ---
  if (joined && lobby) {
    const total = lobby.players.length;
    const hasBot = lobby.players.some((p) => p.isAI);
    const full = total >= lobby.maxPlayers;
    return (
      <>
        <MenuBackground />
        <div className="app">
          <h1>Lobby</h1>
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
        {/* Réglages de la partie (l'hôte édite ; les autres voient en lecture) */}
        <div className="settings">
          <h2>⚙️ Réglages</h2>

          {/* Limite de tours : segmenté Limité/Illimité + stepper −/+ */}
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

          {/* Temps par tour : pills */}
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

          {/* Taille de carte : pills */}
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

        {/* 3 encadrés SÉPARÉS à droite du panneau ; ensemble = sa hauteur */}
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

  // --- Phase 1 : menu de connexion ---
  return (
    <>
      <MenuBackground />
      <div className="app">
        <h1>Epitopia — LAN</h1>
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
        {connecting ? (
          <div className="actions">
            <button disabled>Connexion…</button>
            <button onClick={cancelConnect}>Annuler</button>
          </div>
        ) : (
          <button onClick={handleConnect}>Rejoindre</button>
        )}
      </div>
      </div>
    </>
  );
}
