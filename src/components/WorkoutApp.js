import { HistoryManager } from "../core/HistoryManager.js";
import { PresetManager } from "../core/PresetManager.js";
import { SoundManager } from "../core/SoundManager.js";
import { TimerEngine } from "../core/TimerEngine.js";
import { WakeLockManager } from "../core/WakeLockManager.js";
import { IntervalTimer } from "../modes/IntervalTimer.js";
import { StrengthRestTimer } from "../modes/StrengthRestTimer.js";
import { escapeHtml, formatDuration } from "../utils/time.js";

const REST_PRESETS = [30, 60, 90, 120, 180];
const HIIT_PRESETS = [
  { label: "Vélo 30 / 90", work: 30, rest: 90, rounds: 8 },
  { label: "Vélo 40 / 20", work: 40, rest: 20, rounds: 10 },
  { label: "Tabata 20 / 10", work: 20, rest: 10, rounds: 8 }
];

export class WorkoutApp {
  constructor(root) {
    this.root = root;
    this.engine = new TimerEngine();
    this.sound = new SoundManager();
    this.wakeLock = new WakeLockManager();
    this.presets = new PresetManager();
    this.history = new HistoryManager();
    this.view = "home";
    this.sessionKind = null;
    this.roundTimes = [];
    this.completion = null;
    this.lastCountdownKey = "";
    this.lastInterruptedSave = 0;
    this.roundConfig = normalizeRoundConfig(this.presets.recent("strength"));
    this.hiitConfig = normalizeHiitConfig(this.presets.recent("interval"));

    this.bindEvents();
    this.bindEngine();
    this.render();
    window.setInterval(() => this.engine.tick(), 200);
  }

  bindEvents() {
    this.root.addEventListener("click", (event) => this.handleClick(event));
    this.root.addEventListener("input", (event) => this.handleInput(event));
    this.root.addEventListener("submit", (event) => event.preventDefault());
    document.addEventListener("visibilitychange", () => {
      this.engine.tick();
      this.updateSession();
    });
    window.addEventListener("beforeunload", () => this.persistInterrupted(this.engine.getSnapshot(false)));
  }

  bindEngine() {
    this.engine.on("phaseChange", ({ previous }) => {
      this.lastCountdownKey = "";
      if (previous?.isRest) {
        this.sound.playRestEnd();
      } else {
        this.sound.playPhaseChange();
      }
      this.updateSession();
    });

    this.engine.on("finish", ({ snapshot, previous }) => {
      if (previous?.isRest) {
        this.sound.playRestEnd();
        window.setTimeout(() => this.sound.playFinish(), 420);
      } else {
        this.sound.playFinish();
      }
      this.wakeLock.release();
      this.presets.clearInterrupted();
      this.completion = this.createCompletion(snapshot);
      this.render();
    });

    this.engine.on("tick", (snapshot) => {
      this.playCountdownCue(snapshot);
      this.persistInterrupted(snapshot);
      this.updateSession(snapshot);
    });
  }

  render() {
    const snapshot = this.engine.getSnapshot(false);
    const sessionVisible = snapshot.status !== "idle" && this.view !== "history";
    this.root.innerHTML = `
      <div class="app-shell">
        ${this.renderHeader(snapshot)}
        ${this.renderResumeBanner(snapshot)}
        ${this.view === "history"
          ? this.renderHistory()
          : sessionVisible
            ? this.renderSession(snapshot)
            : this.renderHome()}
      </div>
    `;
    this.updateSession(snapshot);
  }

  renderHeader(snapshot) {
    const isActive = snapshot.isActive;
    return `
      <header class="app-header">
        <button type="button" class="brand" data-action="go-home" aria-label="Retour à l'accueil">
          <span class="brand-mark" aria-hidden="true">CD</span>
          <span><strong>Coach David</strong><small>Session tracker</small></span>
        </button>
        <div class="header-actions">
          <details class="settings-menu">
            <summary class="icon-button" aria-label="Réglages">${settingsIcon()}</summary>
            <div class="settings-popover">
              <strong>Réglages</strong>
              <label class="switch"><input type="checkbox" data-audio-muted ${this.sound.muted ? "checked" : ""} /><span>Mode silencieux</span></label>
              <label class="switch"><input type="checkbox" data-vibration ${this.sound.vibrationEnabled ? "checked" : ""} /><span>Vibrations</span></label>
              <label class="volume-control"><span>Volume</span><input type="range" min="0" max="1" step="0.05" value="${this.sound.volume}" data-audio-volume /></label>
              <button type="button" data-action="audio-test">Tester le son</button>
              <small data-audio-status>${escapeHtml(this.sound.statusLabel())}</small>
            </div>
          </details>
          ${isActive
            ? `<button type="button" class="text-button danger-button" data-action="finish-session">Arrêter</button>`
            : `<button type="button" class="text-button ${this.view === "history" ? "is-active" : ""}" data-action="show-history">Historique</button>`}
        </div>
      </header>
    `;
  }

