// A single, deliberately small function-calling tool exposed to Gemini.
//
// This exists to demonstrate that SynapseAI's Gemini integration supports
// real tool use, not just plain text generation — while staying
// intentionally minimal per Phase 6's scope: one tool, no arbitrary code
// execution, no network/file-system access, fully deterministic, and every
// argument validated server-side before use. The model can only ever
// trigger one of the hand-written functions below; there is no code path
// that evaluates or executes anything the model itself supplies.
//
// Extension point for future tools: add a declaration here and a matching
// entry in TOOL_EXECUTORS. Nothing outside this file needs to change —
// utils/gemini.js's function-calling loop is generic over whatever
// declarations/executors this module exports.

export const TOOL_DECLARATIONS = [
    {
        name: "get_current_datetime",
        description:
            "Returns the current real-world date and time. Always call this when the user asks what today's date, the current day, or the current time is — the model's own training data is always stale and must never be used to guess it.",
        parameters: {
            type: "OBJECT",
            properties: {
                timezone: {
                    type: "STRING",
                    description:
                        'Optional IANA timezone name, e.g. "America/New_York" or "Asia/Kolkata". Defaults to UTC if omitted or invalid.',
                },
            },
        },
    },
];

const DEFAULT_TIMEZONE = "UTC";

function isValidTimezone(timezone) {
    try {
        // Intl throws RangeError for an unrecognized IANA timezone name —
        // this is the actual validation, not the string.trim() checks above.
        new Intl.DateTimeFormat("en-US", { timeZone: timezone });
        return true;
    } catch {
        return false;
    }
}

function getCurrentDatetime(args) {
    // args come from the model, which in turn is influenced by user input —
    // treated as untrusted and validated the same as any other external
    // input, never passed straight through to Intl unchecked.
    const requested = typeof args.timezone === "string" ? args.timezone.trim() : "";
    const timezone = requested && isValidTimezone(requested) ? requested : DEFAULT_TIMEZONE;
    const now = new Date();

    return {
        iso8601: now.toISOString(),
        timezone,
        formatted: new Intl.DateTimeFormat("en-US", {
            timeZone: timezone,
            dateStyle: "full",
            timeStyle: "long",
        }).format(now),
    };
}

const TOOL_EXECUTORS = {
    get_current_datetime: getCurrentDatetime,
};

/**
 * Executes a named tool with the given (untrusted, model-supplied)
 * arguments. Dispatches only to one of the fixed functions in
 * TOOL_EXECUTORS — an unrecognized name fails closed with an error rather
 * than silently doing nothing, since that should never happen given the
 * model is only ever offered the declarations above.
 */
export function executeTool(name, args) {
    const executor = TOOL_EXECUTORS[name];
    if (!executor) {
        throw new Error(`Unknown tool: ${name}`);
    }
    return executor(args || {});
}
