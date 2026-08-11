import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import DocumentsPanel from '../DocumentsPanel.jsx';
import { ToastContext } from '../ToastContext.jsx';
import * as documentsApi from '../api/documents.js';

vi.mock('../api/documents.js');

const mockShowToast = vi.fn();

function renderPanel(props = {}) {
  return render(
    <ToastContext.Provider value={{ showToast: mockShowToast, dismiss: vi.fn() }}>
      <DocumentsPanel onClose={vi.fn()} onDocumentsChanged={vi.fn()} {...props} />
    </ToastContext.Provider>,
  );
}

describe('DocumentsPanel', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockShowToast.mockClear();
  });

  it('shows the empty state when the user has no documents', async () => {
    documentsApi.listDocuments.mockResolvedValue([]);
    renderPanel();

    expect(await screen.findByText(/no documents yet/i)).toBeInTheDocument();
  });

  it('renders the document list with status and metadata', async () => {
    documentsApi.listDocuments.mockResolvedValue([
      { id: '1', filename: 'handbook.pdf', fileType: 'pdf', fileSize: 204800, status: 'ready', chunkCount: 12, error: null },
      { id: '2', filename: 'notes.txt', fileType: 'txt', fileSize: 512, status: 'processing', chunkCount: 0, error: null },
      { id: '3', filename: 'bad.txt', fileType: 'txt', fileSize: 10, status: 'failed', chunkCount: 0, error: 'No extractable text was found in this document.' },
    ]);
    renderPanel();

    expect(await screen.findByText('handbook.pdf')).toBeInTheDocument();
    expect(screen.getByText('notes.txt')).toBeInTheDocument();
    expect(screen.getByText('bad.txt')).toBeInTheDocument();
    expect(screen.getByText(/12 chunks/)).toBeInTheDocument();
    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(screen.getByText('Processing')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
  });

  it('shows a toast error if the document list fails to load', async () => {
    documentsApi.listDocuments.mockRejectedValue(new Error('network error'));
    renderPanel();

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(expect.stringMatching(/couldn't load/i), { type: 'error' });
    });
  });

  it('uploads a file and adds it to the list on success', async () => {
    documentsApi.listDocuments.mockResolvedValue([]);
    documentsApi.uploadDocument.mockResolvedValue({
      id: 'new-doc', filename: 'report.pdf', fileType: 'pdf', fileSize: 1024, status: 'processing', chunkCount: 0, error: null,
    });
    renderPanel();
    await screen.findByText(/no documents yet/i);

    const file = new File(['fake pdf content'], 'report.pdf', { type: 'application/pdf' });
    const fileInput = document.querySelector('input[type="file"]');
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(documentsApi.uploadDocument).toHaveBeenCalledWith(file);
    });
    expect(await screen.findByText('report.pdf')).toBeInTheDocument();
    expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('report.pdf'), { type: 'success' });
  });

  it('shows an error toast when upload fails, without adding a phantom row', async () => {
    documentsApi.listDocuments.mockResolvedValue([]);
    documentsApi.uploadDocument.mockRejectedValue({ response: { data: { error: 'File is too large. Maximum size is 10MB.' } } });
    renderPanel();
    await screen.findByText(/no documents yet/i);

    const file = new File(['x'.repeat(20)], 'huge.txt', { type: 'text/plain' });
    const fileInput = document.querySelector('input[type="file"]');
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('File is too large. Maximum size is 10MB.', { type: 'error' });
    });
    expect(screen.queryByText('huge.txt')).not.toBeInTheDocument();
  });

  it('deletes a document and removes it from the list', async () => {
    documentsApi.listDocuments.mockResolvedValue([
      { id: '1', filename: 'handbook.pdf', fileType: 'pdf', fileSize: 2048, status: 'ready', chunkCount: 3, error: null },
    ]);
    documentsApi.deleteDocument.mockResolvedValue(undefined);
    renderPanel();

    await screen.findByText('handbook.pdf');
    fireEvent.click(screen.getByRole('button', { name: /delete "handbook.pdf"/i }));

    await waitFor(() => {
      expect(documentsApi.deleteDocument).toHaveBeenCalledWith('1');
    });
    await waitFor(() => {
      expect(screen.queryByText('handbook.pdf')).not.toBeInTheDocument();
    });
  });
});