  renderResumeBanner(snapshot) {
    const interrupted = this.presets.interrupted();
    if (!interrupted || snapshot.status !== "idle" || this.view === "history") {
      return "";
    }
    return `
      <section class="resume-banner">
        <span class="live-dot"></span>
        <div><strong>Session interrompue</strong><small>${escapeHtml(interrupted.title || "Session en cours")}</small></div>
        <button type="button" data-action="resume-session">Reprendre</button>
        <button type="button" class="quiet-button" data-action="discard-session">Effacer</button>
      </section>
    `;
  }

  renderHome() {
    return `
      <main class="home-view">
        <section class="launcher" aria-labelledby="launcher-title">
          <div class="launcher-copy">
            <p class="eyebrow"><span></span> Prêt pour ta session</p>
            <h1 id="launcher-title">Chaque tour<br /><em>compte.</em></h1>
            <p class="launcher-intro">Lance ton chrono, valide chaque tour et récupère. C’est tout.</p>
            <div class="feature-note">
              ${stopwatchIcon()}
              <span><strong>Chrono automatique</strong><small>La durée de chaque tour est enregistrée.</small></span>
            </div>
          </div>

          <form class="quick-session-form" data-round-form>
            <div class="form-heading">
              <span>Session libre</span>
              <small>2 réglages</small>
            </div>
            <div class="session-field">
              <div><span class="field-index">01</span><label for="round-count">Nombre de tours</label></div>
              <div class="stepper">
                <button type="button" data-action="adjust-rounds" data-delta="-1" aria-label="Retirer un tour">−</button>
                <input id="round-count" name="sets" type="number" min="1" max="99" value="${this.roundConfig.sets}" inputmode="numeric" />
                <button type="button" data-action="adjust-rounds" data-delta="1" aria-label="Ajouter un tour">+</button>
              </div>
            </div>
            <div class="session-field rest-field">
              <div><span class="field-index">02</span><label for="rest-duration">Pause entre les tours</label></div>
              <div class="duration-input"><input id="rest-duration" name="restSeconds" type="number" min="1" max="999" value="${this.roundConfig.restSeconds}" inputmode="numeric" /><span>sec</span></div>
            </div>
            <div class="rest-presets" aria-label="Durées rapides">
              ${REST_PRESETS.map((seconds) => `<button type="button" data-action="set-rest" data-seconds="${seconds}" class="${seconds === this.roundConfig.restSeconds ? "is-active" : ""}">${shortDuration(seconds)}</button>`).join("")}
            </div>
            <div class="round-preview" data-round-preview>${renderPreviewRounds(this.roundConfig.sets)}</div>
            <button type="button" class="launch-button" data-action="start-rounds"><span>Démarrer la session</span>${arrowIcon()}</button>
            <p class="start-hint">Le chrono du premier tour démarre immédiatement.</p>
          </form>
        </section>
        ${this.renderHiitPanel()}
      </main>
    `;
  }

  renderHiitPanel() {
    return `
      <details class="hiit-panel">
        <summary>
          <span class="hiit-bolt">⚡</span>
          <span><strong>Mode HIIT vélo</strong><small>Effort et récupération chronométrés</small></span>
          <span class="summary-chevron">⌄</span>
        </summary>
        <form class="hiit-form" data-hiit-form>
          <div class="hiit-presets">
            ${HIIT_PRESETS.map((preset, index) => `<button type="button" data-action="hiit-preset" data-index="${index}">${preset.label}</button>`).join("")}
          </div>
          <div class="hiit-grid">
            ${numberField("Effort", "workSeconds", this.hiitConfig.workSeconds, "sec")}
            ${numberField("Récupération", "restSeconds", this.hiitConfig.restSeconds, "sec")}
            ${numberField("Tours", "series", this.hiitConfig.series, "")}
            ${numberField("Échauffement", "warmupMinutes", this.hiitConfig.warmupMinutes, "min")}
            ${numberField("Retour au calme", "cooldownMinutes", this.hiitConfig.cooldownMinutes, "min")}
          </div>
          <button type="button" class="launch-button hiit-launch" data-action="start-hiit"><span>Lancer le HIIT vélo</span>${arrowIcon()}</button>
        </form>
      </details>
    `;
  }

