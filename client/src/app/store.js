import { configureStore } from '@reduxjs/toolkit';
import { baseApi } from '../api/baseApi';
import authReducer from './authSlice';

export const store = configureStore({
  reducer: { auth: authReducer, [baseApi.reducerPath]: baseApi.reducer },
  middleware: (getDefault) => getDefault({ serializableCheck: false }).concat(baseApi.middleware),
});
