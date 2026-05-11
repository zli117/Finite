import { db } from '$lib/db/client';
import { tasks, taskAttributes, timePeriods } from '$lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { broadcastDataChange } from '$lib/server/events';
import { findOrCreateDailyPeriod, findOrCreateWeeklyPeriod, weekFromDate } from './periods';
import type { ToolDef } from './types';

interface ListTasksArgs {
	scope: 'day' | 'week';
	day?: string;
	year?: number;
	week?: number;
	includeCompleted?: boolean;
}

export const listTasks: ToolDef<ListTasksArgs> = {
	name: 'list_tasks',
	category: 'read',
	description:
		"List the user's tasks in a given scope. Use scope='day' with a YYYY-MM-DD day, or scope='week' with year and week.",
	parameters: {
		type: 'object',
		properties: {
			scope: { type: 'string', enum: ['day', 'week'], description: "Period scope" },
			day: { type: 'string', description: 'YYYY-MM-DD, required when scope=day' },
			year: { type: 'integer', description: 'Required when scope=week' },
			week: { type: 'integer', description: 'Required when scope=week' },
			includeCompleted: { type: 'boolean', description: 'Default false' }
		},
		required: ['scope']
	},
	preview: (args) =>
		args.scope === 'day' ? `List tasks for ${args.day}` : `List tasks for ${args.year}-W${args.week}`,
	async execute(ctx, args) {
		let periodType: 'daily' | 'weekly';
		const where = [eq(timePeriods.userId, ctx.userId)];
		if (args.scope === 'day') {
			if (!args.day) throw new Error('day is required for scope=day');
			periodType = 'daily';
			where.push(eq(timePeriods.periodType, 'daily'));
			where.push(eq(timePeriods.day, args.day));
		} else {
			if (!args.year || !args.week) throw new Error('year and week required for scope=week');
			periodType = 'weekly';
			where.push(eq(timePeriods.periodType, 'weekly'));
			where.push(eq(timePeriods.year, args.year));
			where.push(eq(timePeriods.week, args.week));
		}
		const period = await db.query.timePeriods.findFirst({ where: and(...where) });
		if (!period) return { tasks: [] };

		const list = await db.query.tasks.findMany({
			where: (t, { eq, and }) => {
				const c = [eq(t.userId, ctx.userId), eq(t.timePeriodId, period.id)];
				if (!args.includeCompleted) c.push(eq(t.completed, false));
				return and(...c);
			},
			orderBy: (t, { asc }) => [asc(t.sortOrder)]
		});

		const result = await Promise.all(
			list.map(async (t) => {
				const attrs = await db.query.taskAttributes.findMany({
					where: eq(taskAttributes.taskId, t.id)
				});
				return {
					id: t.id,
					title: t.title,
					completed: t.completed,
					timeSpentMs: t.timeSpentMs,
					attributes: Object.fromEntries(attrs.map((a) => [a.key, a.value]))
				};
			})
		);
		return { periodType, tasks: result };
	}
};

interface CreateTaskArgs {
	title: string;
	scope: 'day' | 'week';
	day?: string;
	year?: number;
	week?: number;
	expectedHours?: number;
}

