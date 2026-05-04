import { secondsFromParts } from "../utils/time.js";

export class EmomTimer {
  static id = "emom";
  static label = "EMOM";

  static defaults() {
    return {
      totalMinutes: 10,
      totalSeconds: 0,
      roundSeconds: 60,
      instruction: "8 pompes + 8 squats"
    };
  }

  static build(config) {
    const totalSec = secondsFromParts(config.totalMinutes, config.totalSeconds);
    const roundSec = Math.max(1, Math.round(Number(config.roundSeconds) || 60));
    const rounds = Math.max(1, Math.ceil(totalSec / roundSec));
    const phases = [];

    for (let round = 1; round <= rounds; round += 1) {
      const remaining = totalSec - (round - 1) * roundSec;
      phases.push({
        label: `Minute ${round}`,
        type: "emom",
        durationSec: Math.min(roundSec, remaining),
        instruction: config.instruction || "",
        round,
        totalRounds: rounds
      });
    }

    return phases;
  }

  static describe(config) {
    return `EMOM ${config.totalMinutes || 0} min`;
  }
}
