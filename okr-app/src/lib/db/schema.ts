import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

// Users table for multi-user support
export const users = sqliteTable('users', {
	id: text('id').primaryKey(),
	username: text('username').notNull().unique(),
	passwordHash: text('password_hash').notNull(),
	weekStartDay: text('week_start_day', { enum: ['sunday', 'monday'] }).notNull().default('monday'),
	timezone: text('timezone').notNull().default('UTC'), // IANA timezone identifier (e.g., 'America/New_York')
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
});

// Sessions for authentication
export const sessions = sqliteTable('sessions', {
	id: text('id').primaryKey(),
	userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
	expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull()
});

// Core values with ranking
export const values = sqliteTable('values', {
	id: text('id').primaryKey(),
	userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
	title: text('title').notNull(),
	rank: integer('rank').notNull(),
	description: text('description'),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
	updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
});

// Principles derived from values
export const principles = sqliteTable('principles', {
	id: text('id').primaryKey(),
	userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
	valueId: text('value_id').references(() => values.id, { onDelete: 'set null' }),
	title: text('title').notNull(),
	description: text('description'),
	examples: text('examples'), // JSON array
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
	updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
});

// OKR Objectives (yearly or monthly)
export const objectives = sqliteTable('objectives', {
	id: text('id').primaryKey(),
	userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
	title: text('title').notNull(),
	description: text('description'),
	level: text('level', { enum: ['yearly', 'monthly'] }).notNull(),
	year: integer('year').notNull(),
	month: integer('month'), // null for yearly
	weight: real('weight').notNull().default(1.0),
	parentId: text('parent_id'), // Self-reference to parent objective (handled at app level)
	category: text('category'), // Work, Health, Social, Wealth, etc.
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
	updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
});

// Key Results for objectives
export const keyResults = sqliteTable('key_results', {
	id: text('id').primaryKey(),
	objectiveId: text('objective_id').notNull().references(() => objectives.id, { onDelete: 'cascade' }),
	title: text('title').notNull(),
	details: text('details'), // Additional description/notes
	weight: real('weight').notNull().default(1.0),
	score: real('score').notNull().default(0), // 0-1 range
	expectedHours: real('expected_hours').default(0),
	sortOrder: integer('sort_order').notNull().default(0),
	// Flexible measurement type
	measurementType: text('measurement_type', { enum: ['slider', 'checkboxes', 'custom_query'] }).notNull().default('slider'),
	checkboxItems: text('checkbox_items'), // JSON array of {id, label, completed}
	progressQueryId: text('progress_query_id'), // Reference to saved query for progress calculation
	progressQueryCode: text('progress_query_code'), // Inline code override for progress
	widgetQueryId: text('widget_query_id'), // Reference to saved query for custom widget
	widgetQueryCode: text('widget_query_code'), // Inline code override for widget
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
	updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
});

// Time periods (yearly, monthly, weekly, daily containers)
export const timePeriods = sqliteTable('time_periods', {
	id: text('id').primaryKey(),
	userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
	periodType: text('period_type', { enum: ['yearly', 'monthly', 'weekly', 'daily'] }).notNull(),
	year: integer('year').notNull(),
	month: integer('month'), // null for yearly
	week: integer('week'), // null for yearly/monthly
	day: text('day'), // ISO date string, only for daily
	notes: text('notes'),
	reviewWhatWorked: text('review_what_worked'),
	reviewImprovements: text('review_improvements'),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
	updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
});

// Time commitment settings for monthly periods
export const timeCommitments = sqliteTable('time_commitments', {
	timePeriodId: text('time_period_id').primaryKey().references(() => timePeriods.id, { onDelete: 'cascade' }),
	numberOfWeeks: integer('number_of_weeks').notNull().default(4),
	availableHoursPerWeekday: real('available_hours_per_weekday').notNull().default(1.5),
	availableHoursPerWeekend: real('available_hours_per_weekend').notNull().default(8.0)
});

// Tasks (work items)
export const tasks = sqliteTable('tasks', {
	id: text('id').primaryKey(),
	userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
	timePeriodId: text('time_period_id').notNull().references(() => timePeriods.id, { onDelete: 'cascade' }),
	title: text('title').notNull(),
	completed: integer('completed', { mode: 'boolean' }).notNull().default(false),
	completedAt: integer('completed_at', { mode: 'timestamp' }),
	sortOrder: integer('sort_order').notNull().default(0),
	// Time tracking
	timeSpentMs: integer('time_spent_ms').notNull().default(0), // Cumulative time in milliseconds
	timerStartedAt: integer('timer_started_at', { mode: 'timestamp' }), // When timer was started (null = not running)
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
	updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
});

