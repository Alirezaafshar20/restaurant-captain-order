import { openDatabase, d1Adapter } from './sqlite.mjs';
let db: D1Database | undefined;
export const env = {
  get DB(): D1Database {
    db ??= d1Adapter(
      openDatabase(process.env.DATABASE_PATH),
    ) as unknown as D1Database;
    return db;
  },
  get OPENAI_API_KEY() {
    return process.env.OPENAI_API_KEY;
  },
  get OPENAI_MODEL() {
    return process.env.OPENAI_MODEL;
  },
  get OPENAI_REALTIME_MODEL() {
    return process.env.OPENAI_REALTIME_MODEL;
  },
};
