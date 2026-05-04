import { secondsFromParts } from "../utils/time.js";

export class IntervalTimer {
  static id = "interval";
  static label = "Intervalles";

  static defaults() {
    return {
      workSeconds: 30,
      restSeconds: 90,
      series: 8,
      warmupMinutes: 0,
      warmupSeconds: 0,
      cooldownMinutes: 0,
      cooldownSeconds: 0,
      instruction: "Fort / facile",
      rpe: ""
    };
  }

  static build(config) {
    const phases = [];
    const series = Math.max(1, Math.round(Number(config.series) || 1));
    const workSeconds = Math.max(1, Math.round(Number(config.workSeconds) || 30));
    const restSeconds = Math.max(0, Math.round(Number(config.restSeconds) || 0));
    const warmupSec = secondsFromParts(config.warmupMinutes, config.warmupSeconds);
    const cooldownSec = secondsFromParts(config.cooldownMinutes, config.cooldownSeconds);

    if (warmupSec > 0) {
      phases.push({
        label: "Échauffement",
        type: "warmup",
        durationSec: warmupSec,
        instruction: "Monter progressivement"
      });
    }

    for (let seriesIndex = 1; seriesIndex <= series; seriesIndex += 1) {
      phases.push({
        label: "Effort",
        type: "effort",
        durationSec: workSeconds,
        instruction: config.instruction || "Effort",
        rpe: config.rpe || "",
        series: seriesIndex,
        totalSeries: series
      });

      if (restSeconds > 0) {
        phases.push({
          label: "Repos",
          type: "rest",
          durationSec: restSeconds,
          instruction: "Récupération",
          series: seriesIndex,
          totalSeries: series,
          isRest: true
        });
      }
    }

    if (cooldownSec > 0) {
      phases.push({
        label: "Retour au calme",
        type: "cooldown",
        durationSec: cooldownSec,
        instruction: "Respiration basse",
        isRecovery: true
      });
    }

    return phases;
  }

  static describe(config) {
    return `${config.workSeconds || 30}/${config.restSeconds || 0} × ${config.series || 1}`;
  }
}