// Flexible task attributes (progress, hour, expected_hours, etc.)
export const taskAttributes = sqliteTable('task_attributes', {
	id: text('id').primaryKey(),
	taskId: text('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
	key: text('key').notNull(), // 'progress', 'hour', 'expected_hours'
	value: text('value').notNull(),
	valueType: text('value_type', { enum: ['number', 'time', 'text', 'boolean'] }).notNull().default('number')
});

// Tags for task categorization and aggregation
export const tags = sqliteTable('tags', {
	id: text('id').primaryKey(),
	userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
	name: text('name').notNull(), // e.g., 'AI_Research_Work'
	color: text('color'), // hex color
	category: text('category') // e.g., 'work', 'health', 'social'
});

// Task-tag relationship
export const taskTags = sqliteTable('task_tags', {
	taskId: text('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
	tagId: text('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' })
});

// Daily health metrics
export const dailyMetrics = sqliteTable('daily_metrics', {
	id: text('id').primaryKey(),
	userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
	timePeriodId: text('time_period_id').notNull().references(() => timePeriods.id, { onDelete: 'cascade' }),
	previousNightBedTime: text('previous_night_bed_time'), // HH:MM
	wakeUpTime: text('wake_up_time'), // HH:MM
	sleepLength: text('sleep_length'), // HH:MM
	cardioLoad: integer('cardio_load'),
	fitbitReadiness: integer('fitbit_readiness'),
	steps: integer('steps'),
	heartPoints: integer('heart_points'),
	restingHeartRate: integer('resting_heart_rate'),
	customMetrics: text('custom_metrics') // JSON for plugin-added metrics
});

// Saved queries for custom aggregations
export const savedQueries = sqliteTable('saved_queries', {
	id: text('id').primaryKey(),
	userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
	name: text('name').notNull(),
	description: text('description'),
	queryType: text('query_type', { enum: ['progress', 'widget', 'general'] }).notNull().default('general'),
	code: text('code').notNull(), // JavaScript code
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
	updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
});

// Dashboard widgets configuration
export const dashboardWidgets = sqliteTable('dashboard_widgets', {
	id: text('id').primaryKey(),
	userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
	title: text('title').notNull(),
	widgetType: text('widget_type', { enum: ['builtin', 'custom', 'saved'] }).notNull(),
	config: text('config').notNull(), // JSON configuration
	sortOrder: integer('sort_order').notNull().default(0),
	page: text('page').notNull().default('dashboard'), // which page it appears on
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
});

// Plugin configurations
export const plugins = sqliteTable('plugins', {
	id: text('id').primaryKey(),
	userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
	pluginId: text('plugin_id').notNull(), // e.g., 'fitbit'
	enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
	config: text('config'), // JSON with settings and encrypted credentials
	lastSync: integer('last_sync', { mode: 'timestamp' }),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
});

// Metrics templates (per-user, versioned by effective date)
export const metricsTemplates = sqliteTable('metrics_templates', {
	id: text('id').primaryKey(),
	userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
	name: text('name').notNull().default('default'),
	effectiveFrom: text('effective_from').notNull(), // YYYY-MM-DD
	metricsDefinition: text('metrics_definition').notNull(), // JSON array of MetricDefinition
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
	updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
});

// Flexible daily metric values (replaces fixed daily_metrics columns)
export const dailyMetricValues = sqliteTable('daily_metric_values', {
	id: text('id').primaryKey(),
	userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
	date: text('date').notNull(), // YYYY-MM-DD
	metricName: text('metric_name').notNull(),
	value: text('value'), // Stored as string, parsed by type
	source: text('source').notNull() // 'user' | 'computed' | 'fitbit' | etc.
});

// Type exports for use in the application
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type Objective = typeof objectives.$inferSelect;
export type KeyResult = typeof keyResults.$inferSelect;
export type TimePeriod = typeof timePeriods.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type TaskAttribute = typeof taskAttributes.$inferSelect;
export type Tag = typeof tags.$inferSelect;
export type DailyMetrics = typeof dailyMetrics.$inferSelect;
export type SavedQuery = typeof savedQueries.$inferSelect;
export type DashboardWidget = typeof dashboardWidgets.$inferSelect;
export type MetricsTemplate = typeof metricsTemplates.$inferSelect;
export type DailyMetricValue = typeof dailyMetricValues.$inferSelect;

// Metric definition types for template configuration
export interface MetricDefinition {
	name: string;
	label: string;
	type: 'input' | 'computed' | 'external';
	inputType?: 'number' | 'time' | 'text' | 'boolean';
	unit?: string;
	expression?: string; // JS code for computed metrics
	source?: string; // e.g., 'fitbit.sleep_length' for external metrics
}

// Checkbox item for Key Results
export interface CheckboxItem {
	id: string;
	label: string;
	completed: boolean;
}
