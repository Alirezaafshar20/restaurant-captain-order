import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const workspaces = sqliteTable('workspaces', {
  owner: text('owner').primaryKey(),
  revision: integer('revision').notNull().default(0),
  data: text('data').notNull(),
  updatedAt: text('updated_at').notNull(),
});
export const aiUsage = sqliteTable('ai_usage', {
  bucket: text('bucket').primaryKey(),
  count: integer('count').notNull().default(0),
});
