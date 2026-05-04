const STORAGE_KEYS = {
  custom: "coachDavid.timer.customPresets",
  last: "coachDavid.timer.lastTimer",
  recent: "coachDavid.timer.recentSettings",
  interrupted: "coachDavid.timer.interrupted"
};

export class PresetManager {
  constructor() {
    this.defaults = [
      {
        id: "cardio-20",
        label: "20 min cardio facile",
        mode: "simple",
        config: { name: "Cardio facile", minutes: 20, seconds: 0, rpe: "4" }
      },
      {
        id: "bike-hiit-30-90",
        label: "30/90 × 8 vélo HIIT",
        mode: "interval",
        config: { workSeconds: 30, restSeconds: 90, series: 8, warmupMinutes: 5, warmupSeconds: 0, cooldownMinutes: 3, cooldownSeconds: 0, instruction: "Vélo fort / facile", rpe: "8" }
      },
      {
        id: "conditioning-40-20",
        label: "40/20 × 10 conditioning",
        mode: "interval",
        config: { workSeconds: 40, restSeconds: 20, series: 10, warmupMinutes: 0, warmupSeconds: 0, cooldownMinutes: 0, cooldownSeconds: 0, instruction: "Conditioning", rpe: "8" }
      },
      {
        id: "circuit-45-15",
        label: "45/15 × 12 circuit",
        mode: "circuit",
        config: {
          rounds: 12,
          blocks: [
            { name: "Travail", type: "time", durationSec: 45, reps: "", instruction: "Bloc circuit", rpe: "7" },
            { name: "Repos", type: "rest", durationSec: 15, reps: "", instruction: "Changer de poste", rpe: "" }
          ]
        }
      },
      {
        id: "rest-90",
        label: "90 s repos muscu",
        mode: "quickRest",
        config: { durationSec: 90 }
      },
      {
        id: "rest-180",
        label: "3 min repos lourd",
        mode: "quickRest",
        config: { durationSec: 180 }
      },
      {
        id: "swim-20",
        label: "20 min natation",
        mode: "simple",
        config: { name: "Natation", minutes: 20, seconds: 0, rpe: "5" }
      },
      {
        id: "mobility-10",
        label: "10 min mobilité",
        mode: "simple",
        config: { name: "Mobilité", minutes: 10, seconds: 0, rpe: "3" }
      }
    ];
  }

  all() {
    return [...this.defaults, ...this.custom()];
  }

  custom() {
    return readJson(STORAGE_KEYS.custom, []);
  }

  find(id) {
    return this.all().find((preset) => preset.id === id) ?? null;
  }

  saveCustom(label, mode, config) {
    const presets = this.custom();
    presets.unshift({
      id: `custom-${Date.now()}`,
      label,
      mode,
      config
    });
    localStorage.setItem(STORAGE_KEYS.custom, JSON.stringify(presets.slice(0, 24)));
  }

  saveLast(mode, config) {
    localStorage.setItem(STORAGE_KEYS.last, JSON.stringify({ mode, config, savedAt: Date.now() }));
    const recent = readJson(STORAGE_KEYS.recent, {});
    recent[mode] = config;
    localStorage.setItem(STORAGE_KEYS.recent, JSON.stringify(recent));
  }

  last() {
    return readJson(STORAGE_KEYS.last, null);
  }

  recent(mode) {
    return readJson(STORAGE_KEYS.recent, {})[mode] ?? null;
  }

  saveInterrupted(payload) {
    localStorage.setItem(STORAGE_KEYS.interrupted, JSON.stringify({ ...payload, savedAt: Date.now() }));
  }

  interrupted() {
    return readJson(STORAGE_KEYS.interrupted, null);
  }

  clearInterrupted() {
    localStorage.removeItem(STORAGE_KEYS.interrupted);
  }
}

function readJson(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}
