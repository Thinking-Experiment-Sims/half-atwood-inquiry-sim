import {
  firstHarmonicAirLengthM,
  inferredSpeedMps,
  qualityBand,
  resonanceStrength,
  speedOfSoundFromTemp
} from "./resonancePhysics.js";

const FORK_FREQUENCIES_HZ = [256, 288, 320, 341, 384, 426, 480, 512, 640, 768];
const AIR_LENGTH_MIN_M = 0.08;
const AIR_LENGTH_MAX_M = 0.95;
const PIPE_STEP_M = 0.004;
const TUBE_DIAMETER_M = 0.04;
const ROOM_TEMP_C = 20;
const REFERENCE_SPEED_MPS = speedOfSoundFromTemp(ROOM_TEMP_C);
const TARGET_MAX_THRESHOLD = 0.985;
const MEASUREMENT_NOISE_M = 0.0015;

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * @param {number} value
 * @param {number} digits
 * @returns {string}
 */
function format(value, digits = 3) {
  return Number.isFinite(value) ? value.toFixed(digits) : "--";
}

/**
 * @param {HTMLCanvasElement} canvas
 */
function resizeCanvasToDisplaySize(canvas) {
  const ratio = window.devicePixelRatio || 1;
  const width = Math.floor(canvas.clientWidth * ratio);
  const height = Math.floor(canvas.clientHeight * ratio);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

class ResonanceAudio {
  constructor() {
    this.context = null;
    this.fundamentalOsc = null;
    this.overtoneOsc = null;
    this.vibratoOsc = null;
    this.vibratoGain = null;
    this.masterGain = null;

    this.enabled = false;
    this.frequencyHz = 384;
    this.strength = 0;
  }

  async ensureNodes() {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) {
      return false;
    }

    if (!this.context) {
      this.context = new AudioContextCtor();

      this.masterGain = this.context.createGain();
      this.masterGain.gain.value = 0;
      this.masterGain.connect(this.context.destination);

      this.fundamentalOsc = this.context.createOscillator();
      this.fundamentalOsc.type = "sine";

      this.overtoneOsc = this.context.createOscillator();
      this.overtoneOsc.type = "triangle";

      this.vibratoOsc = this.context.createOscillator();
      this.vibratoOsc.type = "sine";
      this.vibratoOsc.frequency.value = 5;

      this.vibratoGain = this.context.createGain();
      this.vibratoGain.gain.value = 2.2;

      this.fundamentalOsc.frequency.value = this.frequencyHz;
      this.overtoneOsc.frequency.value = this.frequencyHz * 2;

      this.vibratoOsc.connect(this.vibratoGain);
      this.vibratoGain.connect(this.fundamentalOsc.frequency);

      const overtoneMix = this.context.createGain();
      overtoneMix.gain.value = 0.16;
      this.overtoneOsc.connect(overtoneMix);
      overtoneMix.connect(this.masterGain);
      this.fundamentalOsc.connect(this.masterGain);

      this.fundamentalOsc.start();
      this.overtoneOsc.start();
      this.vibratoOsc.start();
    }

    if (this.context.state === "suspended") {
      await this.context.resume();
    }

    return true;
  }

  async setEnabled(enabled) {
    if (enabled) {
      const ready = await this.ensureNodes();
      if (!ready) {
        return false;
      }
    }

    this.enabled = enabled;
    this.apply();
    return true;
  }

  /**
   * @param {number} frequencyHz
   * @param {number} strength
   */
  setSignal(frequencyHz, strength) {
    this.frequencyHz = frequencyHz;
    this.strength = clamp(strength, 0, 1);

    if (!this.context || !this.fundamentalOsc || !this.overtoneOsc || !this.vibratoGain) {
      return;
    }

    const now = this.context.currentTime;
    this.fundamentalOsc.frequency.setTargetAtTime(this.frequencyHz, now, 0.03);
    this.overtoneOsc.frequency.setTargetAtTime(this.frequencyHz * 2, now, 0.03);
    this.vibratoGain.gain.setTargetAtTime(1.4 + this.strength * 2.2, now, 0.08);
    this.apply();
  }

  apply() {
    if (!this.context || !this.masterGain) {
      return;
    }

    const now = this.context.currentTime;
    const loudness = this.enabled ? 0.003 + 0.2 * this.strength ** 1.8 : 0;
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setTargetAtTime(loudness, now, 0.05);
  }
}

