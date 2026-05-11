import { db } from '$lib/db/client';
import { dashboardWidgets } from '$lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { broadcastDataChange } from '$lib/server/events';
import type { ToolDef } from './types';

export const listDashboardWidgets: ToolDef = {
	name: 'list_dashboard_widgets',
	category: 'read',
	description: "List the user's dashboard widgets.",
	parameters: { type: 'object', properties: {} },
	preview: () => 'List dashboard widgets',
	async execute(ctx) {
		const rows = await db.query.dashboardWidgets.findMany({
			where: and(
				eq(dashboardWidgets.userId, ctx.userId),
				eq(dashboardWidgets.page, 'dashboard')
			),
			orderBy: (w, { asc }) => [asc(w.sortOrder)]
		});
		return {
			widgets: rows.map((w) => ({
				id: w.id,
				title: w.title,
				widgetType: w.widgetType,
				config: JSON.parse(w.config),
				sortOrder: w.sortOrder
			}))
		};
	}
};

interface CreateWidgetArgs {
	title: string;
	code?: string;
	queryId?: string;
}

export const createDashboardWidget: ToolDef<CreateWidgetArgs, { widgetId: string }> = {
	name: 'create_dashboard_widget',
	category: 'write',
	description:
		'Add a widget to the dashboard. Pass code (inline JS that renders the widget) OR queryId (a saved widget query). Code uses render.markdown/render.table/render.plot.* — see the Query Builder.',
	parameters: {
		type: 'object',
		properties: {
			title: { type: 'string' },
			code: { type: 'string', description: 'Inline JS body' },
			queryId: { type: 'string', description: 'Saved-query id (alternative to code)' }
		},
		required: ['title']
	},
	preview: (a) => `Add widget "${a.title}"${a.queryId ? ' (saved query)' : ''}`,
	async execute(ctx, args) {
		if (!args.code && !args.queryId) throw new Error('Either code or queryId is required');
		const existing = await db.query.dashboardWidgets.findMany({
			where: and(
				eq(dashboardWidgets.userId, ctx.userId),
				eq(dashboardWidgets.page, 'dashboard')
			)
		});
		const maxSort = existing.reduce((m, w) => Math.max(m, w.sortOrder), -1);
		const id = uuidv4();
		const widgetType = args.queryId ? 'saved' : 'custom';
		const config = JSON.stringify(args.queryId ? { queryId: args.queryId } : { code: args.code });
		await db.insert(dashboardWidgets).values({
			id,
			userId: ctx.userId,
			title: args.title,
			widgetType,
			config,
			sortOrder: maxSort + 1,
			page: 'dashboard'
		});
		broadcastDataChange(ctx.userId, 'data:dashboard');
		return { widgetId: id };
	}
};

interface UpdateWidgetArgs {
	widgetId: string;
	title?: string;
	code?: string;
	queryId?: string;
	sortOrder?: number;
}

export const updateDashboardWidget: ToolDef<UpdateWidgetArgs> = {
	name: 'update_dashboard_widget',
	category: 'write',
	description:
		'Update a dashboard widget. Passing code or queryId replaces the widget config (and switches the type accordingly).',
	parameters: {
		type: 'object',
		properties: {
			widgetId: { type: 'string' },
			title: { type: 'string' },
			code: { type: 'string' },
			queryId: { type: 'string' },
			sortOrder: { type: 'integer' }
		},
		required: ['widgetId']
	},
	preview: (a) => `Update widget ${a.widgetId.slice(0, 8)}`,
	async execute(ctx, args) {
		const existing = await db.query.dashboardWidgets.findFirst({
			where: and(eq(dashboardWidgets.id, args.widgetId), eq(dashboardWidgets.userId, ctx.userId))
		});
		if (!existing) throw new Error('Widget not found');
		const updates: Record<string, unknown> = {};
		if (args.title !== undefined) updates.title = args.title;
		if (args.code !== undefined || args.queryId !== undefined) {
			const widgetType = args.queryId ? 'saved' : 'custom';
			updates.widgetType = widgetType;
			updates.config = JSON.stringify(args.queryId ? { queryId: args.queryId } : { code: args.code });
		}
		if (args.sortOrder !== undefined) updates.sortOrder = args.sortOrder;
		await db.update(dashboardWidgets).set(updates).where(eq(dashboardWidgets.id, args.widgetId));
		broadcastDataChange(ctx.userId, 'data:dashboard');
		return { ok: true };
	}
};

interface DeleteWidgetArgs {
	widgetId: string;
}

export const deleteDashboardWidget: ToolDef<DeleteWidgetArgs> = {
	name: 'delete_dashboard_widget',
	category: 'write',
	description: 'Delete a dashboard widget.',
	parameters: {
		type: 'object',
		properties: { widgetId: { type: 'string' } },
		required: ['widgetId']
	},
	preview: (a) => `Delete widget ${a.widgetId.slice(0, 8)}`,
	async execute(ctx, args) {
		const existing = await db.query.dashboardWidgets.findFirst({
			where: and(eq(dashboardWidgets.id, args.widgetId), eq(dashboardWidgets.userId, ctx.userId))
		});
		if (!existing) throw new Error('Widget not found');
		await db.delete(dashboardWidgets).where(eq(dashboardWidgets.id, args.widgetId));
		broadcastDataChange(ctx.userId, 'data:dashboard');
		return { ok: true };
	}
};
