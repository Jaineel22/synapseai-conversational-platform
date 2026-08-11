// Imported from the package's internal implementation path rather than its
// main entry point — pdf-parse's index.js has a `require.main`-detection
// self-test block that misfires under Vitest's module loader (it tries to
// read a fixture PDF from the package's own test/ directory relative to the
// process cwd and throws ENOENT), so it's bypassed entirely. This is the
// same function `pdf-parse`'s main export re-exports unchanged.
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import mammoth from "mammoth";

// Text extraction is the only place in the pipeline that touches raw file
// bytes. Every extractor below returns the same shape regardless of source
// format, so downstream chunking never needs to know what kind of file it
// came from:
//
//   { pages: [{ page: number|null, text: string }, ...], pageCount: number|null }
//
// `page` is null for formats with no inherent pagination (txt/md) — chunks
// built from those simply carry no page metadata, which the RAG citation
// layer treats as "page not applicable" rather than "page unknown".

async function extractPdf(buffer) {
    const pages = [];
    let pageNumber = 0;

    await pdfParse(buffer, {
        // Custom page renderer: pdf-parse calls this once per page, strictly
        // in page order (it awaits each call before requesting the next
        // page), so a simple closure counter reliably tracks the 1-based
        // page number without relying on pdf.js's own page-object fields.
        pagerender: async (pageData) => {
            pageNumber += 1;
            const textContent = await pageData.getTextContent({
                normalizeWhitespace: true,
                disableCombineTextItems: false,
            });

            let lastY;
            let text = "";
            for (const item of textContent.items) {
                if (lastY === item.transform[5] || lastY === undefined) {
                    text += item.str;
                } else {
                    text += "\n" + item.str;
                }
                lastY = item.transform[5];
            }

            pages.push({ page: pageNumber, text });
            return text;
        },
    });

    return { pages, pageCount: pages.length };
}

async function extractDocx(buffer) {
    const { value: text } = await mammoth.extractRawText({ buffer });
    // docx has no reliable page boundaries without a full layout engine —
    // treated as a single unpaginated document, same as txt/md.
    return { pages: [{ page: null, text }], pageCount: null };
}

function extractPlainText(buffer) {
    const text = buffer.toString("utf-8");
    return { pages: [{ page: null, text }], pageCount: null };
}

const EXTRACTORS = {
    pdf: extractPdf,
    docx: extractDocx,
    txt: extractPlainText,
    md: extractPlainText,
};

/**
 * Extracts raw text (grouped by page where the format supports it) from a
 * document buffer. Throws a plain Error with a user-safe message on
 * failure — callers should not need to inspect the underlying library
 * error, which may contain internal parser details.
 */
export async function extractText(buffer, fileType) {
    const extractor = EXTRACTORS[fileType];
    if (!extractor) {
        throw new Error(`Unsupported document type: ${fileType}`);
    }

    let result;
    try {
        result = await extractor(buffer);
    } catch {
        throw new Error("Failed to extract text from this document. It may be corrupted or password-protected.");
    }

    const hasText = result.pages.some((p) => p.text && p.text.trim().length > 0);
    if (!hasText) {
        throw new Error("No extractable text was found in this document.");
    }

    return result;
}
