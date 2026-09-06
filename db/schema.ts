import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
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
export const tasteProfiles = sqliteTable('taste_profiles', {
  owner: text('owner').primaryKey(),
  revision: integer('revision').notNull(),
  data: text('data').notNull(),
});
export const dishKnowledge = sqliteTable(
  'dish_knowledge',
  {
    key: text('key').primaryKey(),
    owner: text('owner').notNull(),
    revision: integer('revision').notNull(),
    data: text('data').notNull(),
  },
  (t) => [index('idx_dish_knowledge_owner').on(t.owner)],
);
export const tasteDecisions = sqliteTable(
  'taste_decisions',
  {
    key: text('key').primaryKey(),
    owner: text('owner').notNull(),
    data: text('data').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('idx_taste_decisions_owner_created').on(t.owner, t.createdAt)],
);
export const tasteFeedback = sqliteTable(
  'taste_feedback',
  {
    key: text('key').primaryKey(),
    owner: text('owner').notNull(),
    data: text('data').notNull(),
  },
  (t) => [index('idx_taste_feedback_owner').on(t.owner)],
);
