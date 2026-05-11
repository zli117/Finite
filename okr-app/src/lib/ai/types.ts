export type AiChatContext =
	| 'query'
	| 'kr_progress'
	| 'widget'
	| 'metric'
	| 'objectives'
	| 'daily_plan'
	| 'weekly_plan'
	| 'metrics_template';

export interface AiAction {
	type: string;
	label?: string;
	payload: unknown;
	raw: string;
}
