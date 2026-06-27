import { useState } from "react";
import type { LobbyInfo } from "@polytopia/shared";

interface LobbyBrowserProps {
  lobbies: LobbyInfo[];
  onCreateLobby: (name: string, password?: string) => void;
  onJoinLobby: (id: string, password?: string) => void;
  onBack: () => void;
}

export function LobbyBrowser({ lobbies, onCreateLobby, onJoinLobby, onBack }: LobbyBrowserProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [newRoomPass, setNewRoomPass] = useState("");
  
  const [joinRoomId, setJoinRoomId] = useState<string | null>(null);
  const [joinRoomPass, setJoinRoomPass] = useState("");

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    onCreateLobby(newRoomName.trim(), newRoomPass.trim() || undefined);
    setShowCreate(false);
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (joinRoomId) {
      onJoinLobby(joinRoomId, joinRoomPass.trim() || undefined);
      setJoinRoomId(null);
      setJoinRoomPass("");
    }
  };

  return (
    <div className="lobby-browser">
      <div className="browser-header">
        <button className="icon-btn" onClick={onBack}>⬅️ Retour</button>
        <h2>Navigateur de Lobbys</h2>
        <button className="primary" onClick={() => setShowCreate(true)}>+ Créer un Lobby</button>
      </div>

      <div className="lobbies-list">
        {lobbies.length === 0 ? (
          <p className="empty-msg">Aucun lobby public disponible. Créez-en un !</p>
        ) : (
          lobbies.map((lobby) => (
            <div key={lobby.id} className="lobby-card">
              <div className="lobby-info">
                <h3>{lobby.name} {lobby.hasPassword && "🔒"}</h3>
                <span className="lobby-status">
                  {lobby.started ? "En jeu" : "En attente"} — {lobby.currentPlayers}/{lobby.maxPlayers} joueurs
                </span>
              </div>
              <button 
                className="secondary" 
                onClick={() => {
                  if (lobby.hasPassword) {
                    setJoinRoomId(lobby.id);
                  } else {
                    onJoinLobby(lobby.id);
                  }
                }}
                disabled={lobby.started || lobby.currentPlayers >= lobby.maxPlayers}
              >
                Rejoindre
              </button>
            </div>
          ))
        )}
      </div>

      {showCreate && (
        <div className="modal-backdrop" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Créer un Lobby</h2>
              <button className="close-btn" onClick={() => setShowCreate(false)}>✕</button>
            </div>
            <form onSubmit={handleCreate} className="lobby-form">
              <label>Nom du salon :</label>
              <input 
                autoFocus
                type="text" 
                value={newRoomName} 
                onChange={e => setNewRoomName(e.target.value)} 
                placeholder="Ex: Partie de John" 
                maxLength={30}
              />
              
              <label>Mot de passe (optionnel) :</label>
              <input 
                type="password" 
                value={newRoomPass} 
                onChange={e => setNewRoomPass(e.target.value)} 
                placeholder="Laissez vide pour public" 
              />
              
              <button type="submit" className="primary" style={{marginTop: "1rem"}}>Créer</button>
            </form>
          </div>
        </div>
      )}

      {joinRoomId && (
        <div className="modal-backdrop" onClick={() => setJoinRoomId(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Lobby Privé</h2>
              <button className="close-btn" onClick={() => setJoinRoomId(null)}>✕</button>
            </div>
            <form onSubmit={handleJoin} className="lobby-form">
              <label>Mot de passe requis :</label>
              <input 
                autoFocus
                type="password" 
                value={joinRoomPass} 
                onChange={e => setJoinRoomPass(e.target.value)} 
              />
              <button type="submit" className="primary" style={{marginTop: "1rem"}}>Rejoindre</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
