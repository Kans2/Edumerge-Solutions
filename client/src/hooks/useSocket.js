import { useEffect, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { io } from 'socket.io-client';
import toast from 'react-hot-toast';
import { baseApi } from '../api/baseApi';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

export function useSocket() {
  const token = useSelector((s) => s.auth.accessToken);
  const dispatch = useDispatch();
  const ref = useRef(null);

  useEffect(() => {
    if (!token) return undefined;
    const socket = io(SOCKET_URL, { auth: { token }, transports: ['websocket', 'polling'] });
    ref.current = socket;

    socket.on('notification:new', (n) => {
      toast(n.title, { icon: n.severity === 'CRITICAL' ? '\u26A0' : '\uD83D\uDD14' });
      dispatch(baseApi.util.invalidateTags(['Notification']));
    });
    socket.on('attendance:marked', () => dispatch(baseApi.util.invalidateTags(['Session', 'Dashboard'])));
    socket.on('attendance:absent', () => dispatch(baseApi.util.invalidateTags(['Attendance', 'Dashboard'])));

    return () => socket.disconnect();
  }, [token, dispatch]);

  return ref;
}
