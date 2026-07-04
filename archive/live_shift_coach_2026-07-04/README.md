# Live Shift Coach Archive

Archived on 2026-07-04 after deciding to remove the Coach feature from the active app.

This folder preserves the working implementation for future review:

- `index-with-coach.html`: Day carousel with the Live Shift Coach slide.
- `days-with-coach.js`: live shift checkpoints, Coach chat UI, local fallback replies, and shift controls.
- `styles-with-coach.css`: Coach and live shift styling.
- `server-with-coach.mjs`: `/api/coach` OpenAI endpoint and extraction prompts.
- `package-with-coach.json`: package scripts before removing active coach validation.
- `coach_vocabulary/`: semantic phrase libraries used by the Coach.
- `scripts/validate-coach-vocabulary.mjs`: vocabulary validation tool.

The active app no longer renders or calls the Coach. Use this archive as the starting point if the idea is revisited.
