import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { executeTool, getUserToolContext, TOOLS } from '$lib/server/ai/tools';

/**
 * POST /api/ai/tool — execute a single approved tool call (write).
 * Body: { name, args, id? }
 * Read tools are also allowed here (no-op for security; they're side-effect-free)
 * but normally these are auto-executed during chat.
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const body = await request.json().catch(() => null);
	if (!body || typeof body !== 'object') {
		return json({ error: 'Invalid body' }, { status: 400 });
	}

	const { name, args, id } = body as { name?: string; args?: Record<string, unknown>; id?: string };
	if (!name || !TOOLS[name]) {
		return json({ error: `Unknown tool: ${name}` }, { status: 400 });
	}

	const ctx = await getUserToolContext(locals.user.id);
	const result = await executeTool(ctx, {
		id: id || `call_${Date.now()}`,
		name,
		args: args || {}
	});

	if (!result.ok) {
		return json({ ok: false, error: result.error }, { status: 400 });
	}
	return json({ ok: true, result: result.result });
};
