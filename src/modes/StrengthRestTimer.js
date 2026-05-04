export class StrengthRestTimer {
  static id = "strength";
  static label = "Séries muscu";

  static defaults() {
    return {
      exercise: "Tractions / dips / pompes",
      sets: 4,
      restSeconds: 90
    };
  }

  static build(config) {
    const sets = Math.max(1, Math.round(Number(config.sets) || 1));
    const restSeconds = Math.max(1, Math.round(Number(config.restSeconds) || 90));
    const phases = [];

    for (let set = 1; set <= sets; set += 1) {
      phases.push({
        label: config.exercise?.trim() || "Série libre",
        type: "reps",
        durationSec: null,
        instruction: "Effectuer la série",
        series: set,
        totalSeries: sets,
        manualLabel: "Série terminée"
      });

      if (set < sets) {
        phases.push({
          label: "Repos muscu",
          type: "rest",
          durationSec: restSeconds,
          instruction: "Récupération",
          series: set,
          totalSeries: sets,
          isRest: true
        });
      }
    }

    return phases;
  }

  static quickRest(durationSec) {
    return [
      {
        label: "Repos muscu",
        type: "rest",
        durationSec: Math.max(1, Math.round(Number(durationSec) || 90)),
        instruction: "Reprendre au signal",
        isRest: true
      }
    ];
  }

  static describe(config) {
    return `${config.sets || 1} séries / ${config.restSeconds || 90}s`;
  }
}
