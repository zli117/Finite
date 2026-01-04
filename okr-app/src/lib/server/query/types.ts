/**
 * Types for the Query API system
 */

export interface QueryFilters {
	year?: number;
	month?: number;
	week?: number;
	from?: string; // YYYY-MM-DD
	to?: string; // YYYY-MM-DD
	completed?: boolean;
	tag?: string;
	periodId?: string;
	level?: 'yearly' | 'monthly';
}

export interface DailyRecord {
	date: string;
	year: number;
	month: number;
	week: number;
	sleepLength: string | null;
	wakeUpTime: string | null;
	bedTime: string | null;
	steps: number | null;
	cardioLoad: number | null;
	fitbitReadiness: number | null;
	restingHeartRate: number | null;
	tasks: TaskWithAttributes[];
	completedTasks: number;
	totalTasks: number;
	totalHours: number;
}

export interface WeeklyRecord {
	year: number;
	week: number;
	days: DailyRecord[];
	completedTasks: number;
	totalTasks: number;
	totalHours: number;
}

export interface TaskWithAttributes {
	id: string;
	title: string;
	completed: boolean;
	completedAt: Date | null;
	attributes: Record<string, string>;
}

export interface TaskRecord {
	id: string;
	title: string;
	completed: boolean;
	completedAt: string | null;
	date: string | null;
	year: number | null;
	month: number | null;
	week: number | null;
	attributes: Record<string, string>;
	tags: string[];
	hour: number;
	progress: number;
}

export interface ObjectiveRecord {
	id: string;
	title: string;
	description: string | null;
	level: 'yearly' | 'monthly';
	year: number;
	month: number | null;
	weight: number;
	score: number;
	keyResults: KeyResultRecord[];
}

export interface KeyResultRecord {
	id: string;
	title: string;
	score: number;
	weight: number;
	expectedHours: number | null;
}

export interface QueryAPI {
	daily(filters?: QueryFilters): Promise<DailyRecord[]>;
	weekly(filters?: QueryFilters): Promise<WeeklyRecord[]>;
	tasks(filters?: QueryFilters): Promise<TaskRecord[]>;
	objectives(filters?: QueryFilters): Promise<ObjectiveRecord[]>;

	// Aggregations
	sum(items: unknown[], field: string): number;
	avg(items: unknown[], field: string): number;
	count(items: unknown[]): number;

	// Formatting
	formatDuration(minutes: number): string;
	formatPercent(value: number, total: number): string;
	parseTime(timeStr: string): number;
}

export interface SavedQuery {
	id: string;
	userId: string;
	name: string;
	description: string | null;
	code: string;
	createdAt: Date;
	updatedAt: Date;
}

export interface WidgetConfig {
	id: string;
	type: 'builtin' | 'custom' | 'saved';
	title: string;
	// For custom widgets
	code?: string;
	// For saved query widgets
	queryId?: string;
	params?: Record<string, unknown>;
}

export interface QueryResult {
	result: unknown;
	error?: string;
}
