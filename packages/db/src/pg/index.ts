// TODO: Implement PostgreSQL support — install `pg` and `drizzle-orm/node-postgres`
// This placeholder exists to establish the directory structure and PgDb type.

export type PgDb = never;

export function createDb(_url?: string): PgDb {
  throw new Error("PostgreSQL support not yet implemented. Set DB_DRIVER=sqlite.");
}