const elements = {
  frequencySelect: /** @type {HTMLSelectElement} */ (document.querySelector("#frequencySelect")),
  frequencySlider: /** @type {HTMLInputElement} */ (document.querySelector("#frequencySlider")),
  frequencyValue: document.querySelector("#frequencyValue"),
  airLengthSlider: /** @type {HTMLInputElement} */ (document.querySelector("#airLengthSlider")),
  airLengthValue: document.querySelector("#airLengthValue"),
  pipeUpButton: /** @type {HTMLButtonElement} */ (document.querySelector("#pipeUpButton")),
  pipeDownButton: /** @type {HTMLButtonElement} */ (document.querySelector("#pipeDownButton")),
  predictionInput: /** @type {HTMLInputElement} */ (document.querySelector("#predictionInput")),
  predictionFeedback: document.querySelector("#predictionFeedback"),
  hintToggle: /** @type {HTMLInputElement} */ (document.querySelector("#hintToggle")),
  toneButton: /** @type {HTMLButtonElement} */ (document.querySelector("#toneButton")),
  recordButton: /** @type {HTMLButtonElement} */ (document.querySelector("#recordButton")),
  clearButton: /** @type {HTMLButtonElement} */ (document.querySelector("#clearButton")),
  statusText: document.querySelector("#statusText"),
  loudnessFill: document.querySelector("#loudnessFill"),
  loudnessLabel: document.querySelector("#loudnessLabel"),
  forkReadout: document.querySelector("#forkReadout"),
  lengthReadout: document.querySelector("#lengthReadout"),
  targetReadout: document.querySelector("#targetReadout"),
  speedReadout: document.querySelector("#speedReadout"),
  trialTableBody: document.querySelector("#trialTableBody"),
  acceptedCount: document.querySelector("#acceptedCount"),
  meanSpeed: document.querySelector("#meanSpeed"),
  percentError: document.querySelector("#percentError"),
  stepPredict: document.querySelector("#stepPredict"),
  stepTone: document.querySelector("#stepTone"),
  stepMax: document.querySelector("#stepMax"),
  stepTrials: document.querySelector("#stepTrials"),
  tubeCanvas: /** @type {HTMLCanvasElement} */ (document.querySelector("#tubeCanvas"))
};

const state = {
  frequencyHz: 384,
  airLengthM: 0.23,
  predictionM: null,
  hintsEnabled: false,
  toneEnabled: false,
  toneStarted: false,
  foundMaximum: false,
  transientStatus: /** @type {{message:string, tone:"default"|"warn"}|null} */ (null),
  records: /** @type {Array<{id:number, frequencyHz:number, lengthM:number, speedMps:number, accepted:boolean, qualityLabel:string, qualityCss:"good"|"ok"|"low"}>} */ ([]),
  nextRecordId: 1
};

const audio = new ResonanceAudio();
const tubeContext = elements.tubeCanvas.getContext("2d");
let statusTimeoutId = null;

function buildFrequencyOptions() {
  elements.frequencySelect.innerHTML = "";

  for (const freq of FORK_FREQUENCIES_HZ) {
    const option = document.createElement("option");
    option.value = String(freq);
    option.textContent = `${freq} Hz`;
    elements.frequencySelect.append(option);
  }

  const custom = document.createElement("option");
  custom.value = "custom";
  custom.textContent = "Custom (slider)";
  elements.frequencySelect.append(custom);
}

/**
 * @param {string} message
 * @param {"default"|"warn"} tone
 */
function setStatus(message, tone = "default") {
  elements.statusText.textContent = message;
  elements.statusText.classList.toggle("warn", tone === "warn");
}

/**
 * @param {string} message
 * @param {"default"|"warn"} tone
 * @param {number} durationMs
 */
function showTransientStatus(message, tone = "default", durationMs = 2600) {
  state.transientStatus = { message, tone };
  if (statusTimeoutId !== null) {
    window.clearTimeout(statusTimeoutId);
  }

  statusTimeoutId = window.setTimeout(() => {
    state.transientStatus = null;
    render();
  }, durationMs);
}

