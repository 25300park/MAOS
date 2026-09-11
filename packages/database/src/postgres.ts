import { Client } from "pg";
import type { MigrationDatabase, QueryResult } from "./types.js";

export interface RuntimeDatabase extends MigrationDatabase {
  close(): Promise<void>;
}

export async function openPostgresDatabase(
  connectionString: string,
): Promise<RuntimeDatabase> {
  const client = new Client({ connectionString });
  await client.connect();
  return {
    close: () => client.end(),
    exec: (sql) => client.query(sql),
    query: async <Row>(
      sql: string,
      params?: unknown[],
    ): Promise<QueryResult<Row>> => {
      const result = await client.query(sql, params);
      return { rows: result.rows as Row[] };
    },
  };
}
