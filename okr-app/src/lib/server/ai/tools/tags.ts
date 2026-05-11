import { db } from '$lib/db/client';
import { tags, taskTags, tasks } from '$lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { broadcastDataChange } from '$lib/server/events';
import type { ToolDef } from './types';

export const listTags: ToolDef = {
	name: 'list_tags',
	category: 'read',
	description: 'List all tags the user has defined.',
	parameters: { type: 'object', properties: {} },
	preview: () => 'List all tags',
	async execute(ctx) {
		const rows = await db.query.tags.findMany({
			where: eq(tags.userId, ctx.userId),
			orderBy: (t, { asc }) => [asc(t.category), asc(t.name)]
		});
		return { tags: rows };
	}
};

interface CreateTagArgs {
	name: string;
	color?: string;
	category?: string;
}

export const createTag: ToolDef<CreateTagArgs, { tagId: string }> = {
	name: 'create_tag',
	category: 'write',
	description: 'Create a new tag for categorizing tasks.',
	parameters: {
		type: 'object',
		properties: {
			name: { type: 'string' },
			color: { type: 'string', description: 'Hex like #3b82f6' },
			category: { type: 'string', description: 'e.g. work, health, social' }
		},
		required: ['name']
	},
	preview: (a) => `Create tag "${a.name}"${a.category ? ` (${a.category})` : ''}`,
	async execute(ctx, args) {
		const existing = await db.query.tags.findFirst({
			where: and(eq(tags.userId, ctx.userId), eq(tags.name, args.name.trim()))
		});
		if (existing) throw new Error('Tag with this name already exists');
		const id = uuidv4();
		await db.insert(tags).values({
			id,
			userId: ctx.userId,
			name: args.name.trim(),
			color: args.color ?? null,
			category: args.category ?? null
		});
		broadcastDataChange(ctx.userId, 'data:tags');
		return { tagId: id };
	}
};

interface UpdateTagArgs {
	tagId: string;
	name?: string;
	color?: string;
	category?: string;
}

export const updateTag: ToolDef<UpdateTagArgs> = {
	name: 'update_tag',
	category: 'write',
	description: 'Update a tag\'s name, color, or category.',
	parameters: {
		type: 'object',
		properties: {
			tagId: { type: 'string' },
			name: { type: 'string' },
			color: { type: 'string' },
			category: { type: 'string' }
		},
		required: ['tagId']
	},
	preview: (a) => `Update tag ${a.tagId.slice(0, 8)}`,
	async execute(ctx, args) {
		const existing = await db.query.tags.findFirst({
			where: and(eq(tags.id, args.tagId), eq(tags.userId, ctx.userId))
		});
		if (!existing) throw new Error('Tag not found');
		await db
			.update(tags)
			.set({
				name: args.name?.trim() ?? existing.name,
				color: args.color !== undefined ? args.color : existing.color,
				category: args.category !== undefined ? args.category : existing.category
			})
			.where(eq(tags.id, args.tagId));
		broadcastDataChange(ctx.userId, 'data:tags');
		return { ok: true };
	}
};

interface DeleteTagArgs {
	tagId: string;
}

export const deleteTag: ToolDef<DeleteTagArgs> = {
	name: 'delete_tag',
	category: 'write',
	description: 'Delete a tag (also removes it from all tasks).',
	parameters: {
		type: 'object',
		properties: { tagId: { type: 'string' } },
		required: ['tagId']
	},
	preview: (a) => `Delete tag ${a.tagId.slice(0, 8)}`,
	async execute(ctx, args) {
		const existing = await db.query.tags.findFirst({
			where: and(eq(tags.id, args.tagId), eq(tags.userId, ctx.userId))
		});
		if (!existing) throw new Error('Tag not found');
		await db.delete(tags).where(eq(tags.id, args.tagId));
		broadcastDataChange(ctx.userId, 'data:tags', 'data:tasks');
		return { ok: true };
	}
};

interface SetTaskTagsArgs {
	taskId: string;
	tagIds: string[];
}

export const setTaskTags: ToolDef<SetTaskTagsArgs> = {
	name: 'set_task_tags',
	category: 'write',
	description:
		'Replace the set of tags on a task. Pass the full desired list of tag ids; existing assignments not in the list are removed.',
	parameters: {
		type: 'object',
		properties: {
			taskId: { type: 'string' },
			tagIds: { type: 'array', items: { type: 'string' } }
		},
		required: ['taskId', 'tagIds']
	},
	preview: (a) => `Set tags on task ${a.taskId.slice(0, 8)} (${a.tagIds.length} tags)`,
	async execute(ctx, args) {
		const task = await db.query.tasks.findFirst({
			where: and(eq(tasks.id, args.taskId), eq(tasks.userId, ctx.userId))
		});
		if (!task) throw new Error('Task not found');

		// Verify all tag ids belong to user
		for (const tagId of args.tagIds) {
			const t = await db.query.tags.findFirst({
				where: and(eq(tags.id, tagId), eq(tags.userId, ctx.userId))
			});
			if (!t) throw new Error(`Tag not found: ${tagId}`);
		}

		await db.delete(taskTags).where(eq(taskTags.taskId, args.taskId));
		for (const tagId of args.tagIds) {
			await db.insert(taskTags).values({ taskId: args.taskId, tagId });
		}
		broadcastDataChange(ctx.userId, 'data:tasks', 'data:weekly');
		return { ok: true };
	}
};
