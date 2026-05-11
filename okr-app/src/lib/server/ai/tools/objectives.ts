import { db } from '$lib/db/client';
import { objectives, keyResults } from '$lib/db/schema';
import type { CheckboxItem } from '$lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { broadcastDataChange } from '$lib/server/events';
import type { ToolDef } from './types';

interface ListObjectivesArgs {
	year: number;
	level?: 'yearly' | 'monthly';
	month?: number;
}

export const listObjectives: ToolDef<ListObjectivesArgs> = {
	name: 'list_objectives',
	category: 'read',
	description:
		"List the user's objectives (with their key results) for a year. Filter by level (yearly|monthly) and month (1-12). Returned KR objects include all fields needed to update them, including measurementType, checkboxItems, progressQueryCode, widgetQueryCode.",
	parameters: {
		type: 'object',
		properties: {
			year: { type: 'integer' },
			level: { type: 'string', enum: ['yearly', 'monthly'] },
			month: { type: 'integer', description: '1-12' }
		},
		required: ['year']
	},
	preview: (a) => {
		const where = a.level === 'monthly' ? `${a.year}-${a.month}` : String(a.year);
		return `List objectives for ${where}`;
	},
	async execute(ctx, args) {
		const objs = await db.query.objectives.findMany({
			where: (o, { eq, and }) => {
				const c = [eq(o.userId, ctx.userId), eq(o.year, args.year)];
				if (args.level) c.push(eq(o.level, args.level));
				if (args.month) c.push(eq(o.month, args.month));
				return and(...c);
			},
			orderBy: (o, { asc }) => [asc(o.year), asc(o.month)]
		});

		const result = await Promise.all(
			objs.map(async (o) => {
				const krs = await db.query.keyResults.findMany({
					where: eq(keyResults.objectiveId, o.id),
					orderBy: (k, { asc }) => [asc(k.sortOrder)]
				});
				return {
					id: o.id,
					title: o.title,
					description: o.description,
					level: o.level,
					year: o.year,
					month: o.month,
					category: o.category,
					weight: o.weight,
					colorIndex: o.colorIndex,
					keyResults: krs.map((k) => ({
						id: k.id,
						title: k.title,
						details: k.details,
						weight: k.weight,
						score: k.score,
						scoreLabel: k.scoreLabel,
						expectedHours: k.expectedHours,
						measurementType: k.measurementType,
						checkboxItems: k.checkboxItems ? JSON.parse(k.checkboxItems) : null,
						progressQueryId: k.progressQueryId,
						hasProgressQueryCode: !!k.progressQueryCode,
						widgetQueryId: k.widgetQueryId,
						hasWidgetQueryCode: !!k.widgetQueryCode
					}))
				};
			})
		);
		return { objectives: result };
	}
};

interface GetObjectiveArgs {
	objectiveId: string;
}

export const getObjective: ToolDef<GetObjectiveArgs> = {
	name: 'get_objective',
	category: 'read',
	description:
		'Get full details for a single objective including all key result fields (with the full progressQueryCode and widgetQueryCode bodies). Use this before editing a query, so you can see the existing code.',
	parameters: {
		type: 'object',
		properties: { objectiveId: { type: 'string' } },
		required: ['objectiveId']
	},
	preview: (a) => `Get objective ${a.objectiveId.slice(0, 8)}`,
	async execute(ctx, args) {
		const obj = await db.query.objectives.findFirst({
			where: and(eq(objectives.id, args.objectiveId), eq(objectives.userId, ctx.userId))
		});
		if (!obj) throw new Error('Objective not found');
		const krs = await db.query.keyResults.findMany({
			where: eq(keyResults.objectiveId, obj.id),
			orderBy: (k, { asc }) => [asc(k.sortOrder)]
		});
		return {
			objective: {
				...obj,
				keyResults: krs.map((k) => ({
					...k,
					checkboxItems: k.checkboxItems ? JSON.parse(k.checkboxItems) : null
				}))
			}
		};
	}
};

interface CreateObjectiveArgs {
	title: string;
	level: 'yearly' | 'monthly';
	year: number;
	month?: number;
	description?: string;
	category?: string;
	weight?: number;
	colorIndex?: number;
}

