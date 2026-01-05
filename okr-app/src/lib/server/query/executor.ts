import { getQuickJS, type QuickJSContext, type QuickJSHandle } from 'quickjs-emscripten';
import type { QueryAPI, QueryFilters, DailyRecord, WeeklyRecord, TaskRecord, ObjectiveRecord } from './types';
import { db } from '$lib/db/client';
import { timePeriods, tasks, taskAttributes, dailyMetrics, objectives, keyResults, tags, taskTags } from '$lib/db/schema';
import { eq, and, gte, lte, between } from 'drizzle-orm';

const EXECUTION_TIMEOUT_MS = 5000;
const MAX_MEMORY_BYTES = 128 * 1024 * 1024; // 128MB

// Render output types
export interface RenderOutput {
	type: 'markdown' | 'table' | 'plotly';
	content: unknown;
}

export interface TableData {
	headers: string[];
	rows: (string | number)[][];
}

export interface PlotlyData {
	data: Array<{
		type: string;
		x?: (string | number)[];
		y?: (string | number)[];
		values?: number[];
		labels?: string[];
		name?: string;
		mode?: string;
		marker?: { color?: string | string[] };
		[key: string]: unknown;
	}>;
	layout?: {
		title?: string;
		xaxis?: { title?: string };
		yaxis?: { title?: string };
		barmode?: string;
		[key: string]: unknown;
	};
}

export interface QueryResult {
	result: unknown;
	renders: RenderOutput[];
	error?: string;
}

/**
 * Execute user-defined JavaScript code in a sandboxed QuickJS environment
 * with access to the Query API for fetching OKR data
 */
export async function executeQuery(
	code: string,
	userId: string,
	params: Record<string, unknown> = {}
): Promise<QueryResult> {
	const QuickJS = await getQuickJS();
	const runtime = QuickJS.newRuntime();

	// Set memory limit
	runtime.setMemoryLimit(MAX_MEMORY_BYTES);

	// Set execution timeout
	runtime.setInterruptHandler(() => {
		return shouldInterrupt;
	});

	let shouldInterrupt = false;
	const timeoutId = setTimeout(() => {
		shouldInterrupt = true;
	}, EXECUTION_TIMEOUT_MS);

	const context = runtime.newContext();

	// Collect render outputs
	const renders: RenderOutput[] = [];

	try {
		// Build the query API and inject it into the context
		await injectQueryAPI(context, userId);

		// Inject the render API
		injectRenderAPI(context, renders);

		// Inject params
		const paramsHandle = jsonToHandle(context, params);
		context.setProp(context.global, 'params', paramsHandle);
		paramsHandle.dispose();

		// Wrap user code in an async IIFE
		const wrappedCode = `
			(async () => {
				${code}
			})()
		`;

		const result = context.evalCode(wrappedCode);

		if (result.error) {
			const errorMessage = context.dump(result.error);
			result.error.dispose();
			return { result: null, renders: [], error: String(errorMessage) };
		}

		// Handle promise result
		const promiseHandle = result.value;

		// Set up continuous event loop pumping while waiting for promise resolution
		// This is necessary because resolvePromise waits for the QuickJS promise to resolve,
		// but the promise won't resolve unless we keep pumping the event loop
		const pumpInterval = setInterval(() => {
			context.runtime.executePendingJobs();
		}, 1);

		let resolvedResult;
		try {
			resolvedResult = await context.resolvePromise(promiseHandle);
		} finally {
			clearInterval(pumpInterval);
		}
		promiseHandle.dispose();

		if (resolvedResult.error) {
			const errorMessage = context.dump(resolvedResult.error);
			resolvedResult.error.dispose();
			return { result: null, renders, error: String(errorMessage) };
		}

		const finalResult = context.dump(resolvedResult.value);
		resolvedResult.value.dispose();

		return { result: finalResult, renders };
	} catch (error) {
		return {
			result: null,
			renders,
			error: error instanceof Error ? error.message : 'Query execution failed'
		};
	} finally {
		clearTimeout(timeoutId);
		context.dispose();
		runtime.dispose();
	}
}

/**
 * Inject the Query API object into the QuickJS context
 */
