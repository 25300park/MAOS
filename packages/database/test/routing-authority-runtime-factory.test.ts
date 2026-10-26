import assert from "node:assert/strict";
import test from "node:test";

import {
  createPhase15bRegistryAuthorityReadPort,
  createPhase15cClassificationAuthorityReadPort,
} from "../src/index.js";

const database = {
  exec: async () => undefined,
  query: async () => ({ rows: [] }),
  close: async () => undefined,
} as never;

test("public authority factories compose the canonical classification and registry adapters", () => {
  const classification =
    createPhase15cClassificationAuthorityReadPort(database);
  const registry = createPhase15bRegistryAuthorityReadPort(database, "STAGING");

  assert.equal(
    classification.constructor.name,
    "Phase15cClassificationAuthorityAdapter",
  );
  assert.equal(registry.constructor.name, "Phase15bRegistryAuthorityAdapter");
  for (const port of [classification, registry]) {
    assert.equal("create" in port, false);
    assert.equal("update" in port, false);
    assert.equal("delete" in port, false);
  }
});
