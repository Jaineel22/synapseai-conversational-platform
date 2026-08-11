import axios from 'axios';

// Thin wrapper around the /api/documents endpoints — kept separate from
// components so DocumentsPanel/ChatWindow don't build FormData/axios calls
// inline, matching how the rest of the app already centralizes API
// concerns (axios.defaults set once in App.jsx).

export async function listDocuments() {
  const res = await axios.get('/api/documents');
  return res.data;
}

export async function getDocument(id) {
  const res = await axios.get(`/api/documents/${id}`);
  return res.data;
}

export async function uploadDocument(file) {
  const formData = new FormData();
  formData.append('file', file);
  const res = await axios.post('/api/documents', formData);
  return res.data;
}

export async function deleteDocument(id) {
  await axios.delete(`/api/documents/${id}`);
}