async function injectQueryAPI(context: QuickJSContext, userId: string) {
	// Create the 'q' object
	const qHandle = context.newObject();

	// Add daily() method
	const dailyFn = context.newFunction('daily', (...args) => {
		const filtersHandle = args[0];
		const filters = filtersHandle ? context.dump(filtersHandle) : {};
		const promise = context.newPromise();

		fetchDaily(userId, filters as QueryFilters)
			.then((data) => {
				const dataHandle = jsonToHandle(context, data);
				promise.resolve(dataHandle);
				dataHandle.dispose();
			})
			.catch((err) => {
				const errHandle = context.newString(err.message);
				promise.reject(errHandle);
				errHandle.dispose();
			});

		promise.settled.then(context.runtime.executePendingJobs);
		return promise.handle;
	});
	context.setProp(qHandle, 'daily', dailyFn);
	dailyFn.dispose();

	// Add tasks() method
	const tasksFn = context.newFunction('tasks', (...args) => {
		const filtersHandle = args[0];
		const filters = filtersHandle ? context.dump(filtersHandle) : {};
		const promise = context.newPromise();

		fetchTasks(userId, filters as QueryFilters)
			.then((data) => {
				const dataHandle = jsonToHandle(context, data);
				promise.resolve(dataHandle);
				dataHandle.dispose();
			})
			.catch((err) => {
				const errHandle = context.newString(err.message);
				promise.reject(errHandle);
				errHandle.dispose();
			});

		promise.settled.then(context.runtime.executePendingJobs);
		return promise.handle;
	});
	context.setProp(qHandle, 'tasks', tasksFn);
	tasksFn.dispose();

	// Add objectives() method
	const objectivesFn = context.newFunction('objectives', (...args) => {
		const filtersHandle = args[0];
		const filters = filtersHandle ? context.dump(filtersHandle) : {};
		const promise = context.newPromise();

		fetchObjectives(userId, filters as QueryFilters)
			.then((data) => {
				const dataHandle = jsonToHandle(context, data);
				promise.resolve(dataHandle);
				dataHandle.dispose();
			})
			.catch((err) => {
				const errHandle = context.newString(err.message);
				promise.reject(errHandle);
				errHandle.dispose();
			});

		promise.settled.then(context.runtime.executePendingJobs);
		return promise.handle;
	});
	context.setProp(qHandle, 'objectives', objectivesFn);
	objectivesFn.dispose();

	// Add helper functions
	addHelperFunctions(context, qHandle);

	// Set q on global
	context.setProp(context.global, 'q', qHandle);
	qHandle.dispose();
}

/**
 * Add helper/aggregation functions to the q object
 */
function addHelperFunctions(context: QuickJSContext, qHandle: QuickJSHandle) {
	// sum(items, field)
	const sumFn = context.newFunction('sum', (itemsHandle, fieldHandle) => {
		const items = context.dump(itemsHandle) as Record<string, unknown>[];
		const field = context.dump(fieldHandle) as string;
		const result = items.reduce((acc, item) => {
			const val = parseFloat(String(item[field] || 0));
			return acc + (isNaN(val) ? 0 : val);
		}, 0);
		return context.newNumber(result);
	});
	context.setProp(qHandle, 'sum', sumFn);
	sumFn.dispose();

	// avg(items, field)
	const avgFn = context.newFunction('avg', (itemsHandle, fieldHandle) => {
		const items = context.dump(itemsHandle) as Record<string, unknown>[];
		const field = context.dump(fieldHandle) as string;
		if (items.length === 0) return context.newNumber(0);
		const sum = items.reduce((acc, item) => {
			const val = parseFloat(String(item[field] || 0));
			return acc + (isNaN(val) ? 0 : val);
		}, 0);
		return context.newNumber(sum / items.length);
	});
	context.setProp(qHandle, 'avg', avgFn);
	avgFn.dispose();

	// count(items, predicate?)
	const countFn = context.newFunction('count', (itemsHandle) => {
		const items = context.dump(itemsHandle) as unknown[];
		return context.newNumber(items.length);
	});
	context.setProp(qHandle, 'count', countFn);
	countFn.dispose();

	// formatDuration(minutes) -> "Xh Ym"
	const formatDurationFn = context.newFunction('formatDuration', (minutesHandle) => {
		const minutes = context.dump(minutesHandle) as number;
		const h = Math.floor(minutes / 60);
		const m = Math.round(minutes % 60);
		if (h === 0) return context.newString(`${m}m`);
		if (m === 0) return context.newString(`${h}h`);
		return context.newString(`${h}h ${m}m`);
	});
	context.setProp(qHandle, 'formatDuration', formatDurationFn);
	formatDurationFn.dispose();

	// formatPercent(value, total) -> "X%"
	const formatPercentFn = context.newFunction('formatPercent', (valueHandle, totalHandle) => {
		const value = context.dump(valueHandle) as number;
		const total = context.dump(totalHandle) as number;
		if (total === 0) return context.newString('0%');
		const percent = Math.round((value / total) * 100);
		return context.newString(`${percent}%`);
	});
	context.setProp(qHandle, 'formatPercent', formatPercentFn);
	formatPercentFn.dispose();

	// parseTime(timeStr) -> minutes
	const parseTimeFn = context.newFunction('parseTime', (timeHandle) => {
		const timeStr = context.dump(timeHandle) as string;
		if (!timeStr) return context.newNumber(0);
		const parts = timeStr.split(':').map(Number);
		if (parts.length === 2) {
			return context.newNumber(parts[0] * 60 + parts[1]);
		}
		return context.newNumber(0);
	});
	context.setProp(qHandle, 'parseTime', parseTimeFn);
	parseTimeFn.dispose();
}

