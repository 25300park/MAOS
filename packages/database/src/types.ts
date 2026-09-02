export interface Migration {
  checksum: string;
  id: string;
  sql: string;
}

export interface QueryResult<Row> {
  rows: Row[];
}

export interface MigrationDatabase {
  exec(sql: string): Promise<unknown>;
  query<Row>(sql: string, params?: unknown[]): Promise<QueryResult<Row>>;
}

export interface MigrationResult {
  applied: string[];
  skipped: string[];
}
