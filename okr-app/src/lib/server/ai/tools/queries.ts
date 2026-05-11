import { db } from '$lib/db/client';
import { savedQueries } from '$lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { executeQuery } from '$lib/server/query/executor';
import type { ToolDef } from './types';

type QueryType = 'progress' | 'widget' | 'general';

interface ListQueriesArgs {
	queryType?: QueryType;
}

export const listSavedQueries: ToolDef<ListQueriesArgs> = {
	name: 'list_saved_queries',
	category: 'read',
	description: "List the user's saved JavaScript queries. Optional queryType filter.",
	parameters: {
		type: 'object',
		properties: {
			queryType: { type: 'string', enum: ['progress', 'widget', 'general'] }
		}
	},
	preview: (a) => `List saved queries${a.queryType ? ` (${a.queryType})` : ''}`,
	async execute(ctx, args) {
		const rows = args.queryType
			? await db.query.savedQueries.findMany({
					where: and(
						eq(savedQueries.userId, ctx.userId),
						eq(savedQueries.queryType, args.queryType)
					)
				})
			: await db.query.savedQueries.findMany({ where: eq(savedQueries.userId, ctx.userId) });
		return {
			queries: rows.map((q) => ({
				id: q.id,
				name: q.name,
				description: q.description,
				queryType: q.queryType,
				codePreview: q.code.length > 200 ? q.code.slice(0, 200) + '…' : q.code
			}))
		};
	}
};

interface GetQueryArgs {
	queryId: string;
}

export const getSavedQuery: ToolDef<GetQueryArgs> = {
	name: 'get_saved_query',
	category: 'read',
	description: 'Fetch full code + metadata for a saved query.',
	parameters: {
		type: 'object',
		properties: { queryId: { type: 'string' } },
		required: ['queryId']
	},
	preview: (a) => `Get saved query ${a.queryId.slice(0, 8)}`,
	async execute(ctx, args) {
		const q = await db.query.savedQueries.findFirst({
			where: and(eq(savedQueries.id, args.queryId), eq(savedQueries.userId, ctx.userId))
		});
		if (!q) throw new Error('Query not found');
		return { query: q };
	}
};

interface CreateQueryArgs {
	name: string;
	code: string;
	queryType?: QueryType;
	description?: string;
}

export const createSavedQuery: ToolDef<CreateQueryArgs, { queryId: string }> = {
	name: 'create_saved_query',
	category: 'write',
	description:
		'Create a new saved JavaScript query. queryType controls how it can be used: "progress" (KR scoring, must call progress.set), "widget" (dashboard/KR widget, uses render.*), "general" (default). The code runs in the sandboxed query environment — see the Query Builder for the API.',
	parameters: {
		type: 'object',
		properties: {
			name: { type: 'string' },
			code: { type: 'string', description: 'JavaScript body' },
			queryType: { type: 'string', enum: ['progress', 'widget', 'general'] },
			description: { type: 'string' }
		},
		required: ['name', 'code']
	},
	preview: (a) => `Create ${a.queryType ?? 'general'} query: "${a.name}"`,
	async execute(ctx, args) {
		const id = uuidv4();
		const now = new Date();
		await db.insert(savedQueries).values({
			id,
			userId: ctx.userId,
			name: args.name.trim(),
			description: args.description?.trim() ?? null,
			queryType: args.queryType ?? 'general',
			code: args.code,
			createdAt: now,
			updatedAt: now
		});
		return { queryId: id };
	}
};

interface UpdateQueryArgs {
	queryId: string;
	name?: string;
	description?: string;
	code?: string;
	queryType?: QueryType;
}

export const updateSavedQuery: ToolDef<UpdateQueryArgs> = {
	name: 'update_saved_query',
	category: 'write',
	description: 'Update fields on a saved query.',
	parameters: {
		type: 'object',
		properties: {
			queryId: { type: 'string' },
			name: { type: 'string' },
			description: { type: 'string' },
			code: { type: 'string' },
			queryType: { type: 'string', enum: ['progress', 'widget', 'general'] }
		},
		required: ['queryId']
	},
	preview: (a) => `Update query ${a.queryId.slice(0, 8)}`,
	async execute(ctx, args) {
		const existing = await db.query.savedQueries.findFirst({
			where: and(eq(savedQueries.id, args.queryId), eq(savedQueries.userId, ctx.userId))
		});
		if (!existing) throw new Error('Query not found');
		const updates: Record<string, unknown> = { updatedAt: new Date() };
		if (args.name !== undefined) updates.name = args.name.trim();
		if (args.description !== undefined) updates.description = args.description?.trim() ?? null;
		if (args.code !== undefined) updates.code = args.code;
		if (args.queryType !== undefined) updates.queryType = args.queryType;
		await db.update(savedQueries).set(updates).where(eq(savedQueries.id, args.queryId));
		return { ok: true };
	}
};

interface DeleteQueryArgs {
	queryId: string;
}

export const deleteSavedQuery: ToolDef<DeleteQueryArgs> = {
	name: 'delete_saved_query',
	category: 'write',
	description: 'Delete a saved query.',
	parameters: {
		type: 'object',
		properties: { queryId: { type: 'string' } },
		required: ['queryId']
	},
	preview: (a) => `Delete query ${a.queryId.slice(0, 8)}`,
	async execute(ctx, args) {
		const existing = await db.query.savedQueries.findFirst({
			where: and(eq(savedQueries.id, args.queryId), eq(savedQueries.userId, ctx.userId))
		});
		if (!existing) throw new Error('Query not found');
		await db.delete(savedQueries).where(eq(savedQueries.id, args.queryId));
		return { ok: true };
	}
};

interface RunQueryArgs {
	queryId?: string;
	code?: string;
	params?: Record<string, unknown>;
}

export const runQuery: ToolDef<RunQueryArgs> = {
	name: 'run_query',
	category: 'read',
	description:
		'Execute a saved query or an ad-hoc code body in the sandbox and return its rendered output. Pass either queryId (run a saved query) or code (run inline). Optional params is passed in as `params` to the query.',
	parameters: {
		type: 'object',
		properties: {
			queryId: { type: 'string' },
			code: { type: 'string' },
			params: { type: 'object', description: 'JSON params object' }
		}
	},
	preview: (a) =>
		a.queryId ? `Run query ${a.queryId.slice(0, 8)}` : `Run ad-hoc query (${(a.code ?? '').length} chars)`,
	async execute(ctx, args) {
		let code = args.code;
		if (!code) {
			if (!args.queryId) throw new Error('Either queryId or code is required');
			const q = await db.query.savedQueries.findFirst({
				where: and(eq(savedQueries.id, args.queryId), eq(savedQueries.userId, ctx.userId))
			});
			if (!q) throw new Error('Query not found');
			code = q.code;
		}
		const result = await executeQuery(code, ctx.userId, args.params ?? {});
		if (result.error) throw new Error(result.error);
		return {
			result: result.result,
			renders: result.renders,
			progressValue: result.progressValue,
			progressLabel: result.progressLabel
		};
	}
};