export const createTask: ToolDef<CreateTaskArgs, { taskId: string }> = {
	name: 'create_task',
	category: 'write',
	description:
		'Create a new task. Provide scope=day with a YYYY-MM-DD day to attach it to that daily plan, or scope=week with year+week for the weekly plan. expectedHours is optional.',
	parameters: {
		type: 'object',
		properties: {
			title: { type: 'string', description: 'Task title' },
			scope: { type: 'string', enum: ['day', 'week'] },
			day: { type: 'string', description: 'YYYY-MM-DD; required when scope=day' },
			year: { type: 'integer' },
			week: { type: 'integer' },
			expectedHours: { type: 'number', description: 'Optional estimate in hours' }
		},
		required: ['title', 'scope']
	},
	preview: (a) => {
		const where = a.scope === 'day' ? a.day : `${a.year}-W${a.week}`;
		const hours = a.expectedHours ? ` · ${a.expectedHours}h` : '';
		return `Create task: "${a.title}" → ${where}${hours}`;
	},
	async execute(ctx, args) {
		let periodId: string;
		if (args.scope === 'day') {
			if (!args.day) throw new Error('day is required for scope=day');
			periodId = await findOrCreateDailyPeriod(ctx.userId, args.day);
		} else {
			let year = args.year;
			let week = args.week;
			if ((!year || !week) && args.day) {
				const wk = weekFromDate(args.day, ctx.weekStartDay);
				year = wk.year;
				week = wk.week;
			}
			if (!year || !week) throw new Error('year and week required for scope=week');
			periodId = await findOrCreateWeeklyPeriod(ctx.userId, year, week);
		}

		const existing = await db.query.tasks.findMany({ where: eq(tasks.timePeriodId, periodId) });
		const maxSortOrder = existing.reduce((m, t) => Math.max(m, t.sortOrder), -1);

		const taskId = uuidv4();
		const now = new Date();
		await db.insert(tasks).values({
			id: taskId,
			userId: ctx.userId,
			timePeriodId: periodId,
			title: args.title,
			sortOrder: maxSortOrder + 1,
			createdAt: now,
			updatedAt: now
		});

		if (args.expectedHours !== undefined) {
			await db.insert(taskAttributes).values({
				id: uuidv4(),
				taskId,
				key: 'expected_hours',
				value: String(args.expectedHours),
				valueType: 'number'
			});
		}

		broadcastDataChange(ctx.userId, 'data:tasks', 'data:weekly');
		return { taskId };
	}
};

interface UpdateTaskArgs {
	taskId: string;
	title?: string;
	completed?: boolean;
	expectedHours?: number;
}

export const updateTask: ToolDef<UpdateTaskArgs> = {
	name: 'update_task',
	category: 'write',
	description: 'Update an existing task. Use the task id from list_tasks.',
	parameters: {
		type: 'object',
		properties: {
			taskId: { type: 'string', description: 'Task ID' },
			title: { type: 'string' },
			completed: { type: 'boolean' },
			expectedHours: { type: 'number' }
		},
		required: ['taskId']
	},
	preview: (a) => {
		const parts: string[] = [];
		if (a.title !== undefined) parts.push(`title="${a.title}"`);
		if (a.completed !== undefined) parts.push(a.completed ? 'mark complete' : 'mark incomplete');
		if (a.expectedHours !== undefined) parts.push(`${a.expectedHours}h`);
		return `Update task ${a.taskId.slice(0, 8)}: ${parts.join(', ') || '(no changes)'}`;
	},
	async execute(ctx, args) {
		const existing = await db.query.tasks.findFirst({
			where: and(eq(tasks.id, args.taskId), eq(tasks.userId, ctx.userId))
		});
		if (!existing) throw new Error('Task not found');

		const updates: Record<string, unknown> = { updatedAt: new Date() };
		if (args.title !== undefined) updates.title = args.title;
		if (args.completed !== undefined) {
			updates.completed = args.completed;
			updates.completedAt = args.completed ? new Date() : null;
		}
		if (Object.keys(updates).length > 1) {
			await db.update(tasks).set(updates).where(eq(tasks.id, args.taskId));
		}

		if (args.expectedHours !== undefined) {
			const existingAttr = await db.query.taskAttributes.findFirst({
				where: and(eq(taskAttributes.taskId, args.taskId), eq(taskAttributes.key, 'expected_hours'))
			});
			if (existingAttr) {
				await db
					.update(taskAttributes)
					.set({ value: String(args.expectedHours), valueType: 'number' })
					.where(eq(taskAttributes.id, existingAttr.id));
			} else {
				await db.insert(taskAttributes).values({
					id: uuidv4(),
					taskId: args.taskId,
					key: 'expected_hours',
					value: String(args.expectedHours),
					valueType: 'number'
				});
			}
		}

		broadcastDataChange(ctx.userId, 'data:tasks', 'data:weekly');
		return { ok: true };
	}
};

interface SetTaskAttributeArgs {
	taskId: string;
	key: string;
	value: string | number | null;
}