  renderSession(snapshot) {
    return `
      <main class="session-view" data-session-kind="${this.sessionKind || "timer"}">
        <section class="timer-stage" data-timer-stage data-timer-state="${snapshot.status}">
          <div class="stage-topline">
            <span class="live-status"><i></i><span data-session-status>En cours</span></span>
            <button type="button" class="fullscreen-button" data-action="fullscreen">${fullscreenIcon()} <span>Plein écran</span></button>
          </div>

          <div class="stage-center">
            <p class="stage-kicker" data-stage-kicker>TOUR</p>
            <div class="timer-orbit" data-timer-orbit>
              <div class="orbit-marker"></div>
              <div class="timer-orbit-inner">
                <span data-time-caption>Chrono du tour</span>
                <strong data-session-time>00:00</strong>
              </div>
            </div>
            <h1 data-stage-title>À toi de jouer.</h1>
            <p class="stage-instruction" data-stage-instruction>Valide quand ton tour est terminé.</p>
          </div>

          <div class="round-timeline" data-round-timeline></div>

          <div class="stage-actions">
            <button type="button" class="complete-round-button" data-action="complete-round" data-complete-round>
              <span>Tour terminé</span>${checkIcon()}
            </button>
            <button type="button" class="skip-rest-button" data-action="next-phase" data-skip-rest hidden>Passer la récupération ${arrowIcon()}</button>
            <div class="timer-controls">
              <button type="button" data-action="toggle-pause" data-pause-button>${pauseIcon()} <span>Pause</span></button>
              <button type="button" data-action="add-time" data-seconds="-10" data-rest-control>−10 s</button>
              <button type="button" data-action="add-time" data-seconds="10" data-rest-control>+10 s</button>
              <button type="button" data-action="previous-phase" data-previous-button>${backIcon()} <span>Précédent</span></button>
            </div>
          </div>
          <div class="session-progress"><span data-session-progress></span></div>
        </section>
        ${this.renderCompletion()}
      </main>
    `;
  }

  renderCompletion() {
    if (!this.completion) {
      return "";
    }
    return `
      <section class="completion-card">
        <div class="completion-copy">
          <p class="eyebrow"><span></span> Session terminée</p>
          <h2>Beau travail.</h2>
          <p>${formatDuration(this.completion.durationMs)} au total${this.roundTimes.length ? ` · ${this.roundTimes.length} tours validés` : ""}.</p>
          ${this.roundTimes.length ? `<div class="lap-summary">${this.roundTimes.map((time, index) => `<span>Tour ${index + 1}<strong>${formatStopwatch(time)}</strong></span>`).join("")}</div>` : ""}
        </div>
        <form data-completion-form>
          <label><span>Nom de la session</span><input name="name" value="${escapeHtml(this.completion.name)}" /></label>
          <label><span>RPE ressenti</span><input name="rpe" type="number" min="1" max="10" placeholder="1–10" /></label>
          <label class="full-row"><span>Note (facultatif)</span><input name="comment" placeholder="Une remarque sur la session…" /></label>
          <div class="completion-actions">
            <button type="button" class="save-button" data-action="save-session">Enregistrer</button>
            <button type="button" data-action="new-session">Nouvelle session</button>
          </div>
        </form>
      </section>
    `;
  }

