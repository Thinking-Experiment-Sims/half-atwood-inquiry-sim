export const VELOCITY_EPSILON = 1e-4;

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * @param {{massTableKg:number,massHangingKg:number,mu:number,frictionEnabled:boolean,gravity:number,targetDistanceM:number}} input
 * @returns {{
 * accelerationMps2:number,
 * tensionN:number,
 * frictionN:number,
 * netForceN:number,
 * driveForceN:number,
 * moved:boolean,
 * timeToTargetS:number|null,
 * mode:"frictionless"|"kinetic"|"static_hold"
 * }}
 */
export function calculateHalfAtwoodFromRest(input) {
  const massTableKg = Math.max(0, input.massTableKg);
  const massHangingKg = Math.max(0, input.massHangingKg);
  const gravity = Math.max(0, input.gravity);
  const mu = Math.max(0, input.mu);
  const targetDistanceM = Math.max(0, input.targetDistanceM);

  const totalMassKg = massTableKg + massHangingKg;
  const driveForceN = massHangingKg * gravity;

  if (totalMassKg <= 0) {
    return {
      accelerationMps2: 0,
      tensionN: 0,
      frictionN: 0,
      netForceN: 0,
      driveForceN,
      moved: false,
      timeToTargetS: null,
      mode: "static_hold"
    };
  }

  if (!input.frictionEnabled || mu === 0) {
    const accelerationMps2 = driveForceN / totalMassKg;
    const tensionN = massHangingKg * (gravity - accelerationMps2);
    const timeToTargetS = accelerationMps2 > 0 && targetDistanceM > 0
      ? Math.sqrt((2 * targetDistanceM) / accelerationMps2)
      : null;

    return {
      accelerationMps2,
      tensionN,
      frictionN: 0,
      netForceN: driveForceN,
      driveForceN,
      moved: accelerationMps2 > 0,
      timeToTargetS,
      mode: "frictionless"
    };
  }

  const frictionN = mu * massTableKg * gravity;

  if (driveForceN <= frictionN) {
    return {
      accelerationMps2: 0,
      tensionN: driveForceN,
      frictionN: driveForceN,
      netForceN: 0,
      driveForceN,
      moved: false,
      timeToTargetS: null,
      mode: "static_hold"
    };
  }

  const netForceN = driveForceN - frictionN;
  const accelerationMps2 = netForceN / totalMassKg;
  const tensionN = massHangingKg * (gravity - accelerationMps2);
  const timeToTargetS = accelerationMps2 > 0 && targetDistanceM > 0
    ? Math.sqrt((2 * targetDistanceM) / accelerationMps2)
    : null;

  return {
    accelerationMps2,
    tensionN,
    frictionN,
    netForceN,
    driveForceN,
    moved: accelerationMps2 > 0,
    timeToTargetS,
    mode: "kinetic"
  };
}

/**
 * @param {{massTableKg:number,massHangingKg:number,mu:number,frictionEnabled:boolean,gravity:number,velocityMps:number}} input
 * @returns {{
 * accelerationMps2:number,
 * tensionN:number,
 * frictionSignedN:number,
 * frictionMagnitudeN:number,
 * netForceN:number,
 * driveForceN:number,
 * mode:"frictionless"|"kinetic"|"static_hold"
 * }}
 */
export function resolveDynamicForces(input) {
  const massTableKg = Math.max(0, input.massTableKg);
  const massHangingKg = Math.max(0, input.massHangingKg);
  const gravity = Math.max(0, input.gravity);
  const mu = Math.max(0, input.mu);
  const totalMassKg = massTableKg + massHangingKg;
  const driveForceN = massHangingKg * gravity;

  if (totalMassKg <= 0) {
    return {
      accelerationMps2: 0,
      tensionN: 0,
      frictionSignedN: 0,
      frictionMagnitudeN: 0,
      netForceN: 0,
      driveForceN,
      mode: "static_hold"
    };
  }

  if (!input.frictionEnabled || mu === 0) {
    const accelerationMps2 = driveForceN / totalMassKg;
    return {
      accelerationMps2,
      tensionN: massHangingKg * (gravity - accelerationMps2),
      frictionSignedN: 0,
      frictionMagnitudeN: 0,
      netForceN: driveForceN,
      driveForceN,
      mode: "frictionless"
    };
  }

  const kineticMagnitudeN = mu * massTableKg * gravity;
  const speed = input.velocityMps;

  if (Math.abs(speed) <= VELOCITY_EPSILON) {
    if (driveForceN <= kineticMagnitudeN) {
      return {
        accelerationMps2: 0,
        tensionN: driveForceN,
        frictionSignedN: -driveForceN,
        frictionMagnitudeN: driveForceN,
        netForceN: 0,
        driveForceN,
        mode: "static_hold"
      };
    }

    const netForceN = driveForceN - kineticMagnitudeN;
    const accelerationMps2 = netForceN / totalMassKg;
    return {
      accelerationMps2,
      tensionN: massHangingKg * (gravity - accelerationMps2),
      frictionSignedN: -kineticMagnitudeN,
      frictionMagnitudeN: kineticMagnitudeN,
      netForceN,
      driveForceN,
      mode: "kinetic"
    };
  }

  const frictionSignedN = speed > 0 ? -kineticMagnitudeN : kineticMagnitudeN;
  const netForceN = driveForceN + frictionSignedN;
  const accelerationMps2 = netForceN / totalMassKg;

  return {
    accelerationMps2,
    tensionN: massHangingKg * (gravity - accelerationMps2),
    frictionSignedN,
    frictionMagnitudeN: kineticMagnitudeN,
    netForceN,
    driveForceN,
    mode: "kinetic"
  };
}
