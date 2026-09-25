import { useState, useEffect, useMemo } from 'react';
import {
  FileSpreadsheet, Download, Eye, Save, GripVertical, Trash2, RotateCcw, Plus, X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  useGetColumnCatalogueQuery, useGetTemplatesQuery, useSaveTemplateMutation,
  useDeleteTemplateMutation, usePreviewExportMutation, useGetSectionsQuery,
  useGetDepartmentsQuery,
} from '../api/endpoints';
import { downloadExcel } from '../api/download';
import { Spinner, ErrorState, InfoNote, Modal, EmptyState } from '../components/Common';
import { REPORT_TYPES } from '../utils/constants';
import { todayKey } from '../utils/format';
import { useAuth } from '../hooks/useAuth';

const PATHS = {
  DAILY_ATTENDANCE: '/exports/daily',
  STUDENT_SUMMARY: '/exports/summary',
  DEFAULTERS: '/exports/defaulters',
  MONTHLY_REGISTER: '/exports/monthly-register',
  SESSION_ATTENDANCE: '/exports/custom',
};

export default function ExportCentre() {
  const { isManager } = useAuth();
  const [reportType, setReportType] = useState('DAILY_ATTENDANCE');
  const [filters, setFilters] = useState({ date: todayKey(), sectionId: '', departmentId: '', threshold: '' });
  const [columns, setColumns] = useState([]);       // [{ key, header, width }]
  const [options, setOptions] = useState({
    sheetName: 'Attendance', includeSummaryRow: true, includeFilterHeader: true,
  });
  const [preview, setPreview] = useState(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [dragIndex, setDragIndex] = useState(null);

  const { data: catalogue, isLoading, error } = useGetColumnCatalogueQuery(reportType);
  const { data: templates = [] } = useGetTemplatesQuery(reportType);
  const { data: sections = [] } = useGetSectionsQuery({});
  const { data: departments = [] } = useGetDepartmentsQuery(undefined, { skip: !isManager });
  const [saveTemplate, { isLoading: savingTemplate }] = useSaveTemplateMutation();
  const [deleteTemplate] = useDeleteTemplateMutation();
  const [runPreview, { isLoading: previewing }] = usePreviewExportMutation();

  /* Load the default column set whenever the report type changes. */
  useEffect(() => {
    if (!catalogue?.columns) return;
    const defaults = (catalogue.defaults || [])
      .map((key) => catalogue.columns.find((c) => c.key === key))
      .filter(Boolean)
      .map((c) => ({ key: c.key, header: c.defaultHeader, width: c.width }));
    setColumns(defaults);
    setPreview(null);
  }, [catalogue, reportType]);

  const available = useMemo(() => {
    const chosen = new Set(columns.map((c) => c.key));
    return (catalogue?.columns || []).filter((c) => !chosen.has(c.key));
  }, [catalogue, columns]);

  const addColumn = (key) => {
    const def = catalogue.columns.find((c) => c.key === key);
    if (!def) return;
    setColumns((prev) => [...prev, { key: def.key, header: def.defaultHeader, width: def.width }]);
  };

  const removeColumn = (key) => setColumns((prev) => prev.filter((c) => c.key !== key));

  const renameColumn = (key, header) =>
    setColumns((prev) => prev.map((c) => (c.key === key ? { ...c, header } : c)));

  const resizeColumn = (key, width) =>
    setColumns((prev) => prev.map((c) => (c.key === key ? { ...c, width: Number(width) || 18 } : c)));

  const resetColumns = () => {
    const defaults = (catalogue.defaults || [])
      .map((key) => catalogue.columns.find((c) => c.key === key))
      .filter(Boolean)
      .map((c) => ({ key: c.key, header: c.defaultHeader, width: c.width }));
    setColumns(defaults);
    toast.success('Restored the default columns');
  };

  const onDrop = (targetIndex) => {
    if (dragIndex === null || dragIndex === targetIndex) return;
    setColumns((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
    setDragIndex(null);
  };

  const move = (index, delta) => {
    setColumns((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const activeQuery = useMemo(() => {
    const q = {};
    Object.entries(filters).forEach(([k, v]) => { if (v) q[k] = v; });
    return q;
  }, [filters]);

  const handlePreview = async () => {
    try {
      const result = await runPreview({ reportType, query: activeQuery, columns, limit: 15 }).unwrap();
      setPreview(result);
      if (result.totalRows === 0) toast('No data matched those filters.', { icon: '\u2139' });
    } catch (err) {
      toast.error(err?.data?.error?.message || 'Preview failed');
    }
  };

  const handleDownload = () =>
    downloadExcel({
      path: PATHS[reportType] || '/exports/custom',
      query: { ...activeQuery, reportType },
      columns,
      options,
      method: 'POST',
    }).catch(() => {});

  const applyTemplate = (template) => {
    setColumns(template.columns
      .filter((c) => c.visible !== false)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((c) => ({ key: c.key, header: c.header, width: c.width })));
    if (template.options) setOptions((prev) => ({ ...prev, ...template.options }));
    toast.success(`Applied "${template.name}"`);
  };

  const handleSaveTemplate = async () => {
    if (!templateName.trim()) return;
    try {
      await saveTemplate({
        name: templateName.trim(),
        reportType,
        columns: columns.map((c, i) => ({ ...c, order: i, visible: true })),
        options,
        scope: 'PRIVATE',
      }).unwrap();
      toast.success('Layout saved');
      setSaveOpen(false);
      setTemplateName('');
    } catch (err) {
      toast.error(err?.data?.error?.message || 'Could not save the layout');
    }
  };

  if (isLoading) return <Spinner label="Loading the column catalogue" />;
  if (error) return <ErrorState error={error} />;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Excel exports</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Choose a report, pick your columns, rename the headers, then download.
        </p>
      </div>

      {/* Step 1 - report type */}
      <section className="card p-5" aria-labelledby="step-report">
        <h2 id="step-report" className="font-medium text-slate-900">1. Choose a report</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-2 mt-3">
          {REPORT_TYPES.filter((r) => r.value !== 'SESSION_ATTENDANCE').map((r) => (
            <button
              key={r.value}
              type="button"
              aria-pressed={reportType === r.value}
              onClick={() => setReportType(r.value)}
              className={`text-left rounded-lg border p-3 text-sm transition ${
                reportType === r.value
                  ? 'border-brand-500 bg-brand-50 text-brand-800 font-medium'
                  : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </section>

      {/* Step 2 - filters */}
      <section className="card p-5" aria-labelledby="step-filters">
        <h2 id="step-filters" className="font-medium text-slate-900">2. Narrow the data</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
          {reportType === 'DAILY_ATTENDANCE' && (
            <div>
              <label htmlFor="f-date" className="label">Date</label>
              <input
                id="f-date"
                type="date"
                className="input"
                value={filters.date}
                onChange={(e) => setFilters({ ...filters, date: e.target.value })}
              />
            </div>
          )}

          <div>
            <label htmlFor="f-section" className="label">Section</label>
            <select
              id="f-section"
              className="input"
              value={filters.sectionId}
              onChange={(e) => setFilters({ ...filters, sectionId: e.target.value })}
            >
              <option value="">All sections I can access</option>
              {sections.map((s) => <option key={s._id} value={s._id}>{s.code}</option>)}
            </select>
          </div>

          {isManager && (
            <div>
              <label htmlFor="f-dept" className="label">Department</label>
              <select
                id="f-dept"
                className="input"
                value={filters.departmentId}
                onChange={(e) => setFilters({ ...filters, departmentId: e.target.value })}
              >
                <option value="">All departments</option>
                {departments.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
              </select>
            </div>
          )}

          {(reportType === 'DEFAULTERS' || reportType === 'STUDENT_SUMMARY') && (
            <div>
              <label htmlFor="f-threshold" className="label">Threshold %</label>
              <input
                id="f-threshold"
                type="number"
                min="0"
                max="100"
                className="input"
                placeholder="75 (term policy)"
                value={filters.threshold}
                onChange={(e) => setFilters({ ...filters, threshold: e.target.value })}
              />
            </div>
          )}
        </div>
      </section>

      {/* Step 3 - columns */}
      <section className="card p-5" aria-labelledby="step-columns">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="step-columns" className="font-medium text-slate-900">
            3. Columns <span className="text-slate-400 font-normal">({columns.length} selected)</span>
          </h2>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary btn-sm" onClick={resetColumns}>
              <RotateCcw size={14} aria-hidden="true" /> Defaults
            </button>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setSaveOpen(true)}>
              <Save size={14} aria-hidden="true" /> Save layout
            </button>
          </div>
        </div>

        <InfoNote tone="blue">
          Drag to reorder, or edit any header text to rename that column in the downloaded file.
        </InfoNote>

        <div className="grid lg:grid-cols-3 gap-4 mt-4">
          {/* Selected columns */}
          <div className="lg:col-span-2">
            <h3 className="text-sm font-medium text-slate-700 mb-2">Included, in order</h3>
            <ol className="space-y-1.5">
              {columns.map((c, i) => (
                <li
                  key={c.key}
                  draggable
                  onDragStart={() => setDragIndex(i)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => onDrop(i)}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-2"
                >
                  <GripVertical size={16} className="text-slate-300 shrink-0 cursor-grab" aria-hidden="true" />
                  <span className="text-xs text-slate-400 w-5 tabular-nums">{i + 1}</span>

                  <label htmlFor={`header-${c.key}`} className="sr-only">Header text for {c.key}</label>
                  <input
                    id={`header-${c.key}`}
                    className="input py-1 text-sm flex-1"
                    value={c.header}
                    onChange={(e) => renameColumn(c.key, e.target.value)}
                  />

                  <label htmlFor={`width-${c.key}`} className="sr-only">Column width for {c.header}</label>
                  <input
                    id={`width-${c.key}`}
                    type="number"
                    min="5"
                    max="60"
                    className="input py-1 text-sm w-16"
                    value={c.width}
                    onChange={(e) => resizeColumn(c.key, e.target.value)}
                    title="Column width"
                  />

                  <div className="flex gap-0.5">
                    <button type="button" className="btn-ghost btn-sm" aria-label={`Move ${c.header} up`} onClick={() => move(i, -1)}>&uarr;</button>
                    <button type="button" className="btn-ghost btn-sm" aria-label={`Move ${c.header} down`} onClick={() => move(i, 1)}>&darr;</button>
                    <button type="button" className="btn-ghost btn-sm text-red-600" aria-label={`Remove ${c.header}`} onClick={() => removeColumn(c.key)}>
                      <X size={14} aria-hidden="true" />
                    </button>
                  </div>
                </li>
              ))}
              {columns.length === 0 && (
                <li className="text-sm text-slate-500 p-3 border border-dashed border-slate-300 rounded-lg">
                  No columns selected — the export will fall back to the report defaults.
                </li>
              )}
            </ol>
          </div>

          {/* Available columns */}
          <div>
            <h3 className="text-sm font-medium text-slate-700 mb-2">
              Available <span className="text-slate-400 font-normal">({available.length})</span>
            </h3>
            <div className="space-y-1 max-h-[420px] overflow-y-auto pr-1">
              {available.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => addColumn(c.key)}
                  className="w-full flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm text-left hover:border-brand-300 hover:bg-brand-50"
                >
                  <span>{c.defaultHeader}</span>
                  <Plus size={14} className="text-slate-400" aria-hidden="true" />
                </button>
              ))}
              {available.length === 0 && (
                <p className="text-sm text-slate-500 p-2">Every available column is already included.</p>
              )}
            </div>
          </div>
        </div>

        {/* Sheet options */}
        <div className="mt-4 border-t border-slate-100 pt-4 grid sm:grid-cols-3 gap-3">
          <div>
            <label htmlFor="opt-sheet" className="label">Sheet name</label>
            <input
              id="opt-sheet"
              className="input"
              value={options.sheetName}
              onChange={(e) => setOptions({ ...options, sheetName: e.target.value })}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700 sm:mt-7">
            <input
              type="checkbox"
              checked={options.includeSummaryRow}
              onChange={(e) => setOptions({ ...options, includeSummaryRow: e.target.checked })}
            />
            Include a totals row
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700 sm:mt-7">
            <input
              type="checkbox"
              checked={options.includeFilterHeader}
              onChange={(e) => setOptions({ ...options, includeFilterHeader: e.target.checked })}
            />
            Include the title block
          </label>
        </div>
      </section>

      {/* Saved layouts */}
      {templates.length > 0 && (
        <section className="card p-5" aria-labelledby="saved-layouts">
          <h2 id="saved-layouts" className="font-medium text-slate-900">Saved layouts</h2>
          <div className="flex flex-wrap gap-2 mt-3">
            {templates.map((t) => (
              <div key={t._id} className="flex items-center gap-1 rounded-lg border border-slate-200 pl-3 pr-1 py-1">
                <button type="button" className="text-sm text-slate-700 hover:text-brand-700" onClick={() => applyTemplate(t)}>
                  {t.name}
                  {t.isDefault && <span className="ml-1 text-xs text-slate-400">(default)</span>}
                </button>
                <button
                  type="button"
                  className="btn-ghost btn-sm text-slate-400 hover:text-red-600"
                  aria-label={`Delete layout ${t.name}`}
                  onClick={() => deleteTemplate(t._id)}
                >
                  <Trash2 size={13} aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Step 4 - preview & download */}
      <section className="card p-5" aria-labelledby="step-download">
        <h2 id="step-download" className="font-medium text-slate-900">4. Preview and download</h2>
        <div className="flex flex-wrap gap-2 mt-3">
          <button type="button" className="btn-secondary" onClick={handlePreview} disabled={previewing}>
            <Eye size={16} aria-hidden="true" /> {previewing ? 'Loading...' : 'Preview first 15 rows'}
          </button>
          <button type="button" className="btn-primary" onClick={handleDownload}>
            <Download size={16} aria-hidden="true" /> Download Excel
          </button>
        </div>

        {preview && (
          <div className="mt-4">
            <p className="text-sm text-slate-600">
              <strong>{preview.totalRows}</strong> rows match ·{' '}
              <strong>{preview.columns.length}</strong> columns
              {preview.unknownColumns?.length > 0 && (
                <span className="text-amber-700"> · ignored: {preview.unknownColumns.join(', ')}</span>
              )}
            </p>

            {preview.previewRows.length > 0 ? (
              <div className="mt-2 overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-sm">
                  <caption className="sr-only">Preview of the Excel export</caption>
                  <thead>
                    <tr>
                      {preview.columns.map((c) => (
                        <th key={c.key} scope="col" className="th whitespace-nowrap">{c.header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {preview.previewRows.map((row, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        {preview.columns.map((c) => (
                          <td key={c.key} className="td whitespace-nowrap">{String(row[c.header] ?? '-')}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                icon={FileSpreadsheet}
                title="No rows matched"
                message="Try a different date, section or threshold."
              />
            )}
          </div>
        )}
      </section>

      <Modal
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        title="Save this column layout"
        description="Saved layouts are private to you and can be reapplied to any future export."
        footer={(
          <>
            <button type="button" className="btn-secondary" onClick={() => setSaveOpen(false)}>Cancel</button>
            <button
              type="button"
              className="btn-primary"
              disabled={!templateName.trim() || savingTemplate}
              onClick={handleSaveTemplate}
            >
              {savingTemplate ? 'Saving...' : 'Save layout'}
            </button>
          </>
        )}
      >
        <label htmlFor="template-name" className="label">Layout name</label>
        <input
          id="template-name"
          className="input"
          placeholder="e.g. Guardian contact sheet"
          value={templateName}
          onChange={(e) => setTemplateName(e.target.value)}
        />
        <p className="text-xs text-slate-500 mt-2">
          {columns.length} columns will be stored, along with your header names and widths.
        </p>
      </Modal>
    </div>
  );
}