export const createObjective: ToolDef<CreateObjectiveArgs, { objectiveId: string }> = {
	name: 'create_objective',
	category: 'write',
	description:
		'Create a new yearly or monthly objective. For level=monthly, month (1-12) is required.',
	parameters: {
		type: 'object',
		properties: {
			title: { type: 'string' },
			level: { type: 'string', enum: ['yearly', 'monthly'] },
			year: { type: 'integer' },
			month: { type: 'integer' },
			description: { type: 'string' },
			category: { type: 'string', description: 'e.g. Work, Health, Social, Wealth' },
			weight: { type: 'number', description: 'Default 1.0' },
			colorIndex: { type: 'integer', description: 'Optional palette index' }
		},
		required: ['title', 'level', 'year']
	},
	preview: (a) => {
		const where = a.level === 'monthly' ? `${a.year}-${a.month}` : String(a.year);
		return `Create ${a.level} objective: "${a.title}" (${where})`;
	},
	async execute(ctx, args) {
		if (args.level === 'monthly' && (args.month === undefined || args.month < 1 || args.month > 12)) {
			throw new Error('month (1-12) is required for monthly objectives');
		}
		const id = uuidv4();
		const now = new Date();
		await db.insert(objectives).values({
			id,
			userId: ctx.userId,
			title: args.title,
			description: args.description ?? null,
			level: args.level,
			year: args.year,
			month: args.level === 'monthly' ? args.month! : null,
			weight: args.weight ?? 1.0,
			parentId: null,
			category: args.category ?? null,
			colorIndex: args.colorIndex ?? null,
			createdAt: now,
			updatedAt: now
		});
		broadcastDataChange(ctx.userId, 'data:objectives');
		return { objectiveId: id };
	}
};

interface UpdateObjectiveArgs {
	objectiveId: string;
	title?: string;
	description?: string;
	weight?: number;
	category?: string;
	colorIndex?: number;
}

export const updateObjective: ToolDef<UpdateObjectiveArgs> = {
	name: 'update_objective',
	category: 'write',
	description: 'Update an existing objective\'s fields.',
	parameters: {
		type: 'object',
		properties: {
			objectiveId: { type: 'string' },
			title: { type: 'string' },
			description: { type: 'string' },
			weight: { type: 'number' },
			category: { type: 'string' },
			colorIndex: { type: 'integer' }
		},
		required: ['objectiveId']
	},
	preview: (a) => {
		const parts: string[] = [];
		if (a.title !== undefined) parts.push(`title="${a.title}"`);
		if (a.description !== undefined) parts.push('description');
		if (a.weight !== undefined) parts.push(`weight=${a.weight}`);
		if (a.category !== undefined) parts.push(`category=${a.category}`);
		if (a.colorIndex !== undefined) parts.push(`color=${a.colorIndex}`);
		return `Update objective ${a.objectiveId.slice(0, 8)}: ${parts.join(', ') || '(no changes)'}`;
	},
	async execute(ctx, args) {
		const existing = await db.query.objectives.findFirst({
			where: and(eq(objectives.id, args.objectiveId), eq(objectives.userId, ctx.userId))
		});
		if (!existing) throw new Error('Objective not found');

		const updates: Record<string, unknown> = { updatedAt: new Date() };
		if (args.title !== undefined) updates.title = args.title;
		if (args.description !== undefined) updates.description = args.description;
		if (args.weight !== undefined) updates.weight = args.weight;
		if (args.category !== undefined) updates.category = args.category;
		if (args.colorIndex !== undefined) updates.colorIndex = args.colorIndex;

		await db.update(objectives).set(updates).where(eq(objectives.id, args.objectiveId));
		broadcastDataChange(ctx.userId, 'data:objectives');
		return { ok: true };
	}
};

interface DeleteObjectiveArgs {
	objectiveId: string;
}

