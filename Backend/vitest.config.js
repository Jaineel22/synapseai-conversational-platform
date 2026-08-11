import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        globals: true,
        testTimeout: 20000,
        hookTimeout: 30000,
        // Run test files sequentially — they share one in-memory MongoDB
        // instance and one Express app module, so parallel files would
        // race on the same database/rate-limit state.
        fileParallelism: false,
    },
});
