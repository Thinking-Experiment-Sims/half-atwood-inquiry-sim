import test from "node:test";
import assert from "node:assert/strict";

import { calculateHalfAtwoodFromRest, resolveDynamicForces } from "../src/halfAtwoodPhysics.js";

function nearlyEqual(actual, expected, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `Expected ${actual} to be near ${expected}`);
}

test("frictionless half-atwood from rest matches closed-form acceleration", () => {
  const result = calculateHalfAtwoodFromRest({
    massTableKg: 2,
    massHangingKg: 1,
    mu: 0.35,
    frictionEnabled: false,
    gravity: 10,
    targetDistanceM: 2
  });

  nearlyEqual(result.accelerationMps2, 10 / 3);
  nearlyEqual(result.tensionN, 1 * (10 - 10 / 3));
  nearlyEqual(result.netForceN, 10);
  assert.equal(result.mode, "frictionless");
  assert.equal(result.moved, true);
});

test("from rest with friction can remain stuck if drive is too small", () => {
  const result = calculateHalfAtwoodFromRest({
    massTableKg: 6,
    massHangingKg: 1,
    mu: 0.2,
    frictionEnabled: true,
    gravity: 10,
    targetDistanceM: 2
  });

  assert.equal(result.mode, "static_hold");
  assert.equal(result.moved, false);
  nearlyEqual(result.accelerationMps2, 0);
  nearlyEqual(result.frictionN, 10);
  assert.equal(result.timeToTargetS, null);
});

test("dynamic forces oppose current velocity direction when friction is enabled", () => {
  const movingRight = resolveDynamicForces({
    massTableKg: 4,
    massHangingKg: 2,
    mu: 0.25,
    frictionEnabled: true,
    gravity: 10,
    velocityMps: 1.4
  });

  const movingLeft = resolveDynamicForces({
    massTableKg: 4,
    massHangingKg: 2,
    mu: 0.25,
    frictionEnabled: true,
    gravity: 10,
    velocityMps: -1.4
  });

  assert.ok(movingRight.frictionSignedN < 0);
  assert.ok(movingLeft.frictionSignedN > 0);
  assert.ok(movingLeft.accelerationMps2 > movingRight.accelerationMps2);
});