  renderHistory() {
    const entries = this.history.all();
    return `
      <main class="history-view">
        <div class="history-heading"><div><p class="eyebrow"><span></span> Tes entraînements</p><h1>Historique</h1></div><button type="button" data-action="go-home">Nouvelle session</button></div>
        ${entries.length ? `<div class="history-grid">${entries.map((entry) => `
          <article class="history-card">
            <div><strong>${escapeHtml(entry.name || "Session")}</strong><time>${formatHistoryDate(entry.date)}</time></div>
            <span class="history-duration">${formatDuration(entry.durationMs || 0)}</span>
            <p>${entry.roundTimes?.length ? `${entry.roundTimes.length} tours · ${entry.restSeconds || "–"}s de pause` : entry.mode === "interval" ? "HIIT vélo" : "Minuteur"}${entry.rpe ? ` · RPE ${escapeHtml(entry.rpe)}` : ""}</p>
            ${entry.roundTimes?.length ? `<div class="history-laps">${entry.roundTimes.map((time, index) => `<span>T${index + 1} ${formatStopwatch(time)}</span>`).join("")}</div>` : ""}
            ${entry.comment ? `<small>${escapeHtml(entry.comment)}</small>` : ""}
          </article>
        `).join("")}</div>` : `<div class="empty-history">${stopwatchIcon()}<h2>Aucune session enregistrée</h2><p>Ta prochaine session apparaîtra ici.</p></div>`}
      </main>
    `;
  }

  async handleClick(event) {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const action = button.dataset.action;

    if (action === "adjust-rounds") {
      const input = this.root.querySelector("[name='sets']");
      input.value = String(clamp(Number(input.value) + Number(button.dataset.delta), 1, 99));
      this.updateHomePreview();
      return;
    }
    if (action === "set-rest") {
      const input = this.root.querySelector("[name='restSeconds']");
      input.value = button.dataset.seconds;
      this.root.querySelectorAll("[data-action='set-rest']").forEach((item) => item.classList.toggle("is-active", item === button));
      return;
    }
    if (action === "start-rounds") {
      await this.startRounds();
      return;
    }
    if (action === "hiit-preset") {
      this.applyHiitPreset(Number(button.dataset.index));
      return;
    }
    if (action === "start-hiit") {
      await this.startHiit();
      return;
    }
    if (action === "complete-round") {
      this.captureCurrentRound();
      await this.sound.unlock();
      this.engine.completeManual();
      return;
    }
    if (action === "next-phase") {
      this.captureCurrentRound();
      await this.sound.unlock();
      this.engine.next();
      return;
    }
    if (action === "previous-phase") {
      await this.sound.unlock();
      this.engine.previous();
      const current = this.engine.getSnapshot(false).current;
      if (this.sessionKind === "rounds" && current?.series) this.roundTimes.splice(current.series - 1);
      this.updateSession();
      return;
    }
    if (action === "toggle-pause") {
      await this.sound.unlock();
      this.engine.togglePause();
      if (this.engine.getSnapshot(false).isRunning) await this.wakeLock.request();
      else await this.wakeLock.release();
      return;
    }
    if (action === "add-time") {
      this.engine.addTime(Number(button.dataset.seconds));
      return;
    }
    if (action === "finish-session") {
      this.engine.terminate();
      return;
    }
    if (action === "fullscreen") {
      await this.toggleFullscreen();
      return;
    }
    if (action === "show-history") {
      this.view = "history";
      this.render();
      return;
    }
    if (action === "go-home") {
      await this.goHome();
      return;
    }
    if (action === "new-session") {
      await this.goHome();
      return;
    }
    if (action === "save-session") {
      this.saveSession();
      return;
    }
    if (action === "resume-session") {
      await this.resumeSession();
      return;
    }
    if (action === "discard-session") {
      this.presets.clearInterrupted();
      this.render();
      return;
    }
    if (action === "audio-test") {
      await this.sound.test();
      this.updateAudioStatus();
    }
  }

  handleInput(event) {
    if (event.target.matches("[name='sets']")) this.updateHomePreview();
    if (event.target.matches("[data-audio-muted]")) this.sound.setMuted(event.target.checked);
    if (event.target.matches("[data-audio-volume]")) this.sound.setVolume(event.target.value);
    if (event.target.matches("[data-vibration]")) this.sound.setVibration(event.target.checked);
    this.updateAudioStatus();
  }

  async startRounds() {
    const form = this.root.querySelector("[data-round-form]");
    const data = new FormData(form);
    this.roundConfig = {
      exercise: "Session libre",
      sets: clamp(Number(data.get("sets")), 1, 99),
      restSeconds: clamp(Number(data.get("restSeconds")), 1, 999)
    };
    this.sessionKind = "rounds";
    this.roundTimes = [];
    this.completion = null;
    this.view = "home";
    await this.sound.unlock();
    this.engine.start(StrengthRestTimer.build(this.roundConfig), { mode: "strength", title: `${this.roundConfig.sets} tours`, config: this.roundConfig });
    this.presets.saveLast("strength", this.roundConfig);
    await this.wakeLock.request();
    this.render();
  }