export const deleteObjective: ToolDef<DeleteObjectiveArgs> = {
	name: 'delete_objective',
	category: 'write',
	description:
		'Delete an objective by id. This cascades to all of its key results — be sure the user really wants this.',
	parameters: {
		type: 'object',
		properties: { objectiveId: { type: 'string' } },
		required: ['objectiveId']
	},
	preview: (a) => `Delete objective ${a.objectiveId.slice(0, 8)} (cascades KRs)`,
	async execute(ctx, args) {
		const existing = await db.query.objectives.findFirst({
			where: and(eq(objectives.id, args.objectiveId), eq(objectives.userId, ctx.userId))
		});
		if (!existing) throw new Error('Objective not found');
		await db.delete(objectives).where(eq(objectives.id, args.objectiveId));
		broadcastDataChange(ctx.userId, 'data:objectives');
		return { ok: true };
	}
};

type MeasurementType = 'slider' | 'checkboxes' | 'custom_query';

interface CreateKeyResultArgs {
	objectiveId: string;
	title: string;
	weight?: number;
	expectedHours?: number;
	details?: string;
	measurementType?: MeasurementType;
	checkboxItems?: { label: string; completed?: boolean }[];
	progressQueryCode?: string;
	progressQueryId?: string;
	widgetQueryCode?: string;
	widgetQueryId?: string;
}

export const createKeyResult: ToolDef<CreateKeyResultArgs, { keyResultId: string }> = {
	name: 'create_key_result',
	category: 'write',
	description:
		'Add a key result to an objective. objectiveId MUST be the full UUID returned by list_objectives or get_objective — never invent one. measurementType controls how progress is tracked:\n' +
		'  - "slider" (default): user manually drags a 0..100% slider; score is set via update_key_result\n' +
		'  - "checkboxes": progress = completed/total of checkboxItems; pass checkboxItems=[{label,completed?}]\n' +
		'  - "custom_query": progress is computed by running JavaScript in the query sandbox; pass progressQueryCode (the JS body) or progressQueryId (id of a saved query). The code must call `progress.set(numerator, denominator)`. You can also set a widgetQueryCode/widgetQueryId to render a custom widget on the KR. To author/improve the query JavaScript itself, switch the AI sidebar to the Query Builder.',
	parameters: {
		type: 'object',
		properties: {
			objectiveId: { type: 'string' },
			title: { type: 'string' },
			weight: { type: 'number' },
			expectedHours: { type: 'number' },
			details: { type: 'string' },
			measurementType: { type: 'string', enum: ['slider', 'checkboxes', 'custom_query'] },
			checkboxItems: {
				type: 'array',
				description: 'Required when measurementType=checkboxes',
				items: { type: 'object', description: '{label: string, completed?: boolean}' }
			},
			progressQueryCode: { type: 'string', description: 'JS code body for custom_query progress' },
			progressQueryId: { type: 'string', description: 'Saved-query id (alternative to code)' },
			widgetQueryCode: { type: 'string', description: 'JS code for an optional KR widget' },
			widgetQueryId: { type: 'string', description: 'Saved-query id for KR widget' }
		},
		required: ['objectiveId', 'title']
	},
	preview: (a) => {
		const m = a.measurementType ?? 'slider';
		return `Add KR (${m}) to ${a.objectiveId.slice(0, 8)}: "${a.title}"`;
	},
	async execute(ctx, args) {
		const obj = await db.query.objectives.findFirst({
			where: and(eq(objectives.id, args.objectiveId), eq(objectives.userId, ctx.userId))
		});
		if (!obj) throw new Error('Objective not found');

		const measurementType: MeasurementType = args.measurementType ?? 'slider';
		if (measurementType === 'checkboxes' && (!args.checkboxItems || args.checkboxItems.length === 0)) {
			throw new Error('checkboxItems are required when measurementType=checkboxes');
		}
		if (measurementType === 'custom_query' && !args.progressQueryCode && !args.progressQueryId) {
			throw new Error('Either progressQueryCode or progressQueryId is required for custom_query');
		}

		const existing = await db.query.keyResults.findMany({
			where: eq(keyResults.objectiveId, args.objectiveId)
		});
		const maxSort = existing.reduce((m, k) => Math.max(m, k.sortOrder), -1);

		const id = uuidv4();
		const now = new Date();
		const checkboxItems: CheckboxItem[] | null = args.checkboxItems
			? args.checkboxItems.map((it) => ({
					id: uuidv4(),
					label: it.label,
					completed: !!it.completed
				}))
			: null;

		await db.insert(keyResults).values({
			id,
			objectiveId: args.objectiveId,
			title: args.title,
			details: args.details ?? null,
			weight: args.weight ?? 1.0,
			score: 0,
			expectedHours: args.expectedHours ?? 0,
			sortOrder: maxSort + 1,
			measurementType,
			checkboxItems: checkboxItems ? JSON.stringify(checkboxItems) : null,
			progressQueryId: args.progressQueryId ?? null,
			progressQueryCode: args.progressQueryCode ?? null,
			widgetQueryId: args.widgetQueryId ?? null,
			widgetQueryCode: args.widgetQueryCode ?? null,
			createdAt: now,
			updatedAt: now
		});
		broadcastDataChange(ctx.userId, 'data:objectives');
		return { keyResultId: id };
	}
};

