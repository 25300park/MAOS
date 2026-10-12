import {
  HmacAidosAuthorityBackend,
  type AidosAuthorityRuntimeConfig,
} from "./aidos-authority-runtime.js";
import {
  ExternalAidosAuthorityAdapter,
  type AidosAuthorityReadPort,
} from "./routing-authority-read-ports.js";

export function createExternalAidosAuthorityReadPort(
  config: AidosAuthorityRuntimeConfig,
): AidosAuthorityReadPort {
  return new ExternalAidosAuthorityAdapter(
    new HmacAidosAuthorityBackend(config),
  );
}
