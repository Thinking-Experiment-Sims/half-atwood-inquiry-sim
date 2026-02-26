import test from "node:test";
import assert from "node:assert/strict";

import {
  END_CORRECTION_FACTOR,
  firstHarmonicAirLengthM,
  inferredSpeedMps,
  qualityBand,
  resonanceStrength,
  speedOfSoundFromTemp
} from "../src/resonancePhysics.js";

function nearlyEqual(actual, expected, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `Expected ${actual} to be near ${expected}`);
}

test("temperature model returns expected room-speed approximation", () => {
  nearlyEqual(speedOfSoundFromTemp(20), 343);
  nearlyEqual(speedOfSoundFromTemp(0), 331);
});

test("first harmonic length and inferred speed are inverse operations", () => {
  const frequencyHz = 384;
  const speedMps = 343;
  const tubeDiameterM = 0.04;

  const lengthM = firstHarmonicAirLengthM({ frequencyHz, speedMps, tubeDiameterM });
  const inferred = inferredSpeedMps({ frequencyHz, airLengthM: lengthM, tubeDiameterM });

  nearlyEqual(inferred, speedMps);
});

test("resonance strength peaks at target and falls as offset increases", () => {
  const targetLengthM = 0.21;

  const atTarget = resonanceStrength({ airLengthM: targetLengthM, targetLengthM });
  const close = resonanceStrength({ airLengthM: targetLengthM + 0.01, targetLengthM });
  const far = resonanceStrength({ airLengthM: targetLengthM + 0.07, targetLengthM });

  nearlyEqual(atTarget, 1);
  assert.ok(close < atTarget);
  assert.ok(far < close);
});

test("quality bands map thresholds correctly", () => {
  const high = qualityBand(0.95);
  const fair = qualityBand(0.85);
  const low = qualityBand(0.4);

  assert.equal(high.label, "High");
  assert.equal(high.accepted, true);

  assert.equal(fair.label, "Fair");
  assert.equal(fair.accepted, false);

  assert.equal(low.label, "Off peak");
  assert.equal(low.accepted, false);
});

test("end correction factor remains aligned to closed-pipe model", () => {
  nearlyEqual(END_CORRECTION_FACTOR, 0.3);
});
