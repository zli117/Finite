// Shared types for the OKR app

export interface User {
	id: string;
	username: string;
	weekStartDay: 'sunday' | 'monday';
}

export interface Task {
	id: string;
	userId: string;
	timePeriodId: string;
	title: string;
	completed: boolean;
	completedAt: Date | null;
	sortOrder: number;
	// Time tracking
	timeSpentMs: number;
	timerStartedAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
	attributes: Record<string, string>;
	tagIds?: string[];
}

export interface TaskAttribute {
	id: string;
	taskId: string;
	key: string;
	value: string;
	valueType: 'number' | 'time' | 'text' | 'boolean';
}

export interface TimePeriod {
	id: string;
	userId: string;
	periodType: 'yearly' | 'monthly' | 'weekly' | 'daily';
	year: number;
	month: number | null;
	week: number | null;
	day: string | null;
	createdAt: Date;
	updatedAt: Date;
}

export interface DailyMetrics {
	id: string;
	userId: string;
	timePeriodId: string;
	previousNightBedTime: string | null;
	wakeUpTime: string | null;
	sleepLength: string | null;
	cardioLoad: number | null;
	fitbitReadiness: number | null;
	steps: number | null;
	heartPoints: number | null;
	restingHeartRate: number | null;
	customMetrics: string | null;
}

export interface Objective {
	id: string;
	userId: string;
	parentId: string | null;
	level: 'yearly' | 'monthly';
	year: number;
	month: number | null;
	title: string;
	description: string | null;
	weight: number;
	createdAt: Date;
	updatedAt: Date;
}

export interface KeyResult {
	id: string;
	objectiveId: string;
	title: string;
	targetValue: number;
	currentValue: number;
	score: number;
	weight: number;
	expectedHours: number | null;
	createdAt: Date;
	updatedAt: Date;
}

export interface Tag {
	id: string;
	userId: string;
	name: string;
	color: string | null;
	category: string | null;
}

export interface DailyData {
	period: TimePeriod;
	tasks: Task[];
	metrics: DailyMetrics | null;
	created: boolean;
}
