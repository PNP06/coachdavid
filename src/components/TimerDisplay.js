import { escapeHtml, formatDuration } from "../utils/time.js";

export class TimerDisplay {
  constructor() {
    this.container = null;
    this.elements = {};
  }

  mount(container) {
    this.container = container;
    this.container.innerHTML = `
      <section class="timer-display" data-timer-display>
        <div class="timer-topline">
          <span class="status-pill" data-display-status>Prêt</span>
          <span class="status-pill muted" data-display-position>Bloc 0/0</span>
        </div>
        <div class="phase-name" data-display-phase>Minuteur libre</div>
        <div class="timer-time" data-display-time>00:00</div>
        <div class="timer-subgrid">
          <div>
            <span>Total restant</span>
            <strong data-display-total>00:00</strong>
          </div>
          <div>
            <span>Série / tour</span>
            <strong data-display-series>-</strong>
          </div>
          <div>
            <span>Prochain</span>
            <strong data-display-next>-</strong>
          </div>
        </div>
        <div class="progress-track" aria-label="Progression globale">
          <span data-display-progress></span>
        </div>
        <div class="timer-instruction" data-display-instruction></div>
        <div class="amrap-counter" data-amrap-counter hidden>
          <span>Tours réalisés</span>
          <strong data-amrap-rounds>0</strong>
          <button type="button" data-action="amrap-minus" aria-label="Retirer un tour">-1</button>
          <button type="button" data-action="amrap-plus" aria-label="Ajouter un tour">+1 tour</button>
        </div>
        <button class="manual-complete" type="button" data-action="manual-complete" hidden>Terminé</button>
        <div class="timer-controls primary-controls">
          <button type="button" data-action="start-current" data-display-start>Démarrer</button>
          <button type="button" data-action="toggle-pause">Pause</button>
          <button type="button" data-action="previous-phase">Précédent</button>
          <button type="button" data-action="next-phase">Suivant</button>
          <button type="button" data-action="finish-timer">Terminer</button>
        </div>
        <div class="timer-controls secondary-controls">
          <button type="button" data-action="add-time" data-seconds="-10">-10 s</button>
          <button type="button" data-action="add-time" data-seconds="10">+10 s</button>
          <button type="button" data-action="reset-timer">Reset</button>
          <button type="button" data-action="fullscreen-toggle">Plein écran</button>
        </div>
      </section>
    `;
    this.elements = {
      status: this.container.querySelector("[data-display-status]"),
      position: this.container.querySelector("[data-display-position]"),
      phase: this.container.querySelector("[data-display-phase]"),
      time: this.container.querySelector("[data-display-time]"),
      total: this.container.querySelector("[data-display-total]"),
      series: this.container.querySelector("[data-display-series]"),
      next: this.container.querySelector("[data-display-next]"),
      progress: this.container.querySelector("[data-display-progress]"),
      instruction: this.container.querySelector("[data-display-instruction]"),
      manualButton: this.container.querySelector("[data-action='manual-complete']"),
      amrapCounter: this.container.querySelector("[data-amrap-counter]"),
      amrapRounds: this.container.querySelector("[data-amrap-rounds]"),
      startButton: this.container.querySelector("[data-display-start]"),
      pauseButton: this.container.querySelector("[data-action='toggle-pause']"),
      previousButton: this.container.querySelector("[data-action='previous-phase']"),
      nextButton: this.container.querySelector("[data-action='next-phase']"),
      finishButton: this.container.querySelector("[data-action='finish-timer']"),
      resetButton: this.container.querySelector("[data-action='reset-timer']")
    };
  }

  update(snapshot, uiState = {}) {
    if (!this.container) {
      return;
    }

    const current = snapshot.current;
    const phaseLabel = current?.label ?? (snapshot.isFinished ? "Terminé" : "Minuteur libre");
    const statusLabel = statusText(snapshot.status, uiState.activeTitle);
    const instructionParts = [
      current?.instruction,
      current?.reps ? `Objectif reps : ${current.reps}` : "",
      current?.rpe ? `RPE cible : ${current.rpe}` : ""
    ].filter(Boolean);

    this.elements.status.textContent = statusLabel;
    this.elements.position.textContent = `${Math.min(snapshot.currentIndex + 1, snapshot.totalPhases)}/${snapshot.totalPhases || 0}`;
    this.elements.phase.textContent = phaseLabel;
    this.elements.time.textContent = snapshot.isManualPhase
      ? "À VALIDER"
      : formatDuration(snapshot.phaseRemainingMs ?? 0);
    this.elements.total.textContent = formatDuration(snapshot.totalRemainingMs ?? 0);
    this.elements.series.textContent = formatSeries(current);
    this.elements.next.textContent = snapshot.next?.label ?? "-";
    this.elements.progress.style.width = `${Math.round(snapshot.progress * 100)}%`;
    this.elements.instruction.innerHTML = instructionParts.length
      ? instructionParts.map((part) => `<span>${escapeHtml(part)}</span>`).join("")
      : "<span>-</span>";

    this.elements.manualButton.hidden = !snapshot.isManualPhase || snapshot.isFinished;
    this.elements.manualButton.textContent = current?.manualLabel ?? "Terminé";
    this.elements.amrapCounter.hidden = uiState.activeMode !== "amrap";
    this.elements.amrapRounds.textContent = String(uiState.amrapRounds ?? 0);
    this.elements.pauseButton.textContent = snapshot.isPaused ? "Reprise" : "Pause";
    this.elements.startButton.hidden = snapshot.isActive;

    const controlsDisabled = !snapshot.isActive;
    this.elements.pauseButton.disabled = !snapshot.isActive;
    this.elements.previousButton.disabled = controlsDisabled || snapshot.currentIndex <= 0;
    this.elements.nextButton.disabled = controlsDisabled;
    this.elements.finishButton.disabled = !snapshot.isActive;
    this.elements.resetButton.disabled = snapshot.status === "idle";
    this.container.dataset.timerState = snapshot.status;
    this.container.dataset.manual = String(snapshot.isManualPhase);
  }
}

function statusText(status, activeTitle) {
  if (status === "running") {
    return activeTitle || "En cours";
  }

  if (status === "paused") {
    return "Pause";
  }

  if (status === "finished") {
    return "Terminé";
  }

  return "Prêt";
}

function formatSeries(phase) {
  if (!phase) {
    return "-";
  }

  if (phase.series && phase.totalSeries) {
    return `Série ${phase.series}/${phase.totalSeries}`;
  }

  if (phase.round && phase.totalRounds) {
    return `Tour ${phase.round}/${phase.totalRounds}`;
  }

  return "-";
}
