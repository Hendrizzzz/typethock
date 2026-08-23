import { describe, expect, it } from "vitest";

import { planThock } from "./keyboardSound";

// Deterministic LCG so jitter ranges are exercised reproducibly.
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

describe("planThock", () => {
  it("keeps every planned parameter inside its design envelope", () => {
    const random = seededRandom(42);
    for (const kind of ["key", "space", "backspace"] as const) {
      for (let index = 0; index < 500; index += 1) {
        const plan = planThock(kind, random);
        expect(plan.bodyStartHz).toBeGreaterThanOrEqual(130);
        expect(plan.bodyStartHz).toBeLessThanOrEqual(195);
        expect(plan.bodyRestHz).toBeGreaterThanOrEqual(78);
        expect(plan.bodyRestHz).toBeLessThan(plan.bodyStartHz);
        expect(plan.bodyDecaySeconds).toBeGreaterThanOrEqual(0.1);
        expect(plan.bodyDecaySeconds).toBeLessThanOrEqual(0.19);
        expect(plan.subHz).toBeGreaterThanOrEqual(55);
        expect(plan.subHz).toBeLessThanOrEqual(88);
        expect(plan.subPeakGain).toBeGreaterThan(0);
        expect(plan.subPeakGain).toBeLessThanOrEqual(0.58);
        expect(plan.subDecaySeconds).toBeGreaterThanOrEqual(0.045);
        expect(plan.subDecaySeconds).toBeLessThanOrEqual(0.075);
        expect(plan.tapCutoffHz).toBeGreaterThanOrEqual(950);
        expect(plan.tapCutoffHz).toBeLessThanOrEqual(1600);
        expect(plan.tapPeakGain).toBeGreaterThan(0);
        expect(plan.tapPeakGain).toBeLessThan(0.22);
        expect(plan.startDelaySeconds).toBeGreaterThanOrEqual(0);
        expect(plan.startDelaySeconds).toBeLessThan(0.01);
      }
    }
  });

  it("keeps spaces deeper than keys on average", () => {
    const random = seededRandom(7);
    const meanOf = (
      kind: "key" | "space",
      pick: (plan: ReturnType<typeof planThock>) => number,
    ): number => {
      let total = 0;
      for (let index = 0; index < 500; index += 1) {
        total += pick(planThock(kind, random));
      }
      return total / 500;
    };
    expect(
      meanOf("space", (plan) => plan.bodyStartHz),
    ).toBeLessThan(meanOf("key", (plan) => plan.bodyStartHz));
    expect(meanOf("space", (plan) => plan.subHz)).toBeLessThan(
      meanOf("key", (plan) => plan.subHz),
    );
    expect(
      meanOf("space", (plan) => plan.bodyDecaySeconds),
    ).toBeGreaterThan(meanOf("key", (plan) => plan.bodyDecaySeconds));
  });

  it("varies between consecutive presses of the same kind", () => {
    const random = seededRandom(1234);
    const seen = new Set<string>();
    for (let index = 0; index < 50; index += 1) {
      const plan = planThock("key", random);
      seen.add(JSON.stringify(plan));
    }
    expect(seen.size).toBeGreaterThan(40);
  });
});