function getDerivedState() {
  const unclampedTarget = firstHarmonicAirLengthM({
    frequencyHz: state.frequencyHz,
    speedMps: REFERENCE_SPEED_MPS,
    tubeDiameterM: TUBE_DIAMETER_M
  });
  const targetLengthM = clamp(unclampedTarget, AIR_LENGTH_MIN_M, AIR_LENGTH_MAX_M);
  const strength = resonanceStrength({
    airLengthM: state.airLengthM,
    targetLengthM,
    bandwidthM: Math.max(0.008, targetLengthM * 0.055)
  });
  const quality = qualityBand(strength);

  return {
    targetLengthM,
    strength,
    quality,
    atMaximum: strength >= TARGET_MAX_THRESHOLD,
    instantSpeedMps: inferredSpeedMps({
      frequencyHz: state.frequencyHz,
      airLengthM: state.airLengthM,
      tubeDiameterM: TUBE_DIAMETER_M
    })
  };
}

/**
 * @param {boolean} condition
 * @param {HTMLElement|null} element
 */
function markStep(condition, element) {
  if (!element) {
    return;
  }

  element.classList.toggle("done", condition);
}

function updateChecklist(derived) {
  markStep(state.predictionM !== null, elements.stepPredict);
  markStep(state.toneStarted, elements.stepTone);
  markStep(state.foundMaximum || derived.atMaximum, elements.stepMax);

  const acceptedCount = state.records.filter((record) => record.accepted).length;
  markStep(acceptedCount >= 3, elements.stepTrials);
}

function renderTableAndStats() {
  const rows = state.records;
  if (!rows.length) {
    elements.trialTableBody.innerHTML = "<tr><td colspan=\"5\">No trials yet. Start tone, find max loudness, then record.</td></tr>";
  } else {
    elements.trialTableBody.innerHTML = rows
      .map((row) => `
        <tr>
          <td>${row.id}</td>
          <td>${row.frequencyHz}</td>
          <td>${format(row.lengthM, 3)}</td>
          <td><span class="quality-pill ${row.qualityCss}">${row.qualityLabel}</span></td>
          <td>${format(row.speedMps, 1)}</td>
        </tr>
      `)
      .join("");
  }

  const accepted = rows.filter((row) => row.accepted);
  elements.acceptedCount.textContent = String(accepted.length);

  if (!accepted.length) {
    elements.meanSpeed.textContent = "--";
    elements.percentError.textContent = "--";
    return;
  }

  const meanSpeed = accepted.reduce((sum, record) => sum + record.speedMps, 0) / accepted.length;
  const errorPercent = (Math.abs(meanSpeed - REFERENCE_SPEED_MPS) / REFERENCE_SPEED_MPS) * 100;

  elements.meanSpeed.textContent = `${format(meanSpeed, 1)} m/s`;
  elements.percentError.textContent = `${format(errorPercent, 2)}%`;
}

function updatePredictionFeedback(derived) {
  if (state.predictionM === null) {
    elements.predictionFeedback.textContent = "";
    return;
  }

  const deltaCm = Math.abs(state.predictionM - derived.targetLengthM) * 100;
  if (derived.atMaximum || state.hintsEnabled) {
    elements.predictionFeedback.textContent = `Prediction difference from target: ${format(deltaCm, 1)} cm`;
  } else {
    elements.predictionFeedback.textContent = "Make your prediction first, then test with the simulation.";
  }
}

/**
 * @param {number} timestamp
 * @param {{targetLengthM:number, strength:number}} derived
 */
