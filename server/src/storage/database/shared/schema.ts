import { pgTable, serial, timestamp, varchar, text, date, index } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const healthCheck = pgTable("health_check", {
	id: serial().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

export const tasks = pgTable(
	"tasks",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
		title: varchar("title", { length: 255 }).notNull(),
		remark: text("remark"),
		task_type: varchar("task_type", { length: 20 }).notNull().default("light"),
		plan_date: date("plan_date", { mode: "string" }).notNull(),
		time_slot: varchar("time_slot", { length: 10 }).notNull().default("09:00"),
		estimated_duration: varchar("estimated_duration", { length: 40 }),
		status: varchar("status", { length: 20 }).notNull().default("todo"),
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
	},
	(table) => [
		index("tasks_plan_date_idx").on(table.plan_date),
		index("tasks_status_idx").on(table.status),
		index("tasks_type_idx").on(table.task_type),
		index("tasks_date_status_idx").on(table.plan_date, table.status),
	]
);

export type Task = typeof tasks.$inferSelect;
export type InsertTask = typeof tasks.$inferInsert;