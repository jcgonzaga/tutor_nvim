import { spawnSync } from "node:child_process";
import { afterAll, describe, expect, it } from "vitest";
import { cleanup, runReal, runSimulated, type Scenario } from "./oracle.test-util";
import { SCENARIOS } from "./oracle.scenarios";

const hasBash = process.platform === "linux" && spawnSync("bash", ["-c", "true"]).status === 0;
const roots: string[] = [];
afterAll(() => roots.forEach(cleanup));

describe.skipIf(!hasBash)(
  "the simulated shell agrees with real bash (GNU coreutils, C locale)",
  () => {
    it("has scenarios", () => {
      expect(SCENARIOS.length).toBeGreaterThan(40);
    });
    for (const scenario of SCENARIOS as readonly Scenario[]) {
      it(scenario.name, () => {
        const real = runReal(scenario);
        roots.push(real.root);
        const simulated = runSimulated(scenario);
        expect(simulated.results).toEqual(real.results);
        expect(simulated.files).toEqual(real.files);
      });
    }
  },
);
