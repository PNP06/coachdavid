export class SoundManager {
  constructor() {
    this.audioContext = null;
    this.unlocked = false;
    this.muted = loadBoolean("coachDavid.timer.muted", false);
    this.volume = loadNumber("coachDavid.timer.volume", 0.75);
    this.vibrationEnabled = loadBoolean("coachDavid.timer.vibration", true);
    this.lastError = "";
  }

  async unlock() {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) {
        this.lastError = "Audio non supporté";
        return false;
      }

      this.audioContext ??= new AudioContextClass();
      if (this.audioContext.state === "suspended") {
        await this.audioContext.resume();
      }

      this.unlocked = this.audioContext.state === "running";
      this.lastError = this.unlocked ? "" : "Clique pour activer l'audio";
      return this.unlocked;
    } catch (error) {
      this.lastError = "Audio bloqué par le navigateur";
      return false;
    }
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    localStorage.setItem("coachDavid.timer.muted", String(this.muted));
  }

  setVolume(volume) {
    this.volume = Math.min(1, Math.max(0, Number(volume) || 0));
    localStorage.setItem("coachDavid.timer.volume", String(this.volume));
  }

  setVibration(enabled) {
    this.vibrationEnabled = Boolean(enabled);
    localStorage.setItem("coachDavid.timer.vibration", String(this.vibrationEnabled));
  }

  async test() {
    await this.unlock();
    this.playCountdown();
    window.setTimeout(() => this.playRestEnd(), 260);
    window.setTimeout(() => this.playFinish(), 720);
  }

  playPhaseChange() {
    this._tone({ frequency: 880, duration: 0.12, type: "square", gain: 0.9 });
    this._vibrate(45);
  }

  playRestEnd() {
    this._tone({ frequency: 330, duration: 0.42, type: "sawtooth", gain: 1 });
    this._vibrate([100, 50, 100]);
  }

  playCountdown() {
    this._tone({ frequency: 1040, duration: 0.09, type: "square", gain: 0.75 });
    this._vibrate(35);
  }

  playFinish() {
    [0, 180, 360].forEach((delay) => {
      window.setTimeout(() => {
        this._tone({ frequency: 720, duration: 0.18, type: "triangle", gain: 0.95 });
      }, delay);
    });
    this._vibrate([120, 80, 120, 80, 160]);
  }

  statusLabel() {
    if (this.muted) {
      return "Silence";
    }

    if (this.unlocked) {
      return "Audio prêt";
    }

    return this.lastError || "Audio à activer";
  }

  _tone({ frequency, duration, type, gain }) {
    if (this.muted || !this.unlocked || !this.audioContext) {
      return;
    }

    const startAt = this.audioContext.currentTime;
    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, startAt);
    gainNode.gain.setValueAtTime(0.0001, startAt);
    gainNode.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain * this.volume), startAt + 0.015);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);
    oscillator.start(startAt);
    oscillator.stop(startAt + duration + 0.03);
  }

  _vibrate(pattern) {
    if (!this.vibrationEnabled || this.muted || !("vibrate" in navigator)) {
      return;
    }

    navigator.vibrate(pattern);
  }
}

function loadBoolean(key, fallback) {
  const value = localStorage.getItem(key);
  return value === null ? fallback : value === "true";
}

function loadNumber(key, fallback) {
  const value = Number(localStorage.getItem(key));
  return Number.isFinite(value) ? value : fallback;
}