interface UpdateKeyResultArgs {
	keyResultId: string;
	title?: string;
	score?: number;
	weight?: number;
	expectedHours?: number;
	details?: string;
	measurementType?: MeasurementType;
	checkboxItems?: { id?: string; label: string; completed?: boolean }[];
	progressQueryCode?: string | null;
	progressQueryId?: string | null;
	widgetQueryCode?: string | null;
	widgetQueryId?: string | null;
}

export const updateKeyResult: ToolDef<UpdateKeyResultArgs> = {
	name: 'update_key_result',
	category: 'write',
	description:
		'Update an existing key result. Any field passed will be updated; omitted fields keep their value. Pass null on progressQueryCode/progressQueryId/widgetQueryCode/widgetQueryId to clear them. score is 0..1. Switching measurementType replaces the relevant fields — e.g., setting measurementType=custom_query requires you to also pass progressQueryCode or progressQueryId.',
	parameters: {
		type: 'object',
		properties: {
			keyResultId: { type: 'string' },
			title: { type: 'string' },
			score: { type: 'number', description: '0..1' },
			weight: { type: 'number' },
			expectedHours: { type: 'number' },
			details: { type: 'string' },
			measurementType: { type: 'string', enum: ['slider', 'checkboxes', 'custom_query'] },
			checkboxItems: {
				type: 'array',
				description: 'Replaces all checkbox items. Items without an id are treated as new.',
				items: { type: 'object', description: '{id?, label, completed?}' }
			},
			progressQueryCode: { type: 'string', description: 'Pass null to clear' },
			progressQueryId: { type: 'string' },
			widgetQueryCode: { type: 'string' },
			widgetQueryId: { type: 'string' }
		},
		required: ['keyResultId']
	},
	preview: (a) => {
		const parts: string[] = [];
		if (a.title !== undefined) parts.push(`title="${a.title}"`);
		if (a.score !== undefined) parts.push(`score=${(a.score * 100).toFixed(0)}%`);
		if (a.weight !== undefined) parts.push(`weight=${a.weight}`);
		if (a.expectedHours !== undefined) parts.push(`${a.expectedHours}h`);
		if (a.measurementType !== undefined) parts.push(`type=${a.measurementType}`);
		if (a.checkboxItems !== undefined) parts.push(`${a.checkboxItems.length} checkboxes`);
		if (a.progressQueryCode !== undefined)
			parts.push(a.progressQueryCode === null ? 'clear progress code' : 'set progress code');
		if (a.progressQueryId !== undefined)
			parts.push(a.progressQueryId === null ? 'clear progress query' : `progress query`);
		if (a.widgetQueryCode !== undefined)
			parts.push(a.widgetQueryCode === null ? 'clear widget code' : 'set widget code');
		if (a.widgetQueryId !== undefined)
			parts.push(a.widgetQueryId === null ? 'clear widget query' : 'widget query');
		return `Update KR ${a.keyResultId.slice(0, 8)}: ${parts.join(', ') || '(no changes)'}`;
	},
	async execute(ctx, args) {
		const kr = await db.query.keyResults.findFirst({ where: eq(keyResults.id, args.keyResultId) });
		if (!kr) throw new Error('Key result not found');
		const obj = await db.query.objectives.findFirst({
			where: and(eq(objectives.id, kr.objectiveId), eq(objectives.userId, ctx.userId))
		});
		if (!obj) throw new Error('Key result not found');

		const updates: Record<string, unknown> = { updatedAt: new Date() };
		if (args.title !== undefined) updates.title = args.title;
		if (args.score !== undefined) updates.score = Math.max(0, Math.min(1, args.score));
		if (args.weight !== undefined) updates.weight = args.weight;
		if (args.expectedHours !== undefined) updates.expectedHours = args.expectedHours;
		if (args.details !== undefined) updates.details = args.details;
		if (args.measurementType !== undefined) updates.measurementType = args.measurementType;
		if (args.checkboxItems !== undefined) {
			const items: CheckboxItem[] = args.checkboxItems.map((it) => ({
				id: it.id ?? uuidv4(),
				label: it.label,
				completed: !!it.completed
			}));
			updates.checkboxItems = JSON.stringify(items);
		}
		if (args.progressQueryCode !== undefined) updates.progressQueryCode = args.progressQueryCode;
		if (args.progressQueryId !== undefined) updates.progressQueryId = args.progressQueryId;
		if (args.widgetQueryCode !== undefined) updates.widgetQueryCode = args.widgetQueryCode;
		if (args.widgetQueryId !== undefined) updates.widgetQueryId = args.widgetQueryId;

		await db.update(keyResults).set(updates).where(eq(keyResults.id, args.keyResultId));
		broadcastDataChange(ctx.userId, 'data:objectives');
		return { ok: true };
	}
};

