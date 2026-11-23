import { neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";
import { normalisePgUrl } from "./pg-url";

/**
 * DATABASE_TRANSPORT=websocket talks to Neon over WebSockets on port 443, for networks
 * (many campus and office Wi-Fi) that block Postgres' port 5432. Default is plain TCP.
 */
export const websocketTransport = () => process.env.DATABASE_TRANSPORT === "websocket";

export function neonPool(url: string): Pool {
  neonConfig.webSocketConstructor = ws;
  return new Pool({ connectionString: normalisePgUrl(url), max: 5 });
}
