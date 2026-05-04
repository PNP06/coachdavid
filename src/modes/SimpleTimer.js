import { secondsFromParts } from "../utils/time.js";

export class SimpleTimer {
  static id = "simple";
  static label = "Timer simple";

  static defaults() {
    return {
      name: "Cardio facile",
      minutes: 20,
      seconds: 0,
      rpe: ""
    };
  }

  static build(config) {
    const durationSec = secondsFromParts(config.minutes, config.seconds);
    if (durationSec <= 0) {
      return [];
    }

    return [
      {
        label: config.name?.trim() || "Timer simple",
        type: "work",
        durationSec,
        instruction: config.name?.trim() || "",
        rpe: config.rpe || ""
      }
    ];
  }

  static describe(config) {
    return config.name?.trim() || "Timer simple";
  }
}
