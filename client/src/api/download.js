import toast from 'react-hot-toast';
import { API_URL } from './baseApi';

/**
 * Downloads an Excel export. Column selection and header renames travel in
 * the POST body, so a fully custom layout can be requested in one call.
 */
export async function downloadExcel({ path, query = {}, columns = null, templateId = null, options = {}, method = 'GET' }) {
  const token = (() => {
    try { return JSON.parse(localStorage.getItem('att_auth') || '{}').accessToken; } catch { return null; }
  })();

  const toastId = toast.loading('Preparing your Excel file...');
  try {
    const usePost = method === 'POST' || columns || templateId;
    const url = new URL(`${API_URL}${path}`, window.location.origin);
    if (!usePost) {
      Object.entries(query).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
      });
    }

    const res = await fetch(url.toString(), {
      method: usePost ? 'POST' : 'GET',
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(usePost ? { 'content-type': 'application/json' } : {}),
      },
      credentials: 'include',
      body: usePost ? JSON.stringify({ query, columns, templateId, options }) : undefined,
    });

    if (!res.ok) {
      let message = `Export failed (${res.status})`;
      try { message = (await res.json())?.error?.message || message; } catch { /* binary body */ }
      throw new Error(message);
    }

    const rowCount = res.headers.get('X-Row-Count');
    if (rowCount === '0') {
      toast.dismiss(toastId);
      toast('No attendance data matched those filters.', { icon: '\u2139' });
      return { rowCount: 0 };
    }

    const disposition = res.headers.get('Content-Disposition') || '';
    const match = /filename="?([^"]+)"?/.exec(disposition);
    const filename = match?.[1] || 'attendance.xlsx';

    const blob = await res.blob();
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(href);

    toast.success(`Downloaded ${filename} (${rowCount || '?'} rows)`, { id: toastId });
    return { filename, rowCount: Number(rowCount) || 0 };
  } catch (err) {
    toast.error(err.message || 'Could not download the file', { id: toastId });
    throw err;
  }
}
