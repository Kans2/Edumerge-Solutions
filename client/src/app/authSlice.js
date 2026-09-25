import { createSlice } from '@reduxjs/toolkit';

const persisted = (() => {
  try { return JSON.parse(localStorage.getItem('att_auth') || 'null'); } catch { return null; }
})();

const authSlice = createSlice({
  name: 'auth',
  initialState: { user: persisted?.user || null, accessToken: persisted?.accessToken || null },
  reducers: {
    setCredentials: (state, { payload }) => {
      state.user = payload.user || state.user;
      state.accessToken = payload.accessToken;
      localStorage.setItem('att_auth', JSON.stringify({ user: state.user, accessToken: state.accessToken }));
    },
    signedOut: (state) => {
      state.user = null; state.accessToken = null;
      localStorage.removeItem('att_auth');
    },
  },
});

export const { setCredentials, signedOut } = authSlice.actions;
export default authSlice.reducer;
