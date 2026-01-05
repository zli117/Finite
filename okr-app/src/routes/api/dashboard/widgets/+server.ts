import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/db/client';
import { dashboardWidgets } from '$lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

// GET /api/dashboard/widgets - Get all widgets for the current user
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const widgets = await db.query.dashboardWidgets.findMany({
		where: and(
			eq(dashboardWidgets.userId, locals.user.id),
			eq(dashboardWidgets.page, 'dashboard')
		),
		orderBy: (w, { asc }) => [asc(w.sortOrder)]
	});

	return json({
		widgets: widgets.map(w => ({
			id: w.id,
			title: w.title,
			widgetType: w.widgetType,
			config: JSON.parse(w.config),
			sortOrder: w.sortOrder
		}))
	});
};

// POST /api/dashboard/widgets - Create a new widget
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const body = await request.json();
		const { title, code, queryId } = body;

		// Get max sort order
		const existing = await db.query.dashboardWidgets.findMany({
			where: and(
				eq(dashboardWidgets.userId, locals.user.id),
				eq(dashboardWidgets.page, 'dashboard')
			)
		});
		const maxSortOrder = existing.reduce((max, w) => Math.max(max, w.sortOrder), -1);

		const id = uuidv4();
		const widgetType = queryId ? 'saved' : 'custom';
		const config = JSON.stringify(queryId ? { queryId } : { code: code || '' });

		await db.insert(dashboardWidgets).values({
			id,
			userId: locals.user.id,
			title: title || 'New Widget',
			widgetType,
			config,
			sortOrder: maxSortOrder + 1,
			page: 'dashboard'
		});

		const widget = await db.query.dashboardWidgets.findFirst({
			where: eq(dashboardWidgets.id, id)
		});

		return json({
			widget: {
				id: widget!.id,
				title: widget!.title,
				widgetType: widget!.widgetType,
				config: JSON.parse(widget!.config),
				sortOrder: widget!.sortOrder
			}
		}, { status: 201 });
	} catch (error) {
		console.error('Error creating widget:', error);
		return json({ error: 'Failed to create widget' }, { status: 500 });
	}
};
