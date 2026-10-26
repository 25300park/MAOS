import type {
  CanonicalWorkRequestInput,
  InvalidateWorkRequestInput,
} from "./work-request-contracts.js";
import type { PostgresWorkRequestRepository } from "./work-request-repository.js";

export class WorkRequestIntakeService {
  constructor(private readonly repository: PostgresWorkRequestRepository) {}
  registerRequest(input: CanonicalWorkRequestInput) {
    return this.repository.registerRequest(input);
  }
  invalidateRequest(input: InvalidateWorkRequestInput) {
    return this.repository.invalidateRequest(input);
  }
}
