const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

function encodeBasicCredentials({ email, password }) {
  const bytes = new TextEncoder().encode(`${email}:${password}`);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `Basic ${btoa(binary)}`;
}

export async function request(path, { credentials, method = 'GET', body } = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(credentials ? { Authorization: encodeBasicCredentials(credentials) } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const contentType = response.headers.get('content-type') || '';
  const data = response.status === 204
    ? null
    : contentType.includes('application/json')
      ? await response.json()
      : { message: `The API returned a non-JSON response (${response.status}). Check that the backend is running at ${API_URL}.` };
  if (!response.ok) throw new Error(data?.message || 'Unable to complete the request.');
  return data;
}