  async startHiit() {
    const form = this.root.querySelector("[data-hiit-form]");
    const data = new FormData(form);
    this.hiitConfig = normalizeHiitConfig({
      workSeconds: data.get("workSeconds"), restSeconds: data.get("restSeconds"), series: data.get("series"),
      warmupMinutes: data.get("warmupMinutes"), cooldownMinutes: data.get("cooldownMinutes")
    });
    this.sessionKind = "hiit";
    this.roundTimes = [];
    this.completion = null;
    await this.sound.unlock();
    this.engine.start(IntervalTimer.build(this.hiitConfig), { mode: "interval", title: `HIIT vélo ${this.hiitConfig.workSeconds}/${this.hiitConfig.restSeconds}`, config: this.hiitConfig });
    this.presets.saveLast("interval", this.hiitConfig);
    await this.wakeLock.request();
    this.render();
  }

  applyHiitPreset(index) {
    const preset = HIIT_PRESETS[index];
    if (!preset) return;
    const form = this.root.querySelector("[data-hiit-form]");
    form.elements.workSeconds.value = preset.work;
    form.elements.restSeconds.value = preset.rest;
    form.elements.series.value = preset.rounds;
  }

  captureCurrentRound() {
    const snapshot = this.engine.getSnapshot(false);
    if (this.sessionKind !== "rounds" || !snapshot.isManualPhase || !snapshot.current?.series) return;
    this.roundTimes[snapshot.current.series - 1] = snapshot.phaseElapsedMs;
  }

  updateHomePreview() {
    const input = this.root.querySelector("[name='sets']");
    const preview = this.root.querySelector("[data-round-preview]");
    if (input && preview) preview.innerHTML = renderPreviewRounds(clamp(Number(input.value), 1, 99));
  }

  updateSession(snapshot = this.engine.getSnapshot(false)) {
    const stage = this.root.querySelector("[data-timer-stage]");
    if (!stage) return;
    const current = snapshot.current;
    const isRounds = this.sessionKind === "rounds";
    const isRest = Boolean(current?.isRest);
    const isFinished = snapshot.isFinished;
    const round = current?.series || current?.round || 1;
    const totalRounds = current?.totalSeries || current?.totalRounds || snapshot.meta.config?.series || snapshot.meta.config?.sets || 1;
    const elapsedProgress = snapshot.phaseDurationMs ? Math.min(1, snapshot.phaseElapsedMs / snapshot.phaseDurationMs) : 0;
    const orbitProgress = isFinished ? 1 : isRounds && !isRest ? 0 : elapsedProgress;

    stage.dataset.timerState = snapshot.status;
    stage.dataset.phase = isFinished ? "finished" : isRest ? "rest" : "work";
    stage.style.setProperty("--orbit-progress", `${orbitProgress * 360}deg`);
    setText(stage, "[data-session-status]", isFinished ? "Terminé" : snapshot.isPaused ? "En pause" : "En cours");
    setText(stage, "[data-stage-kicker]", isFinished ? "SESSION TERMINÉE" : `${isRest ? "RÉCUPÉRATION" : isRounds ? "TOUR" : current?.label?.toUpperCase() || "HIIT"} · ${round}/${totalRounds}`);
    setText(stage, "[data-time-caption]", isFinished ? "Durée totale" : isRest ? "Temps de récupération" : isRounds ? "Chrono du tour" : "Temps restant");
    setText(stage, "[data-session-time]", isFinished ? formatDuration(snapshot.actualDurationMs) : isRounds && snapshot.isManualPhase ? formatStopwatch(snapshot.phaseElapsedMs) : formatDuration(snapshot.phaseRemainingMs || 0));
    setText(stage, "[data-stage-title]", isFinished ? "Beau travail." : isRest ? "Souffle." : isRounds ? "À toi de jouer." : current?.label || "C’est parti.");
    setText(stage, "[data-stage-instruction]", isFinished ? "Ta session est complète." : isRest ? `Prochain tour : ${Math.min(round + 1, totalRounds)} sur ${totalRounds}` : isRounds ? "Valide quand ton tour est terminé." : current?.instruction || "Garde le rythme.");

    const timeline = stage.querySelector("[data-round-timeline]");
    if (timeline) timeline.innerHTML = isRounds ? renderRoundTimeline(totalRounds, round, isRest, this.roundTimes, isFinished) : renderHiitTimeline(totalRounds, round, isRest, isFinished);
    const completeButton = stage.querySelector("[data-complete-round]");
    const skipButton = stage.querySelector("[data-skip-rest]");
    if (completeButton) completeButton.hidden = !isRounds || !snapshot.isManualPhase || isFinished;
    if (skipButton) skipButton.hidden = !isRest || isFinished;
    stage.querySelectorAll("[data-rest-control]").forEach((button) => { button.hidden = !isRest || isFinished; });
    const pause = stage.querySelector("[data-pause-button]");
    if (pause) {
      pause.disabled = !snapshot.isActive;
      pause.querySelector("span").textContent = snapshot.isPaused ? "Reprendre" : "Pause";
    }
    const previous = stage.querySelector("[data-previous-button]");
    if (previous) previous.disabled = !snapshot.isActive || snapshot.currentIndex <= 0;
    const progress = stage.querySelector("[data-session-progress]");
    if (progress) progress.style.width = `${Math.round((isRounds ? roundProgress(totalRounds, round, isRest, this.roundTimes, isFinished) : snapshot.progress) * 100)}%`;
  }

