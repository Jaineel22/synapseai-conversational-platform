// Generic Zod validation middleware. Given a schema, parses req.body against
// it and either replaces req.body with the parsed/typed result or responds
// 400 with a compact list of field-level problems — never the raw Zod
// error object, which can be verbose and isn't meant for API clients.
const validateBody = (schema) => (req, res, next) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
        const details = result.error.issues.map((issue) => ({
            field: issue.path.join(".") || "(root)",
            message: issue.message,
        }));
        return res.status(400).json({ error: "Invalid request body", details });
    }

    req.body = result.data;
    next();
};

export default validateBody;
