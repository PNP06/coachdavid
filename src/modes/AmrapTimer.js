import { secondsFromParts } from "../utils/time.js";

export class AmrapTimer {
  static id = "amrap";
  static label = "AMRAP";

  static defaults() {
    return {
      totalMinutes: 12,
      totalSeconds: 0,
      exercises: "10 pompes\n15 squats\n20 mountain climbers"
    };
  }

  static build(config) {
    const totalSec = secondsFromParts(config.totalMinutes, config.totalSeconds);
    if (totalSec <= 0) {
      return [];
    }

    return [
      {
        label: "AMRAP",
        type: "amrap",
        durationSec: totalSec,
        instruction: config.exercises || "Tours libres"
      }
    ];
  }

  static describe(config) {
    return `AMRAP ${config.totalMinutes || 0} min`;
  }
}
