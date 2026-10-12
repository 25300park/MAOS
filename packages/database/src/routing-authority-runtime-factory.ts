import {
  Phase15bRegistryAuthorityAdapter,
  Phase15cClassificationAuthorityAdapter,
  type ClassificationAuthorityReadPort,
  type RegistryAuthorityReadPort,
} from "./routing-authority-read-ports.js";
import { PostgresRequestClassificationRepository } from "./request-classification-repository.js";
import { RequestClassificationRuntime } from "./request-classification-runtime.js";
import type { RegistryFreshnessEnvironment } from "./registry-freshness-policy-repository.js";
import type { RuntimeDatabase } from "./postgres.js";
import { PostgresWorkRequestRepository } from "./work-request-repository.js";

export function createPhase15cClassificationAuthorityReadPort(
  database: RuntimeDatabase,
): ClassificationAuthorityReadPort {
  const requests = new PostgresWorkRequestRepository(database);
  const repository = new PostgresRequestClassificationRepository(
    database,
    requests,
  );
  return new Phase15cClassificationAuthorityAdapter(
    new RequestClassificationRuntime({
      findRequest: (id) => requests.findRequest(id),
      findClassificationHead: (id) => repository.findClassificationHead(id),
      listClassificationHistory: (id) =>
        repository.listClassificationHistory(id),
      findDomainConstraint: (id, version) =>
        repository.findDomainConstraint(id, version),
      appendClassification: (input) => repository.appendClassification(input),
    }),
  );
}

export function createPhase15bRegistryAuthorityReadPort(
  database: RuntimeDatabase,
  environment: RegistryFreshnessEnvironment,
): RegistryAuthorityReadPort {
  return Phase15bRegistryAuthorityAdapter.fromPostgres(database, environment);
}