interface ToggleCheckboxArgs {
	keyResultId: string;
	checkboxId: string;
	completed: boolean;
}

export const toggleKeyResultCheckbox: ToolDef<ToggleCheckboxArgs> = {
	name: 'toggle_key_result_checkbox',
	category: 'write',
	description:
		'Toggle a single checkbox on a checkboxes-type key result. Use checkboxItems[].id from list_objectives or get_objective.',
	parameters: {
		type: 'object',
		properties: {
			keyResultId: { type: 'string' },
			checkboxId: { type: 'string' },
			completed: { type: 'boolean' }
		},
		required: ['keyResultId', 'checkboxId', 'completed']
	},
	preview: (a) => `${a.completed ? 'Check' : 'Uncheck'} ${a.checkboxId.slice(0, 8)} on KR ${a.keyResultId.slice(0, 8)}`,
	async execute(ctx, args) {
		const kr = await db.query.keyResults.findFirst({ where: eq(keyResults.id, args.keyResultId) });
		if (!kr) throw new Error('Key result not found');
		const obj = await db.query.objectives.findFirst({
			where: and(eq(objectives.id, kr.objectiveId), eq(objectives.userId, ctx.userId))
		});
		if (!obj) throw new Error('Key result not found');
		if (!kr.checkboxItems) throw new Error('This KR has no checkbox items');

		const items: CheckboxItem[] = JSON.parse(kr.checkboxItems);
		const target = items.find((i) => i.id === args.checkboxId);
		if (!target) throw new Error('Checkbox item not found');
		target.completed = args.completed;

		await db
			.update(keyResults)
			.set({ checkboxItems: JSON.stringify(items), updatedAt: new Date() })
			.where(eq(keyResults.id, args.keyResultId));
		broadcastDataChange(ctx.userId, 'data:objectives');
		return { ok: true };
	}
};

interface DeleteKeyResultArgs {
	keyResultId: string;
}

export const deleteKeyResult: ToolDef<DeleteKeyResultArgs> = {
	name: 'delete_key_result',
	category: 'write',
	description: 'Delete a key result by id.',
	parameters: {
		type: 'object',
		properties: { keyResultId: { type: 'string' } },
		required: ['keyResultId']
	},
	preview: (a) => `Delete KR ${a.keyResultId.slice(0, 8)}`,
	async execute(ctx, args) {
		const kr = await db.query.keyResults.findFirst({ where: eq(keyResults.id, args.keyResultId) });
		if (!kr) throw new Error('Key result not found');
		const obj = await db.query.objectives.findFirst({
			where: and(eq(objectives.id, kr.objectiveId), eq(objectives.userId, ctx.userId))
		});
		if (!obj) throw new Error('Key result not found');
		await db.delete(keyResults).where(eq(keyResults.id, args.keyResultId));
		broadcastDataChange(ctx.userId, 'data:objectives');
		return { ok: true };
	}
};
