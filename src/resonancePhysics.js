export const END_CORRECTION_FACTOR = 0.3;

/**
 * Approximate speed of sound in dry air at atmospheric pressure.
 * @param {number} tempC
 * @returns {number}
 */
export function speedOfSoundFromTemp(tempC) {
  return 331 + 0.6 * tempC;
}

/**
 * @param {{frequencyHz: number, speedMps: number, tubeDiameterM: number}} input
 * @returns {number}
 */
export function firstHarmonicAirLengthM(input) {
  const effectiveLengthM = input.speedMps / (4 * input.frequencyHz);
  return effectiveLengthM - END_CORRECTION_FACTOR * input.tubeDiameterM;
}

/**
 * @param {{frequencyHz: number, airLengthM: number, tubeDiameterM: number}} input
 * @returns {number}
 */
export function inferredSpeedMps(input) {
  return 4 * input.frequencyHz * (input.airLengthM + END_CORRECTION_FACTOR * input.tubeDiameterM);
}

/**
 * Returns 0..1 resonance strength centered on the target length.
 * @param {{airLengthM: number, targetLengthM: number, bandwidthM?: number}} input
 * @returns {number}
 */
export function resonanceStrength(input) {
  const bandwidthM = input.bandwidthM ?? Math.max(0.008, input.targetLengthM * 0.06);
  const delta = input.airLengthM - input.targetLengthM;
  const exponent = -(delta * delta) / (2 * bandwidthM * bandwidthM);
  return Math.exp(exponent);
}

/**
 * @param {number} strength
 * @returns {{label: string, accepted: boolean, css: "good"|"ok"|"low"}}
 */
export function qualityBand(strength) {
  if (strength >= 0.94) {
    return {
      label: "High",
      accepted: true,
      css: "good"
    };
  }

  if (strength >= 0.8) {
    return {
      label: "Fair",
      accepted: false,
      css: "ok"
    };
  }

  return {
    label: "Off peak",
    accepted: false,
    css: "low"
  };
}
