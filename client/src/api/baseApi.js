import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { setCredentials, signedOut } from '../app/authSlice';

export const API_URL = import.meta.env.VITE_API_URL || '/api/v1';

const rawBaseQuery = fetchBaseQuery({
  baseUrl: API_URL,
  credentials: 'include',
  prepareHeaders: (headers, { getState }) => {
    const token = getState().auth.accessToken;
    if (token) headers.set('authorization', `Bearer ${token}`);
    return headers;
  },
});

/** A 401 triggers one silent refresh, then the original call is retried. */
let refreshPromise = null;

const baseQueryWithReauth = async (args, api, extraOptions) => {
  let result = await rawBaseQuery(args, api, extraOptions);

  if (result.error?.status === 401 && !String(args?.url || args).includes('/auth/')) {
    if (!refreshPromise) {
      refreshPromise = rawBaseQuery({ url: '/auth/refresh', method: 'POST' }, api, extraOptions)
        .finally(() => { refreshPromise = null; });
    }
    const refreshed = await refreshPromise;
    if (refreshed?.data?.data?.accessToken) {
      api.dispatch(setCredentials(refreshed.data.data));
      result = await rawBaseQuery(args, api, extraOptions);
    } else {
      api.dispatch(signedOut());
    }
  }
  return result;
};

export const baseApi = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithReauth,
  tagTypes: ['Session', 'Roster', 'Attendance', 'Dashboard', 'Report', 'Correction', 'Leave', 'Notification', 'Meta', 'Template'],
  endpoints: () => ({}),
});
