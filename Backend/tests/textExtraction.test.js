import { describe, it, expect } from 'vitest';
import { extractText } from '../services/textExtraction.js';

describe('extractText', () => {
    it('extracts plain text (.txt) as a single unpaginated page', async () => {
        const buffer = Buffer.from('Hello world.\n\nThis is a plain text document.', 'utf-8');
        const result = await extractText(buffer, 'txt');
        expect(result.pageCount).toBeNull();
        expect(result.pages).toHaveLength(1);
        expect(result.pages[0].page).toBeNull();
        expect(result.pages[0].text).toContain('Hello world.');
    });

    it('extracts markdown (.md) the same way as plain text', async () => {
        const buffer = Buffer.from('# Title\n\nSome **markdown** content.', 'utf-8');
        const result = await extractText(buffer, 'md');
        expect(result.pages[0].text).toContain('# Title');
    });

    it('rejects an empty document with a clear error', async () => {
        await expect(extractText(Buffer.from(''), 'txt')).rejects.toThrow(/no extractable text/i);
    });

    it('rejects a whitespace-only document', async () => {
        await expect(extractText(Buffer.from('   \n\n\t  '), 'txt')).rejects.toThrow(/no extractable text/i);
    });

    it('rejects an unsupported file type', async () => {
        await expect(extractText(Buffer.from('data'), 'exe')).rejects.toThrow(/unsupported document type/i);
    });

    it('rejects a malformed/corrupted PDF with a user-safe error, not a raw parser exception', async () => {
        const garbage = Buffer.from('%PDF-1.4\nthis is not actually a valid pdf body at all');
        await expect(extractText(garbage, 'pdf')).rejects.toThrow(/corrupted|password-protected/i);
    });

    it('rejects a malformed/corrupted DOCX with a user-safe error', async () => {
        const garbage = Buffer.from('not a real zip/docx file');
        await expect(extractText(garbage, 'docx')).rejects.toThrow(/corrupted|password-protected/i);
    });
});
