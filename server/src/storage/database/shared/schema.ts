import { pgTable, serial, timestamp, varchar, text, date, index, uuid, uniqueIndex, jsonb } from "drizzle-orm/pg-core"
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
		week_key: varchar("week_key", { length: 20 }),
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

export const travelDays = pgTable(
	"travel_days",
	{
		id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
		weekKey: varchar("week_key", { length: 20 }).notNull(),
		dayDate: date("day_date", { mode: "string" }).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index("travel_days_week_key_idx").on(table.weekKey),
		uniqueIndex("travel_days_week_day_unique").on(table.weekKey, table.dayDate),
	]
);

export type TravelDay = typeof travelDays.$inferSelect;
export type InsertTravelDay = typeof travelDays.$inferInsert;

export const schedule = pgTable(
	"schedule",
	{
		id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
		projectName: varchar("project_name", { length: 200 }).notNull(),
		scheduleType: varchar("schedule_type", { length: 20 }).notNull().default("商单"),
		clientName: varchar("client_name", { length: 200 }).notNull().default(""),
		pubDate: date("pub_date", { mode: "string" }),
		stages: jsonb("stages").notNull().default({}),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index("schedule_pub_date_idx").on(table.pubDate),
	]
);

export type Schedule = typeof schedule.$inferSelect;
export type InsertSchedule = typeof schedule.$inferInsert;