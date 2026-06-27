import { Howl, Howler } from 'howler';

// --- Musique de fond (vraie musique fournie par l'utilisateur) ---
const bgm = new Howl({ 
  src: ['/ma-musique.mp3'],
  volume: 0.3, 
  loop: true 
});

// --- Effets sonores de jeu (générés par code pour éviter de chercher d'autres fichiers) ---
const getAudioContext = () => {
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) return null;
  return new AudioContextClass();
};

let audioCtx: AudioContext | null = null;
const playTone = (freq: number, type: OscillatorType, duration: number, vol = 0.1) => {
  if (!audioCtx) audioCtx = getAudioContext();
  if (!audioCtx) return;
  if (audioCtx.state === 'suspended') audioCtx.resume();

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

  gain.gain.setValueAtTime(vol, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);

  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + duration);
};

export const AudioManger = {
  playAttack: () => {
    // Son grave et sec (type bruit blanc / onde carrée courte)
    playTone(150, 'square', 0.15, 0.2);
    setTimeout(() => playTone(100, 'sawtooth', 0.2, 0.2), 50);
  },
  playCapture: () => {
    // Son joyeux / fanfare rapide
    playTone(440, 'sine', 0.1, 0.2);
    setTimeout(() => playTone(554, 'sine', 0.1, 0.2), 100);
    setTimeout(() => playTone(659, 'sine', 0.3, 0.2), 200);
  },
  playMove: () => {
    // Petit clic / pas
    playTone(300, 'triangle', 0.05, 0.1);
  },
  playBgm: () => {
    // On lance la vraie musique Howler
    if (!bgm.playing()) {
      bgm.play();
    }
  },
  stopBgm: () => {
    // On stoppe la vraie musique Howler
    bgm.stop();
  },
  setMute: (muted: boolean) => {
    Howler.mute(muted);
    // Pour SFX
    if (audioCtx) {
      if (muted) {
        audioCtx.suspend();
      } else {
        audioCtx.resume();
      }
    }
  }
};