  createCompletion(snapshot) {
    return {
      name: this.sessionKind === "rounds" ? "Session libre" : "HIIT vélo",
      durationMs: snapshot.actualDurationMs,
      mode: this.sessionKind === "rounds" ? "strength" : "interval"
    };
  }

  saveSession() {
    const form = this.root.querySelector("[data-completion-form]");
    if (!form || !this.completion) return;
    const data = new FormData(form);
    this.history.add({
      name: String(data.get("name") || this.completion.name),
      durationMs: this.completion.durationMs,
      mode: this.completion.mode,
      rpe: String(data.get("rpe") || ""),
      comment: String(data.get("comment") || ""),
      roundTimes: [...this.roundTimes],
      restSeconds: this.sessionKind === "rounds" ? this.roundConfig.restSeconds : this.hiitConfig.restSeconds
    });
    this.view = "history";
    this.engine.reset();
    this.completion = null;
    this.render();
  }

  async goHome() {
    if (this.engine.getSnapshot(false).isActive) return;
    this.view = "home";
    this.engine.reset();
    this.completion = null;
    this.sessionKind = null;
    this.roundTimes = [];
    this.presets.clearInterrupted();
    await this.wakeLock.release();
    this.render();
  }

  async resumeSession() {
    const interrupted = this.presets.interrupted();
    if (!interrupted?.engine) return;
    this.sessionKind = interrupted.sessionKind || (interrupted.engine.meta?.mode === "strength" ? "rounds" : "hiit");
    this.roundTimes = interrupted.roundTimes || [];
    this.engine.restore(interrupted.engine);
    if (this.engine.getSnapshot(false).isRunning) {
      await this.sound.unlock();
      await this.wakeLock.request();
    }
    this.render();
  }

  persistInterrupted(snapshot) {
    if (!snapshot.isActive || Date.now() - this.lastInterruptedSave < 1000) return;
    this.lastInterruptedSave = Date.now();
    this.presets.saveInterrupted({ engine: this.engine.serialize(), sessionKind: this.sessionKind, roundTimes: this.roundTimes, title: snapshot.meta.title });
  }

  playCountdownCue(snapshot) {
    if (!snapshot.isRunning || snapshot.phaseRemainingMs === null || snapshot.phaseRemainingMs > 3100) return;
    const second = Math.ceil(snapshot.phaseRemainingMs / 1000);
    if (second < 1 || second > 3) return;
    const key = `${snapshot.currentIndex}-${second}`;
    if (key !== this.lastCountdownKey) {
      this.lastCountdownKey = key;
      this.sound.playCountdown();
    }
  }

  updateAudioStatus() {
    const status = this.root.querySelector("[data-audio-status]");
    if (status) status.textContent = this.sound.statusLabel();
  }

  async toggleFullscreen() {
    const stage = this.root.querySelector("[data-timer-stage]");
    if (!stage) return;
    if (document.fullscreenElement) await document.exitFullscreen();
    else await stage.requestFullscreen?.();
    await this.wakeLock.request();
  }
}

function normalizeRoundConfig(config = {}) {
  return { exercise: "Session libre", sets: clamp(Number(config?.sets) || 4, 1, 99), restSeconds: clamp(Number(config?.restSeconds) || 90, 1, 999) };
}