/**
 * Inject the render API for outputting markdown, tables, and plots
 */
function injectRenderAPI(context: QuickJSContext, renders: RenderOutput[]) {
	const renderHandle = context.newObject();

	// render.markdown(text)
	const markdownFn = context.newFunction('markdown', (textHandle) => {
		const text = context.dump(textHandle) as string;
		renders.push({ type: 'markdown', content: text });
		return context.undefined;
	});
	context.setProp(renderHandle, 'markdown', markdownFn);
	markdownFn.dispose();

	// render.table({ headers: [...], rows: [...] })
	const tableFn = context.newFunction('table', (dataHandle) => {
		const data = context.dump(dataHandle) as TableData;
		renders.push({ type: 'table', content: data });
		return context.undefined;
	});
	context.setProp(renderHandle, 'table', tableFn);
	tableFn.dispose();

	// Create render.plot object with chart helpers
	const plotHandle = context.newObject();

	// render.plot.bar({ x, y, title?, xLabel?, yLabel?, color? })
	const barFn = context.newFunction('bar', (optsHandle) => {
		const opts = context.dump(optsHandle) as {
			x: (string | number)[];
			y: number[];
			title?: string;
			xLabel?: string;
			yLabel?: string;
			color?: string;
		};
		const plotData: PlotlyData = {
			data: [{
				type: 'bar',
				x: opts.x,
				y: opts.y,
				marker: opts.color ? { color: opts.color } : undefined
			}],
			layout: {
				title: opts.title,
				xaxis: opts.xLabel ? { title: opts.xLabel } : undefined,
				yaxis: opts.yLabel ? { title: opts.yLabel } : undefined
			}
		};
		renders.push({ type: 'plotly', content: plotData });
		return context.undefined;
	});
	context.setProp(plotHandle, 'bar', barFn);
	barFn.dispose();

	// render.plot.line({ x, y, title?, xLabel?, yLabel?, color? })
	const lineFn = context.newFunction('line', (optsHandle) => {
		const opts = context.dump(optsHandle) as {
			x: (string | number)[];
			y: number[];
			title?: string;
			xLabel?: string;
			yLabel?: string;
			color?: string;
		};
		const plotData: PlotlyData = {
			data: [{
				type: 'scatter',
				mode: 'lines+markers',
				x: opts.x,
				y: opts.y,
				marker: opts.color ? { color: opts.color } : undefined
			}],
			layout: {
				title: opts.title,
				xaxis: opts.xLabel ? { title: opts.xLabel } : undefined,
				yaxis: opts.yLabel ? { title: opts.yLabel } : undefined
			}
		};
		renders.push({ type: 'plotly', content: plotData });
		return context.undefined;
	});
	context.setProp(plotHandle, 'line', lineFn);
	lineFn.dispose();

	// render.plot.pie({ values, labels, title? })
	const pieFn = context.newFunction('pie', (optsHandle) => {
		const opts = context.dump(optsHandle) as {
			values: number[];
			labels: string[];
			title?: string;
		};
		const plotData: PlotlyData = {
			data: [{
				type: 'pie',
				values: opts.values,
				labels: opts.labels
			}],
			layout: {
				title: opts.title
			}
		};
		renders.push({ type: 'plotly', content: plotData });
		return context.undefined;
	});
	context.setProp(plotHandle, 'pie', pieFn);
	pieFn.dispose();

	// render.plot.multi({ series, title?, xLabel?, yLabel? }) - multiple line series
	const multiFn = context.newFunction('multi', (optsHandle) => {
		const opts = context.dump(optsHandle) as {
			series: Array<{
				x: (string | number)[];
				y: number[];
				name: string;
				color?: string;
			}>;
			title?: string;
			xLabel?: string;
			yLabel?: string;
		};
		const plotData: PlotlyData = {
			data: opts.series.map(s => ({
				type: 'scatter',
				mode: 'lines+markers',
				x: s.x,
				y: s.y,
				name: s.name,
				marker: s.color ? { color: s.color } : undefined
			})),
			layout: {
				title: opts.title,
				xaxis: opts.xLabel ? { title: opts.xLabel } : undefined,
				yaxis: opts.yLabel ? { title: opts.yLabel } : undefined
			}
		};
		renders.push({ type: 'plotly', content: plotData });
		return context.undefined;
	});
	context.setProp(plotHandle, 'multi', multiFn);
	multiFn.dispose();

	context.setProp(renderHandle, 'plot', plotHandle);
	plotHandle.dispose();

	// Set render on global
	context.setProp(context.global, 'render', renderHandle);
	renderHandle.dispose();
}

