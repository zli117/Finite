import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/db/client';
import { dashboardWidgets } from '$lib/db/schema';
import { eq, and } from 'drizzle-orm';

// PUT /api/dashboard/widgets/[id] - Update a widget
export const PUT: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const widget = await db.query.dashboardWidgets.findFirst({
		where: and(
			eq(dashboardWidgets.id, params.id),
			eq(dashboardWidgets.userId, locals.user.id)
		)
	});

	if (!widget) {
		return json({ error: 'Widget not found' }, { status: 404 });
	}

	try {
		const body = await request.json();
		const { title, code, queryId, sortOrder } = body;

		const updates: Record<string, unknown> = {};

		if (title !== undefined) {
			updates.title = title;
		}

		if (code !== undefined || queryId !== undefined) {
			const widgetType = queryId ? 'saved' : 'custom';
			updates.widgetType = widgetType;
			updates.config = JSON.stringify(queryId ? { queryId } : { code });
		}

		if (sortOrder !== undefined) {
			updates.sortOrder = sortOrder;
		}

		if (Object.keys(updates).length === 0) {
			return json({ error: 'No updates provided' }, { status: 400 });
		}

		await db.update(dashboardWidgets)
			.set(updates)
			.where(eq(dashboardWidgets.id, params.id));

		const updatedWidget = await db.query.dashboardWidgets.findFirst({
			where: eq(dashboardWidgets.id, params.id)
		});

		return json({
			widget: {
				id: updatedWidget!.id,
				title: updatedWidget!.title,
				widgetType: updatedWidget!.widgetType,
				config: JSON.parse(updatedWidget!.config),
				sortOrder: updatedWidget!.sortOrder
			}
		});
	} catch (error) {
		console.error('Error updating widget:', error);
		return json({ error: 'Failed to update widget' }, { status: 500 });
	}
};

// DELETE /api/dashboard/widgets/[id] - Delete a widget
export const DELETE: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const widget = await db.query.dashboardWidgets.findFirst({
		where: and(
			eq(dashboardWidgets.id, params.id),
			eq(dashboardWidgets.userId, locals.user.id)
		)
	});

	if (!widget) {
		return json({ error: 'Widget not found' }, { status: 404 });
	}

	await db.delete(dashboardWidgets).where(eq(dashboardWidgets.id, params.id));

	return json({ success: true });
};
