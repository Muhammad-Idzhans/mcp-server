

export type Dialect = "sqlite" | "pg" | "mysql" | "mssql" | "oracle";

export interface DB {
  dialect: Dialect;
  /**
   * Execute a parameterized query.
   * @param text   SQL with placeholders appropriate for the driver
   * @param params Parameter values (array or named object based on driver)
   */
  query<T = unknown>(text: string, params: any): Promise<{ rows: T[]; rowCount: number }>;
  close?(): Promise<void> | void;
}
