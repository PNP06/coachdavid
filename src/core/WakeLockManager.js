export class WakeLockManager {
  constructor() {
    this.lock = null;
    this.supported = "wakeLock" in navigator;
    this.active = false;
    this.lastMessage = this.supported ? "Wake lock disponible" : "Wake lock non supporté";

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && this.active) {
        this.request();
      }
    });
  }

  async request() {
    this.active = true;
    if (!this.supported) {
      this.lastMessage = "Wake lock non supporté";
      return false;
    }

    try {
      this.lock = await navigator.wakeLock.request("screen");
      this.lastMessage = "Écran maintenu actif";
      this.lock.addEventListener("release", () => {
        if (this.active) {
          this.lastMessage = "Wake lock relâché";
        }
      });
      return true;
    } catch {
      this.lastMessage = "Wake lock indisponible";
      return false;
    }
  }

  async release() {
    this.active = false;
    if (this.lock) {
      await this.lock.release();
      this.lock = null;
    }
    this.lastMessage = this.supported ? "Wake lock prêt" : "Wake lock non supporté";
  }
}
