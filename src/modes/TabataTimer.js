import { IntervalTimer } from "./IntervalTimer.js";

export class TabataTimer {
  static id = "tabata";
  static label = "Tabata";

  static defaults() {
    return {
      workSeconds: 20,
      restSeconds: 10,
      series: 8,
      warmupMinutes: 0,
      warmupSeconds: 0,
      cooldownMinutes: 0,
      cooldownSeconds: 0,
      instruction: "Très intense",
      rpe: "9"
    };
  }

  static build(config) {
    return IntervalTimer.build({
      ...config,
      instruction: config.instruction || "Très intense",
      rpe: config.rpe || "9"
    });
  }

  static describe(config) {
    return `Tabata ${config.workSeconds || 20}/${config.restSeconds || 10} × ${config.series || 8}`;
  }
}