export const setTaskAttribute: ToolDef<SetTaskAttributeArgs> = {
	name: 'set_task_attribute',
	category: 'write',
	description:
		'Set a flexible attribute on a task. Common keys: "progress" (0..100 number), "hour" (HH:MM string), "expected_hours" (number). Pass value=null to remove.',
	parameters: {
		type: 'object',
		properties: {
			taskId: { type: 'string' },
			key: { type: 'string' },
			value: { type: 'string' }
		},
		required: ['taskId', 'key']
	},
	preview: (a) => `Set ${a.key}=${a.value === null ? '∅' : a.value} on task ${a.taskId.slice(0, 8)}`,
	async execute(ctx, args) {
		const task = await db.query.tasks.findFirst({
			where: and(eq(tasks.id, args.taskId), eq(tasks.userId, ctx.userId))
		});
		if (!task) throw new Error('Task not found');

		const existing = await db.query.taskAttributes.findFirst({
			where: and(eq(taskAttributes.taskId, args.taskId), eq(taskAttributes.key, args.key))
		});

		if (args.value === null) {
			if (existing) await db.delete(taskAttributes).where(eq(taskAttributes.id, existing.id));
		} else {
			const valueType = typeof args.value === 'number' ? 'number' : 'text';
			if (existing) {
				await db
					.update(taskAttributes)
					.set({ value: String(args.value), valueType })
					.where(eq(taskAttributes.id, existing.id));
			} else {
				await db.insert(taskAttributes).values({
					id: uuidv4(),
					taskId: args.taskId,
					key: args.key,
					value: String(args.value),
					valueType
				});
			}
		}
		broadcastDataChange(ctx.userId, 'data:tasks', 'data:weekly');
		return { ok: true };
	}
};

interface TaskTimerArgs {
	taskId: string;
	action: 'start' | 'stop';
}

export const controlTaskTimer: ToolDef<TaskTimerArgs> = {
	name: 'control_task_timer',
	category: 'write',
	description: 'Start or stop the time-tracking timer on a task.',
	parameters: {
		type: 'object',
		properties: {
			taskId: { type: 'string' },
			action: { type: 'string', enum: ['start', 'stop'] }
		},
		required: ['taskId', 'action']
	},
	preview: (a) => `${a.action === 'start' ? 'Start' : 'Stop'} timer on task ${a.taskId.slice(0, 8)}`,
	async execute(ctx, args) {
		const task = await db.query.tasks.findFirst({
			where: and(eq(tasks.id, args.taskId), eq(tasks.userId, ctx.userId))
		});
		if (!task) throw new Error('Task not found');
		const now = new Date();
		if (args.action === 'start') {
			if (task.timerStartedAt) throw new Error('Timer already running');
			await db
				.update(tasks)
				.set({ timerStartedAt: now, updatedAt: now })
				.where(eq(tasks.id, args.taskId));
		} else {
			if (!task.timerStartedAt) throw new Error('Timer is not running');
			const elapsed = now.getTime() - task.timerStartedAt.getTime();
			await db
				.update(tasks)
				.set({
					timerStartedAt: null,
					timeSpentMs: (task.timeSpentMs || 0) + elapsed,
					updatedAt: now
				})
				.where(eq(tasks.id, args.taskId));
		}
		broadcastDataChange(ctx.userId, 'data:tasks', 'data:weekly');
		return { ok: true };
	}
};

interface DeleteTaskArgs {
	taskId: string;
}

export const deleteTask: ToolDef<DeleteTaskArgs> = {
	name: 'delete_task',
	category: 'write',
	description: 'Delete a task by id.',
	parameters: {
		type: 'object',
		properties: { taskId: { type: 'string' } },
		required: ['taskId']
	},
	preview: (a) => `Delete task ${a.taskId.slice(0, 8)}`,
	async execute(ctx, args) {
		const existing = await db.query.tasks.findFirst({
			where: and(eq(tasks.id, args.taskId), eq(tasks.userId, ctx.userId))
		});
		if (!existing) throw new Error('Task not found');
		await db.delete(tasks).where(eq(tasks.id, args.taskId));
		broadcastDataChange(ctx.userId, 'data:tasks', 'data:weekly');
		return { ok: true };
	}
};
