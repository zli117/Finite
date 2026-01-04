import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { executeQuery } from '$lib/server/query/executor';

// POST /api/queries/execute - Execute a query
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const body = await request.json();
		const { code, params } = body;

		if (!code || typeof code !== 'string') {
			return json({ error: 'Code is required' }, { status: 400 });
		}

		const result = await executeQuery(code, locals.user.id, params || {});

		if (result.error) {
			return json({ error: result.error }, { status: 400 });
		}

		return json({ result: result.result });
	} catch (error) {
		console.error('Error executing query:', error);
		return json({ error: 'Failed to execute query' }, { status: 500 });
	}
};