function normalizeHiitConfig(config = {}) {
  const restSeconds = Number(config?.restSeconds);
  return {
    workSeconds: clamp(Number(config?.workSeconds) || 30, 1, 999),
    restSeconds: Number.isFinite(restSeconds) ? clamp(restSeconds, 0, 999) : 90,
    series: clamp(Number(config?.series) || 8, 1, 99),
    warmupMinutes: clamp(Number(config?.warmupMinutes) || 0, 0, 99), warmupSeconds: 0,
    cooldownMinutes: clamp(Number(config?.cooldownMinutes) || 0, 0, 99), cooldownSeconds: 0,
    instruction: "Vélo : fort / facile", rpe: ""
  };
}

function renderPreviewRounds(total) {
  const visible = Math.min(total, 8);
  return `${Array.from({ length: visible }, (_, index) => `<span class="${index === 0 ? "is-current" : ""}"><i>${index + 1}</i></span>`).join("")}${total > visible ? `<b>+${total - visible}</b>` : ""}`;
}

function renderRoundTimeline(total, current, isRest, times, isFinished) {
  const visibleTotal = Math.min(total, 12);
  return `<div class="timeline-label"><span>Progression</span><strong>${isFinished ? total : Math.min(times.length, total)} / ${total} tours</strong></div><div class="timeline-track">${Array.from({ length: visibleTotal }, (_, index) => {
    const number = index + 1;
    const done = isFinished || Boolean(times[index]);
    const active = !isFinished && number === current && !isRest;
    return `<span class="timeline-stop ${done ? "is-done" : ""} ${active ? "is-current" : ""}"><i>${done ? checkSmallIcon() : number}</i>${times[index] ? `<small>${formatStopwatch(times[index])}</small>` : ""}</span>`;
  }).join("")}${total > visibleTotal ? `<span class="timeline-more">+${total - visibleTotal}</span>` : ""}</div>`;
}

function renderHiitTimeline(total, current, isRest, isFinished) {
  return `<div class="timeline-label"><span>Intervalles</span><strong>${isFinished ? total : current} / ${total}</strong></div><div class="hiit-track">${Array.from({ length: Math.min(total, 20) }, (_, index) => `<i class="${isFinished || index + 1 < current || (index + 1 === current && isRest) ? "is-done" : index + 1 === current ? "is-current" : ""}"></i>`).join("")}</div>`;
}

function roundProgress(total, current, isRest, times, isFinished) {
  if (isFinished) return 1;
  return Math.min(1, Math.max(times.length, isRest ? current : current - 1) / total);
}

function numberField(label, name, value, suffix) {
  return `<label><span>${label}</span><div><input name="${name}" type="number" min="0" value="${value}" inputmode="numeric" />${suffix ? `<small>${suffix}</small>` : ""}</div></label>`;
}

function setText(root, selector, text) {
  const element = root.querySelector(selector);
  if (element) element.textContent = text;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? Math.round(value) : min));
}

function shortDuration(seconds) {
  return seconds < 120 ? `${seconds}s` : `${seconds / 60} min`;
}

function formatStopwatch(ms) {
  const totalSeconds = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}` : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatHistoryDate(value) {
  return new Date(value).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

function settingsIcon() { return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.86 2.86-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21H9.5v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.88.34l-.06.06-2.86-2.86.06-.06A1.7 1.7 0 0 0 4 15a1.7 1.7 0 0 0-1.5-1H2.4V9.9h.1A1.7 1.7 0 0 0 4 8.9a1.7 1.7 0 0 0-.34-1.88l-.06-.06L6.46 4.1l.06.06A1.7 1.7 0 0 0 8.4 4.5a1.7 1.7 0 0 0 1-1.5v-.1h4.1V3a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.86 2.86-.06.06A1.7 1.7 0 0 0 19 8.9a1.7 1.7 0 0 0 1.5 1h.1V14h-.1a1.7 1.7 0 0 0-1.1 1Z"/></svg>`; }
function stopwatchIcon() { return `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M9 2h6M12 5v2M12 13l3-3"/></svg>`; }
function arrowIcon() { return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>`; }
function fullscreenIcon() { return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/></svg>`; }
function checkIcon() { return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>`; }
function checkSmallIcon() { return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 12 4 4 8-9"/></svg>`; }
function pauseIcon() { return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>`; }
function backIcon() { return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>`; }
