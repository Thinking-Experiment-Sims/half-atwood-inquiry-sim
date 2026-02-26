import {
  calculateHalfAtwoodFromRest,
  clamp,
  resolveDynamicForces,
  VELOCITY_EPSILON
} from "./halfAtwoodPhysics.js";

const GRAVITY_MPS2 = 10;

/**
 * @param {number} value
 * @param {number} digits
 * @returns {string}
 */
function fmt(value, digits = 2) {
  return Number.isFinite(value) ? value.toFixed(digits) : "--";
}

/**
 * @param {number} value
 * @returns {string}
 */
function signed(value) {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${fmt(value)}`;
}

const elements = {
  massTable: /** @type {HTMLInputElement} */ (document.querySelector("#massTable")),
  massHanging: /** @type {HTMLInputElement} */ (document.querySelector("#massHanging")),
  initialVelocity: /** @type {HTMLInputElement} */ (document.querySelector("#initialVelocity")),
  initialVelocityValue: document.querySelector("#initialVelocityValue"),
  frictionEnabled: /** @type {HTMLInputElement} */ (document.querySelector("#frictionEnabled")),
  mu: /** @type {HTMLInputElement} */ (document.querySelector("#mu")),
  muValue: document.querySelector("#muValue"),
  showForces: /** @type {HTMLInputElement} */ (document.querySelector("#showForces")),
  startBtn: /** @type {HTMLButtonElement} */ (document.querySelector("#startBtn")),
  pauseBtn: /** @type {HTMLButtonElement} */ (document.querySelector("#pauseBtn")),
  resetBtn: /** @type {HTMLButtonElement} */ (document.querySelector("#resetBtn")),
  recordBtn: /** @type {HTMLButtonElement} */ (document.querySelector("#recordBtn")),
  clearBtn: /** @type {HTMLButtonElement} */ (document.querySelector("#clearBtn")),
  themeToggle: /** @type {HTMLButtonElement} */ (document.querySelector("#themeToggle")),
  statusText: document.querySelector("#statusText"),
  simCanvas: /** @type {HTMLCanvasElement} */ (document.querySelector("#simCanvas")),
  accelReadout: document.querySelector("#accelReadout"),
  restAccelReadout: document.querySelector("#restAccelReadout"),
  tensionReadout: document.querySelector("#tensionReadout"),
  frictionReadout: document.querySelector("#frictionReadout"),
  netReadout: document.querySelector("#netReadout"),
  velocityReadout: document.querySelector("#velocityReadout"),
  displacementReadout: document.querySelector("#displacementReadout"),
  timeReadout: document.querySelector("#timeReadout"),
  trialTableBody: document.querySelector("#trialTableBody"),
  discoveryTabBtn: /** @type {HTMLButtonElement} */ (document.querySelector("#discoveryTabBtn")),
  theoryTabBtn: /** @type {HTMLButtonElement} */ (document.querySelector("#theoryTabBtn")),
  discoveryTab: document.querySelector("#discoveryTab"),
  theoryTab: document.querySelector("#theoryTab")
};

const ctx = elements.simCanvas.getContext("2d");

const state = {
  massTableKg: 2.5,
  massHangingKg: 1.2,
  initialVelocityMps: 0,
  frictionEnabled: true,
  mu: 0.2,
  showForces: true,
  running: false,
  timeS: 0,
  displacementM: 0,
  velocityMps: 0,
  lastFrameMs: null,
  nextTrialId: 1,
  records: /** @type {Array<{id:number,massTableKg:number,massHangingKg:number,mu:number,accel:number,tension:number,moved:boolean}>} */ ([])
};

let sceneLayout = {
  travelMinM: -1,
  travelMaxM: 1
};

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  elements.themeToggle.textContent = theme === "light" ? "Dark mode" : "Light mode";
}

function initTheme() {
  const saved = window.localStorage.getItem("te-theme");
  const theme = saved === "dark" || saved === "light" ? saved : "light";
  applyTheme(theme);
}

/**
 * @param {string} message
 * @param {"default"|"warn"} tone
 */
function setStatus(message, tone = "default") {
  elements.statusText.textContent = message;
  elements.statusText.classList.toggle("warn", tone === "warn");
}

function syncInputsFromState() {
  elements.massTable.value = String(state.massTableKg);
  elements.massHanging.value = String(state.massHangingKg);
  elements.initialVelocity.value = String(state.initialVelocityMps);
  elements.frictionEnabled.checked = state.frictionEnabled;
  elements.mu.value = String(state.mu);
  elements.showForces.checked = state.showForces;
  elements.initialVelocityValue.textContent = `${fmt(state.initialVelocityMps)} m/s`;
  elements.muValue.textContent = fmt(state.mu, 2);
  elements.mu.disabled = !state.frictionEnabled;
}

function resetMotion() {
  state.running = false;
  state.lastFrameMs = null;
  state.timeS = 0;
  state.displacementM = 0;
  state.velocityMps = state.initialVelocityMps;
}

function readInputsIntoState() {
  state.massTableKg = clamp(Number(elements.massTable.value) || 0, 0.2, 2500);
  state.massHangingKg = clamp(Number(elements.massHanging.value) || 0, 0.1, 500);
  state.initialVelocityMps = clamp(Number(elements.initialVelocity.value) || 0, -4, 4);
  state.frictionEnabled = elements.frictionEnabled.checked;
  state.mu = clamp(Number(elements.mu.value) || 0, 0, 1);
  state.showForces = elements.showForces.checked;

  elements.initialVelocityValue.textContent = `${fmt(state.initialVelocityMps)} m/s`;
  elements.muValue.textContent = fmt(state.mu, 2);
  elements.mu.disabled = !state.frictionEnabled;
}

/**
 * @returns {ReturnType<typeof calculateHalfAtwoodFromRest>}
 */
function fromRestSolution() {
  return calculateHalfAtwoodFromRest({
    massTableKg: state.massTableKg,
    massHangingKg: state.massHangingKg,
    mu: state.mu,
    frictionEnabled: state.frictionEnabled,
    gravity: GRAVITY_MPS2,
    targetDistanceM: 1
  });
}

/**
 * @returns {ReturnType<typeof resolveDynamicForces>}
 */
function dynamicSolution() {
  return resolveDynamicForces({
    massTableKg: state.massTableKg,
    massHangingKg: state.massHangingKg,
    mu: state.mu,
    frictionEnabled: state.frictionEnabled,
    gravity: GRAVITY_MPS2,
    velocityMps: state.velocityMps
  });
}

function updateReadouts() {
  const rest = fromRestSolution();
  const dynamic = dynamicSolution();

  elements.accelReadout.textContent = `${signed(dynamic.accelerationMps2)} m/s²`;
  elements.restAccelReadout.textContent = `${fmt(rest.accelerationMps2)} m/s²`;
  elements.tensionReadout.textContent = `${fmt(dynamic.tensionN)} N`;

  if (!state.frictionEnabled) {
    elements.frictionReadout.textContent = "0.00 N (off)";
  } else {
    const direction = dynamic.frictionSignedN > 0 ? "right" : dynamic.frictionSignedN < 0 ? "left" : "none";
    elements.frictionReadout.textContent = `${fmt(dynamic.frictionMagnitudeN)} N (${direction})`;
  }

  elements.netReadout.textContent = `${signed(dynamic.netForceN)} N`;
  elements.velocityReadout.textContent = `${signed(state.velocityMps)} m/s`;
  elements.displacementReadout.textContent = `${fmt(state.displacementM)} m`;
  elements.timeReadout.textContent = `${fmt(state.timeS)} s`;
}

function renderTrialTable() {
  if (!elements.trialTableBody) {
    return;
  }

  if (!state.records.length) {
    elements.trialTableBody.innerHTML = '<tr><td colspan="7">No trials yet.</td></tr>';
    return;
  }

  elements.trialTableBody.innerHTML = state.records
    .map((record) => {
      return `<tr>
        <td>${record.id}</td>
        <td>${fmt(record.massTableKg, 2)}</td>
        <td>${fmt(record.massHangingKg, 2)}</td>
        <td>${fmt(record.mu, 2)}</td>
        <td>${fmt(record.accel, 3)}</td>
        <td>${fmt(record.tension, 2)}</td>
        <td>${record.moved ? "Moves" : "Stuck"}</td>
      </tr>`;
    })
    .join("");
}

/**
 * @param {number} value
 * @returns {number}
 */
function arrowScale(value) {
  return clamp(Math.abs(value), 0.1, 2.5);
}

/**
 * @param {number} width
 * @param {number} height
 */
function getLayout(width, height) {
  const tableTopY = height * 0.34;
  const trackStartX = Math.max(42, width * 0.04);
  const edgeX = width * 0.78;
  const pulleyRadius = Math.max(28, Math.min(38, width * 0.038));
  const pulleyX = edgeX + pulleyRadius + 4;
  const pulleyY = tableTopY + pulleyRadius;
  const blockW = Math.max(112, Math.min(146, width * 0.125));
  const blockH = Math.max(54, Math.min(72, height * 0.13));
  const blockBaseX = trackStartX + 24;
  const hangingW = Math.max(74, Math.min(100, width * 0.085));
  const hangingH = Math.max(70, Math.min(94, height * 0.16));
  const rightTangentY = pulleyY;
  const hangingStartY = rightTangentY + 10;

  const minBlockX = trackStartX + 6;
  const maxBlockX = edgeX - blockW - 8;
  const minHangingY = hangingStartY;
  const maxHangingY = height - 24 - hangingH;

  const availableHorizontalPx = Math.max(40, maxBlockX - blockBaseX);
  const availableVerticalPx = Math.max(40, maxHangingY - hangingStartY);
  const availableTravelPx = Math.min(availableHorizontalPx, availableVerticalPx);
  const ppm = clamp(availableTravelPx / 2.1, 90, 220);

  const travelMinM = 0;
  const travelMaxM = Math.max(0.2, Math.min((maxBlockX - blockBaseX) / ppm, (maxHangingY - hangingStartY) / ppm));

  return {
    tableTopY,
    trackStartX,
    edgeX,
    pulleyX,
    pulleyY,
    pulleyRadius,
    blockW,
    blockH,
    blockBaseX,
    hangingW,
    hangingH,
    hangingStartY,
    ppm,
    travelMinM,
    travelMaxM
  };
}

/**
 * @param {number} fromX
 * @param {number} fromY
 * @param {number} toX
 * @param {number} toY
 * @param {string} color
 */
function drawArrow(fromX, fromY, toX, toY, color) {
  const headLength = 10;
  const angle = Math.atan2(toY - fromY, toX - fromX);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 3.6;

  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(toX - headLength * Math.cos(angle - Math.PI / 7), toY - headLength * Math.sin(angle - Math.PI / 7));
  ctx.lineTo(toX - headLength * Math.cos(angle + Math.PI / 7), toY - headLength * Math.sin(angle + Math.PI / 7));
  ctx.closePath();
  ctx.fill();
}

/**
 * Draws labels like F with a true subscript letter, without underscore syntax.
 * @param {number} x
 * @param {number} y
 * @param {string} subscript
 * @param {string} color
 */
function drawForceLabel(x, y, subscript, color) {
  ctx.fillStyle = color;
  ctx.font = "700 18px IBM Plex Sans";
  ctx.fillText("F", x, y);
  const mainWidth = ctx.measureText("F").width;
  ctx.font = "700 12px IBM Plex Sans";
  ctx.fillText(subscript, x + mainWidth + 1, y + 5);
}

/**
 * @param {{
 * x:number,
 * y:number,
 * w:number,
 * h:number,
 * title:string,
 * vectors:Array<{dx:number,dy:number,color:string,sub:string,magnitudeN:number}>,
 * isDark:boolean
 * }} panel
 */
function drawFbdPanel(panel) {
  const panelBg = panel.isDark ? "rgba(27,35,48,0.9)" : "rgba(247,252,255,0.95)";
  const panelBorder = panel.isDark ? "rgba(229,204,143,0.28)" : "rgba(94,128,142,0.35)";
  const textColor = panel.isDark ? "#eef2f9" : "#123140";

  ctx.fillStyle = panelBg;
  ctx.strokeStyle = panelBorder;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.roundRect(panel.x, panel.y, panel.w, panel.h, 10);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = textColor;
  ctx.font = "700 15px IBM Plex Sans";
  ctx.fillText(panel.title, panel.x + 10, panel.y + 22);

  const cx = panel.x + panel.w * 0.5;
  const cy = panel.y + panel.h * 0.56;

  ctx.fillStyle = panel.isDark ? "#9aaabd" : "#d3e9f2";
  ctx.strokeStyle = panel.isDark ? "#d6deea" : "#4c5f72";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(cx - 18, cy - 18, 36, 36, 6);
  ctx.fill();
  ctx.stroke();

  for (const vector of panel.vectors) {
    if (Math.abs(vector.magnitudeN) < 1e-6) {
      continue;
    }
    const length = 18 + 28 * arrowScale(vector.magnitudeN / 20);
    const mag = Math.max(12, length);
    const toX = cx + vector.dx * mag;
    const toY = cy + vector.dy * mag;
    drawArrow(cx, cy, toX, toY, vector.color);
    drawForceLabel(toX + 6, toY - 2, vector.sub, textColor);
  }
}

function resizeCanvas() {
  const ratio = window.devicePixelRatio || 1;
  const width = Math.floor(elements.simCanvas.clientWidth * ratio);
  const height = Math.floor(elements.simCanvas.clientHeight * ratio);

  if (elements.simCanvas.width !== width || elements.simCanvas.height !== height) {
    elements.simCanvas.width = width;
    elements.simCanvas.height = height;
  }

  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function renderScene() {
  resizeCanvas();

  const width = elements.simCanvas.clientWidth;
  const height = elements.simCanvas.clientHeight;
  sceneLayout = getLayout(width, height);

  state.displacementM = clamp(state.displacementM, sceneLayout.travelMinM, sceneLayout.travelMaxM);

  const xPx = state.displacementM * sceneLayout.ppm;
  const blockX = sceneLayout.blockBaseX + xPx;
  const blockY = sceneLayout.tableTopY - sceneLayout.blockH;

  const rightTangentX = sceneLayout.pulleyX + sceneLayout.pulleyRadius;
  const hangX = rightTangentX - sceneLayout.hangingW / 2;
  const hangY = sceneLayout.hangingStartY + xPx;
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  const labelColor = isDark ? "#eef2f9" : "#123140";

  ctx.clearRect(0, 0, width, height);

  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, isDark ? "#1a202c" : "#f8fcff");
  sky.addColorStop(1, isDark ? "#0d1118" : "#eef6fb");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  const tableGradient = ctx.createLinearGradient(0, sceneLayout.tableTopY + 8, 0, sceneLayout.tableTopY + 72);
  tableGradient.addColorStop(0, isDark ? "#5a4b3b" : "#f2dbc0");
  tableGradient.addColorStop(1, isDark ? "#443828" : "#e0c3a2");

  ctx.fillStyle = tableGradient;
  ctx.fillRect(sceneLayout.trackStartX - 30, sceneLayout.tableTopY + 8, sceneLayout.edgeX - sceneLayout.trackStartX + 35, 54);

  ctx.strokeStyle = isDark ? "#9b7c58" : "#6b5540";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(sceneLayout.trackStartX - 15, sceneLayout.tableTopY + 8);
  ctx.lineTo(sceneLayout.edgeX + 3, sceneLayout.tableTopY + 8);
  ctx.stroke();

  ctx.strokeStyle = isDark ? "#98a6b8" : "#5b7084";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(sceneLayout.edgeX + 2, sceneLayout.tableTopY - 86);
  ctx.lineTo(sceneLayout.edgeX + 2, sceneLayout.tableTopY + 12);
  ctx.stroke();

  ctx.save();
  ctx.translate(sceneLayout.pulleyX, sceneLayout.pulleyY);
  ctx.rotate((state.displacementM * sceneLayout.ppm) / (sceneLayout.pulleyRadius || 1));
  ctx.fillStyle = isDark ? "#7d899a" : "#9aaabd";
  ctx.beginPath();
  ctx.arc(0, 0, sceneLayout.pulleyRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = isDark ? "#c0cad7" : "#3c4f62";
  ctx.lineWidth = 2;
  ctx.stroke();

  for (let i = 0; i < 6; i += 1) {
    ctx.rotate(Math.PI / 3);
    ctx.strokeStyle = isDark ? "#b8c3d2" : "#5b6f84";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(sceneLayout.pulleyRadius - 8, 0);
    ctx.stroke();
  }

  ctx.fillStyle = isDark ? "#d0d7e3" : "#2e3f50";
  ctx.beginPath();
  ctx.arc(0, 0, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const blockAttachX = blockX + sceneLayout.blockW;
  const blockAttachY = sceneLayout.tableTopY;
  const topTangentX = sceneLayout.edgeX;
  const topTangentY = sceneLayout.tableTopY;

  ctx.strokeStyle = isDark ? "#d6deea" : "#4c5f72";
  ctx.lineWidth = 2.8;
  ctx.beginPath();
  ctx.moveTo(blockAttachX, blockAttachY);
  ctx.lineTo(topTangentX, topTangentY);
  ctx.arc(sceneLayout.pulleyX, sceneLayout.pulleyY, sceneLayout.pulleyRadius, -Math.PI / 2, 0, false);
  ctx.lineTo(rightTangentX, hangY);
  ctx.stroke();

  // Pulley mount at the edge for clearer visual anchoring.
  ctx.strokeStyle = isDark ? "#aeb9c8" : "#5b7084";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(sceneLayout.edgeX + 2, sceneLayout.tableTopY);
  ctx.lineTo(sceneLayout.pulleyX - sceneLayout.pulleyRadius, sceneLayout.tableTopY);
  ctx.stroke();

  const blockGradient = ctx.createLinearGradient(blockX, blockY, blockX, blockY + sceneLayout.blockH);
  blockGradient.addColorStop(0, "#7cc4db");
  blockGradient.addColorStop(1, "#4f97b5");
  ctx.fillStyle = blockGradient;
  ctx.fillRect(blockX, blockY, sceneLayout.blockW, sceneLayout.blockH);
  ctx.strokeStyle = "#1a5b74";
  ctx.lineWidth = 2;
  ctx.strokeRect(blockX, blockY, sceneLayout.blockW, sceneLayout.blockH);

  const hangingGradient = ctx.createLinearGradient(hangX, hangY, hangX, hangY + sceneLayout.hangingH);
  hangingGradient.addColorStop(0, "#f5c885");
  hangingGradient.addColorStop(1, "#d49840");
  ctx.fillStyle = hangingGradient;
  ctx.fillRect(hangX, hangY, sceneLayout.hangingW, sceneLayout.hangingH);
  ctx.strokeStyle = "#7a4f12";
  ctx.lineWidth = 2;
  ctx.strokeRect(hangX, hangY, sceneLayout.hangingW, sceneLayout.hangingH);

  ctx.font = "700 20px IBM Plex Sans";
  ctx.fillStyle = labelColor;
  ctx.fillText("mₜ", blockX + sceneLayout.blockW / 2 - 10, blockY + sceneLayout.blockH / 2 + 5);
  ctx.fillText("mₕ", hangX + sceneLayout.hangingW / 2 - 10, hangY + sceneLayout.hangingH / 2 + 5);

  const dynamic = dynamicSolution();

  if (state.showForces) {
    const frictionMag = state.frictionEnabled ? dynamic.frictionMagnitudeN : 0;
    const frictionDx = dynamic.frictionSignedN > 0 ? 1 : -1;
    const lowerFbdY = sceneLayout.tableTopY + 96;
    const tableFbdX = 14;
    const tableFbdW = 260;
    const hangingFbdW = 240;
    const fbdGap = 16;

    drawFbdPanel({
      x: tableFbdX,
      y: lowerFbdY,
      w: tableFbdW,
      h: 150,
      title: "FBD: Table Block",
      isDark,
      vectors: [
        { dx: 0, dy: -1, color: "#25a3d8", sub: "N", magnitudeN: state.massTableKg * GRAVITY_MPS2 },
        { dx: 0, dy: 1, color: "#f28f54", sub: "g", magnitudeN: state.massTableKg * GRAVITY_MPS2 },
        { dx: 1, dy: 0, color: "#4b7f9d", sub: "t", magnitudeN: dynamic.tensionN },
        { dx: frictionDx, dy: 0, color: "#f3b340", sub: "f", magnitudeN: frictionMag }
      ]
    });

    drawFbdPanel({
      x: tableFbdX + tableFbdW + fbdGap,
      y: lowerFbdY,
      w: hangingFbdW,
      h: 132,
      title: "FBD: Hanging Mass",
      isDark,
      vectors: [
        { dx: 0, dy: -1, color: "#4b7f9d", sub: "t", magnitudeN: dynamic.tensionN },
        { dx: 0, dy: 1, color: "#f28f54", sub: "g", magnitudeN: state.massHangingKg * GRAVITY_MPS2 }
      ]
    });
  }

  ctx.font = "12px IBM Plex Sans";
  ctx.fillStyle = isDark ? "#d8dfeb" : "#2b4b58";
  ctx.fillText(`x = ${fmt(state.displacementM)} m`, 18, height - 20);
  ctx.fillText(`t = ${fmt(state.timeS)} s`, 110, height - 20);
}

/**
 * @param {number} timestampMs
 */
function animate(timestampMs) {
  if (!state.running) {
    return;
  }

  if (state.lastFrameMs === null) {
    state.lastFrameMs = timestampMs;
  }

  const dt = Math.min(0.035, (timestampMs - state.lastFrameMs) / 1000);
  state.lastFrameMs = timestampMs;

  const dynamic = dynamicSolution();

  if (dynamic.mode === "static_hold" && Math.abs(state.velocityMps) <= VELOCITY_EPSILON) {
    state.velocityMps = 0;
    state.running = false;
    setStatus("Static friction holds the system at rest under current settings.", "warn");
  } else {
    const previousDisplacement = state.displacementM;
    state.velocityMps += dynamic.accelerationMps2 * dt;
    state.displacementM += state.velocityMps * dt;
    if (state.displacementM < sceneLayout.travelMinM) {
      state.displacementM = sceneLayout.travelMinM;
      if (state.velocityMps < 0) {
        state.velocityMps = 0;
      }
    }
    state.timeS += dt;

    if (state.displacementM >= sceneLayout.travelMaxM) {
      state.displacementM = clamp(state.displacementM, sceneLayout.travelMinM, sceneLayout.travelMaxM);
      state.running = false;
      state.velocityMps = 0;
      if (Math.abs(state.displacementM - previousDisplacement) > 1e-4 || state.timeS > 0.05) {
        setStatus("Motion reached a physical boundary. Press Reset for another run.", "warn");
      } else {
        setStatus("Simulation paused at limit. Press Reset to restart.", "warn");
      }
    }
  }

  updateReadouts();
  renderScene();

  if (state.running) {
    window.requestAnimationFrame(animate);
  }
}

function startRun() {
  if (state.running) {
    return;
  }

  const rest = fromRestSolution();
  const dynamic = dynamicSolution();

  const atMaxAndPushingPositive = state.displacementM >= sceneLayout.travelMaxM - 1e-6 && dynamic.accelerationMps2 >= 0;
  const atMinAndPushingNegative = state.displacementM <= sceneLayout.travelMinM + 1e-6 && dynamic.accelerationMps2 <= 0;
  if (atMaxAndPushingPositive || atMinAndPushingNegative) {
    state.displacementM = 0;
    state.timeS = 0;
    state.velocityMps = state.initialVelocityMps;
  }

  if (Math.abs(state.velocityMps) <= VELOCITY_EPSILON && !rest.moved) {
    setStatus("No motion starts from rest: drive force is not greater than friction.", "warn");
    updateReadouts();
    renderScene();
    return;
  }

  state.running = true;
  state.lastFrameMs = null;
  setStatus("Simulation running. Observe acceleration, tension, and friction direction.");
  window.requestAnimationFrame(animate);
}

function pauseRun() {
  state.running = false;
  state.lastFrameMs = null;
  setStatus("Paused. You can adjust parameters or resume.");
}

function resetRun() {
  resetMotion();
  setStatus("Reset complete. Ready for a new trial.");
  updateReadouts();
  renderScene();
}

function recordTrial() {
  const rest = fromRestSolution();
  state.records.unshift({
    id: state.nextTrialId,
    massTableKg: state.massTableKg,
    massHangingKg: state.massHangingKg,
    mu: state.frictionEnabled ? state.mu : 0,
    accel: rest.accelerationMps2,
    tension: rest.tensionN,
    moved: rest.moved
  });
  state.nextTrialId += 1;

  renderTrialTable();
  setStatus("Trial recorded in the table.");
}

function clearTrials() {
  state.records = [];
  state.nextTrialId = 1;
  renderTrialTable();
  setStatus("Trial table cleared.");
}

/**
 * @param {"baseline"|"packet"|"cliff"} preset
 */
function applyPreset(preset) {
  if (preset === "baseline") {
    state.massTableKg = 2.5;
    state.massHangingKg = 1.2;
    state.frictionEnabled = false;
    state.mu = 0.2;
    state.initialVelocityMps = 0;
    setStatus("Loaded frictionless baseline.");
  } else if (preset === "packet") {
    state.massTableKg = 2.5;
    state.massHangingKg = 1.8;
    state.frictionEnabled = true;
    state.mu = 0.2;
    state.initialVelocityMps = 0;
    setStatus("Loaded packet-style friction scenario.");
  } else {
    state.massTableKg = 1000;
    state.massHangingKg = 50;
    state.frictionEnabled = false;
    state.mu = 0.2;
    state.initialVelocityMps = 0;
    setStatus("Loaded car + rock analog (packet-style Atwood context).");
  }

  resetMotion();
  syncInputsFromState();
  updateReadouts();
  renderScene();
}

/**
 * @param {"discovery"|"theory"} tab
 */
function setTab(tab) {
  const discoveryActive = tab === "discovery";

  elements.discoveryTabBtn.classList.toggle("active", discoveryActive);
  elements.theoryTabBtn.classList.toggle("active", !discoveryActive);

  elements.discoveryTabBtn.setAttribute("aria-selected", String(discoveryActive));
  elements.theoryTabBtn.setAttribute("aria-selected", String(!discoveryActive));

  elements.discoveryTab.classList.toggle("active", discoveryActive);
  elements.theoryTab.classList.toggle("active", !discoveryActive);
}

function bindEvents() {
  const refreshFromInputs = () => {
    const wasRunning = state.running;
    state.running = false;
    readInputsIntoState();
    if (!wasRunning) {
      state.velocityMps = state.initialVelocityMps;
      state.timeS = 0;
      state.displacementM = 0;
    }
    updateReadouts();
    renderScene();
  };

  const inputIds = [
    "massTable",
    "massHanging",
    "initialVelocity",
    "frictionEnabled",
    "mu",
    "showForces"
  ];

  for (const id of inputIds) {
    const element = /** @type {HTMLInputElement} */ (document.querySelector(`#${id}`));
    element.addEventListener("input", refreshFromInputs);
    element.addEventListener("change", refreshFromInputs);
  }

  elements.startBtn.addEventListener("click", () => {
    readInputsIntoState();
    startRun();
  });

  elements.pauseBtn.addEventListener("click", pauseRun);
  elements.resetBtn.addEventListener("click", () => {
    readInputsIntoState();
    resetRun();
  });

  elements.recordBtn.addEventListener("click", () => {
    readInputsIntoState();
    recordTrial();
  });

  elements.clearBtn.addEventListener("click", clearTrials);
  elements.themeToggle.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
    const next = current === "dark" ? "light" : "dark";
    applyTheme(next);
    window.localStorage.setItem("te-theme", next);
    renderScene();
  });

  document.querySelectorAll("[data-preset]").forEach((button) => {
    button.addEventListener("click", () => {
      const preset = button.getAttribute("data-preset");
      if (preset === "baseline" || preset === "packet" || preset === "cliff") {
        applyPreset(preset);
      }
    });
  });

  elements.discoveryTabBtn.addEventListener("click", () => setTab("discovery"));
  elements.theoryTabBtn.addEventListener("click", () => setTab("theory"));

  window.addEventListener("resize", () => {
    renderScene();
  });
}

function init() {
  initTheme();
  syncInputsFromState();
  resetMotion();
  bindEvents();
  renderTrialTable();
  updateReadouts();
  renderScene();
  setStatus("Ready. Use presets for quick discovery runs, then record trials.");
}

init();
