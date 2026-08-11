import { describe, it, expect } from 'vitest';
import { executeTool, TOOL_DECLARATIONS } from '../services/tools.js';

describe('tools', () => {
    it('declares exactly one tool with a well-formed schema', () => {
        expect(TOOL_DECLARATIONS).toHaveLength(1);
        expect(TOOL_DECLARATIONS[0]).toMatchObject({
            name: 'get_current_datetime',
            parameters: { type: 'OBJECT' },
        });
    });

    it('get_current_datetime returns a valid ISO timestamp in UTC by default', () => {
        const result = executeTool('get_current_datetime', {});
        expect(result.timezone).toBe('UTC');
        expect(new Date(result.iso8601).toString()).not.toBe('Invalid Date');
        expect(typeof result.formatted).toBe('string');
    });

    it('honors a valid IANA timezone argument', () => {
        const result = executeTool('get_current_datetime', { timezone: 'Asia/Kolkata' });
        expect(result.timezone).toBe('Asia/Kolkata');
    });

    it('falls back to UTC for an invalid/malicious timezone argument instead of throwing', () => {
        const result = executeTool('get_current_datetime', { timezone: 'Not/A_Real_Zone' });
        expect(result.timezone).toBe('UTC');
    });

    it('falls back to UTC when args is missing entirely', () => {
        const result = executeTool('get_current_datetime', undefined);
        expect(result.timezone).toBe('UTC');
    });

    it('fails closed on an unrecognized tool name', () => {
        expect(() => executeTool('delete_database', {})).toThrow(/unknown tool/i);
    });
});
