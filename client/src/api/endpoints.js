import { baseApi } from './baseApi';

const unwrap = (r) => r.data;

export const api = baseApi.injectEndpoints({
  endpoints: (b) => ({
    /* ---------------- auth ---------------- */
    login: b.mutation({ query: (body) => ({ url: '/auth/login', method: 'POST', body }), transformResponse: unwrap }),
    logout: b.mutation({ query: () => ({ url: '/auth/logout', method: 'POST' }) }),

    /* ---------------- dashboard ---------------- */
    getDashboard: b.query({ query: () => '/dashboard', transformResponse: unwrap, providesTags: ['Dashboard'] }),

    /* ---------------- sessions ---------------- */
    getMySchedule: b.query({
      query: (date) => ({ url: '/sessions/my-schedule', params: date ? { date } : {} }),
      transformResponse: unwrap, providesTags: ['Session'],
    }),
    getSessions: b.query({
      query: (params) => ({ url: '/sessions', params }),
      transformResponse: (r) => ({ items: r.data, meta: r.meta }), providesTags: ['Session'],
    }),
    getUnmarked: b.query({ query: (params) => ({ url: '/sessions/unmarked', params }), transformResponse: unwrap, providesTags: ['Session'] }),
    cancelSession: b.mutation({
      query: ({ id, ...body }) => ({ url: `/sessions/${id}/cancel`, method: 'PATCH', body }),
      invalidatesTags: ['Session', 'Dashboard'],
    }),
    unlockSession: b.mutation({
      query: ({ id, ...body }) => ({ url: `/sessions/${id}/unlock`, method: 'PATCH', body }),
      invalidatesTags: ['Session', 'Roster'],
    }),
    generateSessions: b.mutation({
      query: (body) => ({ url: '/sessions/generate', method: 'POST', body }),
      invalidatesTags: ['Session'],
    }),

    /* ---------------- attendance ---------------- */
    getRoster: b.query({
      query: (sessionId) => `/attendance/sessions/${sessionId}/roster`,
      transformResponse: unwrap,
      providesTags: (r, e, id) => [{ type: 'Roster', id }],
    }),
    markSession: b.mutation({
      query: ({ sessionId, ...body }) => ({ url: `/attendance/sessions/${sessionId}/mark`, method: 'POST', body }),
      invalidatesTags: (r, e, { sessionId }) => [{ type: 'Roster', id: sessionId }, 'Session', 'Dashboard', 'Report'],
    }),
    updateRecords: b.mutation({
      query: ({ sessionId, ...body }) => ({ url: `/attendance/sessions/${sessionId}/records`, method: 'PATCH', body }),
      invalidatesTags: (r, e, { sessionId }) => [{ type: 'Roster', id: sessionId }, 'Session', 'Report'],
    }),
    getMyAttendance: b.query({ query: (params) => ({ url: '/attendance/me', params }), transformResponse: unwrap, providesTags: ['Attendance'] }),
    getMyHistory: b.query({ query: (params) => ({ url: '/attendance/me/history', params }), transformResponse: unwrap, providesTags: ['Attendance'] }),
    getStudentAttendance: b.query({ query: ({ studentId, ...params }) => ({ url: `/attendance/students/${studentId}`, params }), transformResponse: unwrap }),

    /* ---------------- academics ---------------- */
    getSections: b.query({ query: (params) => ({ url: '/academics/sections', params }), transformResponse: unwrap, providesTags: ['Meta'] }),
    getDepartments: b.query({ query: () => '/academics/departments', transformResponse: unwrap, providesTags: ['Meta'] }),
    getSubjects: b.query({ query: (params) => ({ url: '/academics/subjects', params }), transformResponse: unwrap, providesTags: ['Meta'] }),
    getOfferings: b.query({ query: (params) => ({ url: '/academics/offerings', params }), transformResponse: unwrap, providesTags: ['Meta'] }),
    getCurrentTerm: b.query({ query: () => '/academics/terms/current', transformResponse: unwrap, providesTags: ['Meta'] }),
    getSectionStudents: b.query({ query: (id) => `/academics/sections/${id}/students`, transformResponse: unwrap }),

    /* ---------------- reports ---------------- */
    getDailyReport: b.query({ query: (params) => ({ url: '/reports/daily', params }), transformResponse: unwrap, providesTags: ['Report'] }),
    getTrend: b.query({ query: (params) => ({ url: '/reports/trend', params }), transformResponse: unwrap, providesTags: ['Report'] }),
    getDefaulters: b.query({
      query: (params) => ({ url: '/reports/defaulters', params }),
      transformResponse: (r) => ({ ...r.data, meta: r.meta }), providesTags: ['Report'],
    }),
    getSectionReport: b.query({ query: ({ sectionId, ...params }) => ({ url: `/reports/sections/${sectionId}`, params }), transformResponse: unwrap, providesTags: ['Report'] }),
    getDepartmentReport: b.query({ query: (params) => ({ url: '/reports/departments', params }), transformResponse: unwrap, providesTags: ['Report'] }),
    condone: b.mutation({
      query: ({ summaryId, ...body }) => ({ url: `/reports/summaries/${summaryId}/condone`, method: 'PATCH', body }),
      invalidatesTags: ['Report'],
    }),

    /* ---------------- corrections & leave ---------------- */
    getCorrections: b.query({
      query: (params) => ({ url: '/corrections', params }),
      transformResponse: (r) => ({ items: r.data, meta: r.meta }), providesTags: ['Correction'],
    }),
    raiseCorrection: b.mutation({
      query: (body) => ({ url: '/corrections', method: 'POST', body }),
      invalidatesTags: ['Correction', 'Dashboard'],
    }),
    reviewCorrection: b.mutation({
      query: ({ id, ...body }) => ({ url: `/corrections/${id}/review`, method: 'PATCH', body }),
      invalidatesTags: ['Correction', 'Dashboard', 'Report', 'Roster'],
    }),
    getLeaves: b.query({
      query: (params) => ({ url: '/corrections/leaves/all', params }),
      transformResponse: (r) => ({ items: r.data, meta: r.meta }), providesTags: ['Leave'],
    }),
    raiseLeave: b.mutation({
      query: (body) => ({ url: '/corrections/leaves', method: 'POST', body }),
      invalidatesTags: ['Leave', 'Dashboard'],
    }),
    reviewLeave: b.mutation({
      query: ({ id, ...body }) => ({ url: `/corrections/leaves/${id}/review`, method: 'PATCH', body }),
      invalidatesTags: ['Leave', 'Dashboard', 'Attendance', 'Report'],
    }),

    /* ---------------- exports ---------------- */
    getColumnCatalogue: b.query({
      query: (reportType) => ({ url: '/exports/columns', params: reportType ? { reportType } : {} }),
      transformResponse: unwrap,
    }),
    getTemplates: b.query({
      query: (reportType) => ({ url: '/exports/templates', params: reportType ? { reportType } : {} }),
      transformResponse: unwrap, providesTags: ['Template'],
    }),
    saveTemplate: b.mutation({
      query: (body) => ({ url: '/exports/templates', method: 'POST', body }),
      invalidatesTags: ['Template'],
    }),
    deleteTemplate: b.mutation({
      query: (id) => ({ url: `/exports/templates/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Template'],
    }),
    previewExport: b.mutation({
      query: (body) => ({ url: '/exports/preview', method: 'POST', body }),
      transformResponse: unwrap,
    }),

    /* ---------------- notifications ---------------- */
    getNotifications: b.query({ query: (params) => ({ url: '/notifications', params }), transformResponse: unwrap, providesTags: ['Notification'] }),
    markNotificationsRead: b.mutation({
      query: (body) => ({ url: '/notifications/read', method: 'PATCH', body }),
      invalidatesTags: ['Notification'],
    }),
  }),
});

export const {
  useLoginMutation, useLogoutMutation, useGetDashboardQuery,
  useGetMyScheduleQuery, useGetSessionsQuery, useGetUnmarkedQuery,
  useCancelSessionMutation, useUnlockSessionMutation, useGenerateSessionsMutation,
  useGetRosterQuery, useMarkSessionMutation, useUpdateRecordsMutation,
  useGetMyAttendanceQuery, useGetMyHistoryQuery, useGetStudentAttendanceQuery,
  useGetSectionsQuery, useGetDepartmentsQuery, useGetSubjectsQuery, useGetOfferingsQuery,
  useGetCurrentTermQuery, useGetSectionStudentsQuery,
  useGetDailyReportQuery, useGetTrendQuery, useGetDefaultersQuery,
  useGetSectionReportQuery, useGetDepartmentReportQuery, useCondoneMutation,
  useGetCorrectionsQuery, useRaiseCorrectionMutation, useReviewCorrectionMutation,
  useGetLeavesQuery, useRaiseLeaveMutation, useReviewLeaveMutation,
  useGetColumnCatalogueQuery, useGetTemplatesQuery, useSaveTemplateMutation,
  useDeleteTemplateMutation, usePreviewExportMutation,
  useGetNotificationsQuery, useMarkNotificationsReadMutation,
} = api;
