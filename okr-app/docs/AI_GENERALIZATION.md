# Generalized AI Assistance

RUOK's AI support should work as a screen-level collaborator, not only as a code generator. The core pattern is:

1. Each page sends the current visible screen state to `/api/ai/chat` through `contextData`.
2. The system prompt tells the model which structured UI actions are available in that context.
3. The model may answer normally, or return one or more `<ruok-action>` blocks.
4. `AiChat.svelte` renders those action blocks with an Apply button.
5. The page owns the action handler and decides how to mutate local state or call existing APIs.

This keeps the AI provider generic while preserving screen-specific authorization, validation, and UX rules in the page that already owns them.

## Action Contract

Action blocks use this shape:

```html
<ruok-action type="add_daily_tasks" label="Add daily tasks">
{"tasks":[{"title":"Plan Q2 health OKRs","expectedHours":1,"tagNames":["Health"]}]}
</ruok-action>
```

The client parses the JSON and passes it to the page as:

```ts
interface AiAction {
	type: string;
	label?: string;
	payload: unknown;
	raw: string;
}
```

Pages must validate the payload before applying it. The model should never be trusted as a source of valid ids, valid enum values, or safe code.

## Current Contexts

- `objectives`: create, update, and delete objectives; create, update, and delete key results; create custom-query KRs by supplying `progressQueryCode`; draft or save reflections.
- `daily_plan`: create, update, toggle, and delete visible daily tasks; draft or save the daily journal.
- `weekly_plan`: create, update, toggle, and delete weekly initiatives.
- `metrics_template`: add, update, remove, move, or replace metrics; update template name and effective date.
- Existing code contexts remain supported: `query`, `kr_progress`, `widget`, and `metric`.

## Why This Shape

The AI does not receive database write tools directly. It proposes actions, the user presses Apply, and the page executes the same APIs a human-driven UI already uses. That gives us a safe upgrade path toward broader automation without building a separate agent permission system first.

Future contexts can be added by:

1. Adding instructions and action examples in `src/lib/server/ai/system-prompt.ts`.
2. Rendering `AiChat` on the page with a context and `contextData`.
3. Implementing `onAction` for that page.