/**
 * Convert a JavaScript value to a QuickJS handle
 */
function jsonToHandle(context: QuickJSContext, value: unknown): QuickJSHandle {
	if (value === null || value === undefined) {
		return context.undefined;
	}
	if (typeof value === 'boolean') {
		return value ? context.true : context.false;
	}
	if (typeof value === 'number') {
		return context.newNumber(value);
	}
	if (typeof value === 'string') {
		return context.newString(value);
	}
	if (value instanceof Date) {
		return context.newString(value.toISOString());
	}
	if (Array.isArray(value)) {
		const arr = context.newArray();
		for (let i = 0; i < value.length; i++) {
			const itemHandle = jsonToHandle(context, value[i]);
			context.setProp(arr, i, itemHandle);
			itemHandle.dispose();
		}
		return arr;
	}
	if (typeof value === 'object') {
		const obj = context.newObject();
		for (const [key, val] of Object.entries(value)) {
			const valHandle = jsonToHandle(context, val);
			context.setProp(obj, key, valHandle);
			valHandle.dispose();
		}
		return obj;
	}
	return context.undefined;
}

// ============= Data Fetching Functions =============

async function fetchDaily(userId: string, filters: QueryFilters): Promise<DailyRecord[]> {
	const conditions = [
		eq(timePeriods.userId, userId),
		eq(timePeriods.periodType, 'daily')
	];

	if (filters.year) {
		conditions.push(eq(timePeriods.year, filters.year));
	}
	if (filters.month) {
		conditions.push(eq(timePeriods.month, filters.month));
	}
	if (filters.week) {
		conditions.push(eq(timePeriods.week, filters.week));
	}
	if (filters.from && filters.to) {
		conditions.push(gte(timePeriods.day, filters.from));
		conditions.push(lte(timePeriods.day, filters.to));
	}

	const periods = await db.query.timePeriods.findMany({
		where: and(...conditions)
	});

	const results: DailyRecord[] = [];

	for (const period of periods) {
		// Get metrics for this period
		const metrics = await db.query.dailyMetrics.findFirst({
			where: and(
				eq(dailyMetrics.timePeriodId, period.id),
				eq(dailyMetrics.userId, userId)
			)
		});

		// Get tasks for this period
		const periodTasks = await db.query.tasks.findMany({
			where: eq(tasks.timePeriodId, period.id)
		});

		// Get task attributes
		const tasksWithAttrs = await Promise.all(
			periodTasks.map(async (task) => {
				const attrs = await db.query.taskAttributes.findMany({
					where: eq(taskAttributes.taskId, task.id)
				});
				return {
					...task,
					attributes: attrs.reduce((acc, attr) => {
						acc[attr.key] = attr.value;
						return acc;
					}, {} as Record<string, string>)
				};
			})
		);

		results.push({
			date: period.day!,
			year: period.year,
			month: period.month!,
			week: period.week!,
			sleepLength: metrics?.sleepLength || null,
			wakeUpTime: metrics?.wakeUpTime || null,
			bedTime: metrics?.previousNightBedTime || null,
			steps: metrics?.steps || null,
			cardioLoad: metrics?.cardioLoad || null,
			fitbitReadiness: metrics?.fitbitReadiness || null,
			restingHeartRate: metrics?.restingHeartRate || null,
			tasks: tasksWithAttrs,
			completedTasks: tasksWithAttrs.filter(t => t.completed).length,
			totalTasks: tasksWithAttrs.length,
			totalHours: tasksWithAttrs.reduce((sum, t) => {
				const hours = parseFloat(t.attributes?.hour || '0');
				return sum + (isNaN(hours) ? 0 : hours);
			}, 0)
		});
	}

	return results.sort((a, b) => a.date.localeCompare(b.date));
}