function drawTube(timestamp, derived) {
  if (!tubeContext) {
    return;
  }

  resizeCanvasToDisplaySize(elements.tubeCanvas);

  const ratio = window.devicePixelRatio || 1;
  const ctx = tubeContext;
  const width = elements.tubeCanvas.width;
  const height = elements.tubeCanvas.height;

  const tubeWidth = Math.min(160 * ratio, width * 0.24);
  const tubeLeft = width * 0.5 - tubeWidth * 0.5;
  const tubeRight = tubeLeft + tubeWidth;
  const tubeTop = 42 * ratio;
  const tubeBottom = height - 42 * ratio;
  const tubeHeight = tubeBottom - tubeTop;

  const airFraction = (state.airLengthM - AIR_LENGTH_MIN_M) / (AIR_LENGTH_MAX_M - AIR_LENGTH_MIN_M);
  const waterY = tubeBottom - clamp(airFraction, 0, 1) * tubeHeight;

  ctx.clearRect(0, 0, width, height);

  const bgGradient = ctx.createLinearGradient(0, 0, 0, height);
  bgGradient.addColorStop(0, "#f5fbff");
  bgGradient.addColorStop(1, "#eef6fa");
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, width, height);

  // Scale markings on the side of the tube.
  ctx.save();
  ctx.fillStyle = "#4f6973";
  ctx.strokeStyle = "#7f9aa4";
  ctx.lineWidth = 1.4 * ratio;
  ctx.font = `${11 * ratio}px "Avenir Next", sans-serif`;
  ctx.textAlign = "right";

  for (let mark = 0.1; mark <= 0.9; mark += 0.1) {
    const y = tubeBottom - ((mark - AIR_LENGTH_MIN_M) / (AIR_LENGTH_MAX_M - AIR_LENGTH_MIN_M)) * tubeHeight;
    if (y < tubeTop || y > tubeBottom) {
      continue;
    }

    ctx.beginPath();
    ctx.moveTo(tubeLeft - 18 * ratio, y);
    ctx.lineTo(tubeLeft - 5 * ratio, y);
    ctx.stroke();
    ctx.fillText(`${mark.toFixed(1)} m`, tubeLeft - 22 * ratio, y + 3.5 * ratio);
  }
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = "#2c5663";
  ctx.lineWidth = 3 * ratio;
  ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
  ctx.beginPath();
  ctx.rect(tubeLeft, tubeTop, tubeWidth, tubeHeight);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  ctx.save();
  const waterGradient = ctx.createLinearGradient(0, waterY, 0, tubeBottom);
  waterGradient.addColorStop(0, "rgba(59, 136, 166, 0.82)");
  waterGradient.addColorStop(1, "rgba(31, 104, 133, 0.95)");
  ctx.fillStyle = waterGradient;
  ctx.fillRect(tubeLeft + 2 * ratio, waterY, tubeWidth - 4 * ratio, tubeBottom - waterY);

  ctx.strokeStyle = "rgba(240, 249, 255, 0.75)";
  ctx.lineWidth = 1.4 * ratio;
  ctx.beginPath();
  ctx.moveTo(tubeLeft + 2 * ratio, waterY + 1.5 * ratio);
  ctx.lineTo(tubeRight - 2 * ratio, waterY + 1.5 * ratio);
  ctx.stroke();
  ctx.restore();

  // Tuning fork shape near opening.
  const phase = timestamp / 130;
  const tineOffset = state.toneEnabled ? Math.sin(phase) * (2 + 4 * derived.strength) * ratio : 0;
  const forkX = tubeRight + 120 * ratio;
  const forkY = tubeTop + 22 * ratio;

  ctx.save();
  ctx.strokeStyle = "#7d5d26";
  ctx.lineWidth = 6 * ratio;
  ctx.beginPath();
  ctx.moveTo(forkX, forkY);
  ctx.lineTo(forkX, forkY + 120 * ratio);
  ctx.stroke();

  ctx.strokeStyle = "#5e7480";
  ctx.lineWidth = 8 * ratio;
  ctx.beginPath();
  ctx.moveTo(forkX - 22 * ratio - tineOffset, forkY);
  ctx.lineTo(forkX - 22 * ratio - tineOffset, forkY - 62 * ratio);
  ctx.moveTo(forkX + 22 * ratio + tineOffset, forkY);
  ctx.lineTo(forkX + 22 * ratio + tineOffset, forkY - 62 * ratio);
  ctx.stroke();
  ctx.restore();

  if (state.toneEnabled) {
    const airLengthPixels = Math.max(10 * ratio, waterY - tubeTop);
    const centerX = (tubeLeft + tubeRight) / 2;
    const envelope = 10 * ratio + 24 * ratio * derived.strength;
    const wavePhase = timestamp / 95;

    ctx.save();
    ctx.strokeStyle = `rgba(9, 128, 142, ${0.34 + 0.62 * derived.strength})`;
    ctx.lineWidth = 2.3 * ratio;
    ctx.beginPath();
    for (let index = 0; index <= 240; index += 1) {
      const u = index / 240;
      const y = tubeTop + u * airLengthPixels;
      const nodeEnvelope = Math.cos((Math.PI / 2) * u);
      const x = centerX + envelope * nodeEnvelope * Math.sin(wavePhase + u * 9);
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();

    ctx.strokeStyle = `rgba(191, 127, 25, ${0.22 + 0.5 * derived.strength})`;
    ctx.lineWidth = 1.6 * ratio;
    ctx.beginPath();
    for (let index = 0; index <= 240; index += 1) {
      const u = index / 240;
      const y = tubeTop + u * airLengthPixels;
      const nodeEnvelope = Math.cos((Math.PI / 2) * u);
      const x = centerX - envelope * 0.72 * nodeEnvelope * Math.sin(wavePhase * 1.2 + u * 11);
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  // Target marker shown only for scaffolded hint mode.
  if (state.hintsEnabled) {
    const targetFraction = (derived.targetLengthM - AIR_LENGTH_MIN_M) / (AIR_LENGTH_MAX_M - AIR_LENGTH_MIN_M);
    const targetY = tubeBottom - clamp(targetFraction, 0, 1) * tubeHeight;

    ctx.save();
    ctx.strokeStyle = "#dc7f14";
    ctx.setLineDash([8 * ratio, 6 * ratio]);
    ctx.lineWidth = 2 * ratio;
    ctx.beginPath();
    ctx.moveTo(tubeLeft - 6 * ratio, targetY);
    ctx.lineTo(tubeRight + 42 * ratio, targetY);
    ctx.stroke();

    ctx.fillStyle = "#a45b06";
    ctx.font = `${12 * ratio}px "Avenir Next", sans-serif`;
    ctx.fillText("Hint target", tubeRight + 48 * ratio, targetY + 4 * ratio);
    ctx.restore();
  }
}

function render() {
  const derived = getDerivedState();
  if (state.toneEnabled && derived.atMaximum) {
    state.foundMaximum = true;
  }

  elements.frequencyValue.textContent = `${state.frequencyHz} Hz`;
  elements.airLengthValue.textContent = `${format(state.airLengthM, 3)} m`;

  elements.forkReadout.textContent = `${state.frequencyHz} Hz`;
  elements.lengthReadout.textContent = `${format(state.airLengthM, 3)} m`;
  elements.targetReadout.textContent = state.hintsEnabled
    ? `${format(derived.targetLengthM, 3)} m`
    : "Hidden (enable hints)";
  elements.speedReadout.textContent = `${format(derived.instantSpeedMps, 1)} m/s`;

  const percent = clamp(derived.strength * 100, 0, 100);
  elements.loudnessFill.style.width = `${percent.toFixed(1)}%`;
  elements.loudnessFill.classList.toggle("maxed", derived.atMaximum && state.toneEnabled);

  if (!state.toneEnabled) {
    elements.loudnessLabel.textContent = "Tone off";
  } else if (derived.atMaximum) {
    elements.loudnessLabel.textContent = "Maximum resonance";
  } else if (derived.strength >= 0.88) {
    elements.loudnessLabel.textContent = "Near peak";
  } else {
    elements.loudnessLabel.textContent = "Searching";
  }

  if (state.transientStatus) {
    setStatus(state.transientStatus.message, state.transientStatus.tone);
  } else {
    if (!state.toneEnabled) {
      setStatus("Press Start Tone, then move the pipe up/down to search for the first-harmonic maximum.");
    } else if (derived.atMaximum) {
      setStatus("Maximum found. Record this trial, then change frequency and repeat.");
    } else if (derived.strength >= 0.88) {
      setStatus("You are close. Make small pipe moves to find the exact loudest point.");
    } else {
      const direction = state.airLengthM < derived.targetLengthM ? "Down" : "Up";
      setStatus(`Keep searching: move pipe ${direction} to approach first-harmonic resonance.`);
    }
  }

  updatePredictionFeedback(derived);
  updateChecklist(derived);
  renderTableAndStats();

  elements.recordButton.disabled = !state.toneStarted;

  elements.toneButton.classList.toggle("active", state.toneEnabled);
  elements.toneButton.textContent = state.toneEnabled ? "Stop Tone" : "Start Tone";

  audio.setSignal(state.frequencyHz, derived.strength);
}

/**
 * @param {number} lengthM
 */
function setAirLength(lengthM) {
  state.airLengthM = clamp(lengthM, AIR_LENGTH_MIN_M, AIR_LENGTH_MAX_M);
  elements.airLengthSlider.value = state.airLengthM.toFixed(3);
  render();
}

/**
 * @param {number} frequencyHz
 */
function setFrequency(frequencyHz) {
  state.frequencyHz = clamp(Math.round(frequencyHz), 220, 800);
  elements.frequencySlider.value = String(state.frequencyHz);

  const isCommonFork = FORK_FREQUENCIES_HZ.includes(state.frequencyHz);
  elements.frequencySelect.value = isCommonFork ? String(state.frequencyHz) : "custom";
  render();
}

function recordTrial() {
  const derived = getDerivedState();
  const noise = (Math.random() * 2 - 1) * MEASUREMENT_NOISE_M;
  const measuredLengthM = clamp(state.airLengthM + noise, AIR_LENGTH_MIN_M, AIR_LENGTH_MAX_M);
  const speedMps = inferredSpeedMps({
    frequencyHz: state.frequencyHz,
    airLengthM: measuredLengthM,
    tubeDiameterM: TUBE_DIAMETER_M
  });

  state.records.unshift({
    id: state.nextRecordId,
    frequencyHz: state.frequencyHz,
    lengthM: measuredLengthM,
    speedMps,
    accepted: derived.quality.accepted,
    qualityLabel: derived.quality.label,
    qualityCss: derived.quality.css
  });

  state.nextRecordId += 1;

  if (!derived.quality.accepted) {
    showTransientStatus("Trial recorded, but quality is low. Try again nearer the maximum for accepted data.", "warn");
  } else {
    showTransientStatus("Accepted trial recorded. Change frequency and collect the next resonance point.");
  }

  render();
}

function bindEvents() {
  elements.frequencySelect.addEventListener("change", () => {
    if (elements.frequencySelect.value === "custom") {
      return;
    }

    setFrequency(Number(elements.frequencySelect.value));
  });

  elements.frequencySlider.addEventListener("input", () => {
    setFrequency(Number(elements.frequencySlider.value));
  });

  elements.airLengthSlider.addEventListener("input", () => {
    setAirLength(Number(elements.airLengthSlider.value));
  });

  elements.pipeUpButton.addEventListener("click", () => {
    setAirLength(state.airLengthM - PIPE_STEP_M);
  });

  elements.pipeDownButton.addEventListener("click", () => {
    setAirLength(state.airLengthM + PIPE_STEP_M);
  });

  elements.predictionInput.addEventListener("change", () => {
    const parsed = Number(elements.predictionInput.value);
    state.predictionM = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    render();
  });

  elements.hintToggle.addEventListener("change", () => {
    state.hintsEnabled = elements.hintToggle.checked;
    render();
  });

  elements.toneButton.addEventListener("click", async () => {
    if (state.toneEnabled) {
      state.toneEnabled = false;
      await audio.setEnabled(false);
      render();
      return;
    }

    const ok = await audio.setEnabled(true);
    if (!ok) {
      showTransientStatus("This browser does not support Web Audio. Use a modern browser for sound playback.", "warn");
      return;
    }

    state.toneEnabled = true;
    state.toneStarted = true;
    render();
  });

  elements.recordButton.addEventListener("click", () => {
    if (!state.toneStarted) {
      showTransientStatus("Start the tone first so you can locate resonance before recording.", "warn");
      return;
    }

    recordTrial();
  });

  elements.clearButton.addEventListener("click", () => {
    state.records = [];
    state.nextRecordId = 1;
    render();
  });

  window.addEventListener("resize", () => {
    render();
  });
}

function animate(timestamp) {
  const derived = getDerivedState();
  drawTube(timestamp, derived);
  window.requestAnimationFrame(animate);
}

function initialize() {
  buildFrequencyOptions();
  bindEvents();

  const initialTarget = firstHarmonicAirLengthM({
    frequencyHz: state.frequencyHz,
    speedMps: REFERENCE_SPEED_MPS,
    tubeDiameterM: TUBE_DIAMETER_M
  });
  setAirLength(clamp(initialTarget * 0.9, AIR_LENGTH_MIN_M, AIR_LENGTH_MAX_M));
  setFrequency(state.frequencyHz);

  window.requestAnimationFrame(animate);
}

initialize();