async function fetchTasks(userId: string, filters: QueryFilters): Promise<TaskRecord[]> {
	// First get the relevant time periods
	const periodConditions = [eq(timePeriods.userId, userId)];

	if (filters.year) {
		periodConditions.push(eq(timePeriods.year, filters.year));
	}
	if (filters.periodId) {
		periodConditions.push(eq(timePeriods.id, filters.periodId));
	}

	const periods = await db.query.timePeriods.findMany({
		where: and(...periodConditions)
	});

	const periodIds = periods.map(p => p.id);

	if (periodIds.length === 0) {
		return [];
	}

	// Get all tasks for these periods
	let allTasks = await db.query.tasks.findMany({
		where: eq(tasks.userId, userId)
	});

	// Filter by period
	allTasks = allTasks.filter(t => periodIds.includes(t.timePeriodId));

	// Filter by completion status
	if (filters.completed !== undefined) {
		allTasks = allTasks.filter(t => t.completed === filters.completed);
	}

	// Get attributes and tags for each task
	const results: TaskRecord[] = await Promise.all(
		allTasks.map(async (task) => {
			const attrs = await db.query.taskAttributes.findMany({
				where: eq(taskAttributes.taskId, task.id)
			});

			const taskTagRecords = await db.query.taskTags.findMany({
				where: eq(taskTags.taskId, task.id)
			});

			const tagIds = taskTagRecords.map(tt => tt.tagId);
			const taskTagsList = tagIds.length > 0
				? await db.query.tags.findMany({
						where: eq(tags.userId, userId)
					}).then(allTags => allTags.filter(t => tagIds.includes(t.id)))
				: [];

			// Get period info
			const period = periods.find(p => p.id === task.timePeriodId);

			return {
				id: task.id,
				title: task.title,
				completed: task.completed,
				completedAt: task.completedAt?.toISOString() || null,
				date: period?.day || null,
				year: period?.year || null,
				month: period?.month || null,
				week: period?.week || null,
				attributes: attrs.reduce((acc, attr) => {
					acc[attr.key] = attr.value;
					return acc;
				}, {} as Record<string, string>),
				tags: taskTagsList.map(t => t.name),
				hour: parseFloat(attrs.find(a => a.key === 'hour')?.value || '0'),
				progress: parseFloat(attrs.find(a => a.key === 'progress')?.value || '0')
			};
		})
	);

	// Filter by tag if specified
	if (filters.tag) {
		return results.filter(t => t.tags.includes(filters.tag!));
	}

	return results;
}

async function fetchObjectives(userId: string, filters: QueryFilters): Promise<ObjectiveRecord[]> {
	const conditions = [eq(objectives.userId, userId)];

	if (filters.year) {
		conditions.push(eq(objectives.year, filters.year));
	}
	if (filters.level) {
		conditions.push(eq(objectives.level, filters.level));
	}

	const objs = await db.query.objectives.findMany({
		where: and(...conditions)
	});

	const results: ObjectiveRecord[] = await Promise.all(
		objs.map(async (obj) => {
			const krs = await db.query.keyResults.findMany({
				where: eq(keyResults.objectiveId, obj.id)
			});

			const totalWeight = krs.reduce((sum, kr) => sum + kr.weight, 0);
			const weightedScore = totalWeight > 0
				? krs.reduce((sum, kr) => sum + kr.score * kr.weight, 0) / totalWeight
				: 0;

			return {
				id: obj.id,
				title: obj.title,
				description: obj.description,
				level: obj.level,
				year: obj.year,
				month: obj.month,
				weight: obj.weight,
				score: weightedScore,
				keyResults: krs.map(kr => ({
					id: kr.id,
					title: kr.title,
					score: kr.score,
					weight: kr.weight,
					expectedHours: kr.expectedHours
				}))
			};
		})
	);

	return results;
}
