import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  Wrench,
  Calculator,
  Upload,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Database,
  ArrowLeft,
} from 'lucide-react';
import {
  subscribe,
  getBlocks,
  getLoadProgress,
  recalculateRiskScores,
  importInspectionsWithMockFallback,
  importScores,
  previewScoreImport,
  type InspectionBackfillImportResult,
  type InspectionImportRow,
  type ScoreImportResult,
  type ScoreImportRow,
  type ScoreMatchMode,
  type ScoreMatchPreview,
  type ScoreValueScale,
} from '../../data/blocks';
import {
  getScoreParams,
  setScoreParamsLocal,
  setScoreParams,
  resetScoreParams,
  loadScoreParams,
  subscribeScoreParams,
  SCORE_PARAM_META,
  SCORE_PARAM_DEFAULTS,
  type ScoreParams,
} from '../../lib/scoreParams';
import { parseInspectionsCsv, parseScoresCsv } from '../../lib/csvImport';
import DataLoadingScreen from '../DataLoadingScreen';
import { useConfirm } from '../ConfirmDialog';

type RecalcState =
  | { phase: 'idle'; message: string }
  | { phase: 'working'; message: string }
  | { phase: 'done'; message: string }
  | { phase: 'error'; message: string };

type ScoreImportPhase = 'idle' | 'previewing' | 'ready' | 'importing' | 'done' | 'error';
interface ScoreImportState {
  phase: ScoreImportPhase;
  message: string;
  fileName?: string;
  rows?: ScoreImportRow[];
  preview?: ScoreMatchPreview;
  skipped?: number;
  parseErrors?: string[];
  progress?: { done: number; total: number };
  result?: ScoreImportResult;
}

type InspectionImportPhase = 'idle' | 'reading' | 'importing' | 'done' | 'error';
interface InspectionImportState {
  phase: InspectionImportPhase;
  message: string;
  fileName?: string;
  rows?: InspectionImportRow[];
  skipped?: number;
  parseErrors?: string[];
  progress?: { done: number; total: number };
  result?: InspectionBackfillImportResult;
}

export default function AdminConsole() {
  // Subscribing kicks off the lazy block load; gate the console until ready
  // so Calculate / imports operate on the full in-memory dataset.
  const progress = useSyncExternalStore(subscribe, getLoadProgress, getLoadProgress);
  useSyncExternalStore(subscribe, getBlocks, getBlocks);

  // Reconcile the locally-cached params with the database on mount.
  useEffect(() => { void loadScoreParams(); }, []);

  if (!progress.done || progress.error) {
    return <DataLoadingScreen progress={progress} />;
  }

  return <AdminConsoleReady />;
}

function AdminConsoleReady() {
  const blocks = useSyncExternalStore(subscribe, getBlocks, getBlocks);
  const params = useSyncExternalStore(subscribeScoreParams, getScoreParams, getScoreParams);

  const [recalc, setRecalc] = useState<RecalcState>({ phase: 'idle', message: '' });
  const [paramSave, setParamSave] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const scoreFileRef = useRef<HTMLInputElement>(null);
  const inspectionFileRef = useRef<HTMLInputElement>(null);
  const [scoreImport, setScoreImport] = useState<ScoreImportState>({ phase: 'idle', message: '' });
  const [inspectionImport, setInspectionImport] = useState<InspectionImportState>({ phase: 'idle', message: '' });
  const [matchMode, setMatchMode] = useState<ScoreMatchMode>('building_record_number');
  const [valueScale, setValueScale] = useState<ScoreValueScale>('zero_to_one');
  const { confirm, dialog } = useConfirm();

  const isDefault =
    params.a1 === SCORE_PARAM_DEFAULTS.a1 &&
    params.a2 === SCORE_PARAM_DEFAULTS.a2 &&
    params.a3 === SCORE_PARAM_DEFAULTS.a3;

  // ── Param persistence (debounced) ─────────────────────────────────────────
  // Slider drags update the cache instantly; the DB write is debounced so a
  // single drag becomes one round-trip rather than dozens.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  function persistParams(next: ScoreParams) {
    setParamSave('saving');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      setScoreParams(next)
        .then(() => setParamSave('saved'))
        .catch(() => setParamSave('error'));
    }, 500);
  }

  function onParamChange(key: keyof ScoreParams, value: number) {
    const next = { ...params, [key]: value };
    setScoreParamsLocal(next);  // instant UI
    persistParams(next);        // debounced DB write
  }

  async function onResetParams() {
    setParamSave('saving');
    try {
      await resetScoreParams();
      setParamSave('saved');
    } catch {
      setParamSave('error');
    }
  }

  // ── Calculate ──────────────────────────────────────────────────────────────
  async function handleRecalculate() {
    const ok = await confirm({
      title: 'Calculate risk scores',
      message:
        `Calculate risk scores for all ${blocks.length.toLocaleString()} blocks? ` +
        `This uses the parameters saved to the database and writes a fresh risk score to every block.`,
      confirmLabel: 'Calculate',
    });
    if (!ok) return;

    setRecalc({ phase: 'working', message: 'Calculating risk scores…' });
    try {
      const result = await recalculateRiskScores();
      setRecalc({
        phase: 'done',
        message: `${result.updated.toLocaleString()} / ${result.total.toLocaleString()} blocks updated`,
      });
    } catch (err) {
      setRecalc({
        phase: 'error',
        message: err instanceof Error ? err.message : 'Could not calculate scores',
      });
    }
  }

  // ── Score import ────────────────────────────────────────────────────────────
  const scaleStats = useMemo(() => {
    const rows = scoreImport.rows ?? [];
    return {
      zeroToOne: rows.filter(r => r.scoreValue >= 0 && r.scoreValue <= 1).length,
      zeroToHundred: rows.filter(r => r.scoreValue >= 0 && r.scoreValue <= 100).length,
    };
  }, [scoreImport.rows]);

  async function handleScoreFile(file: File) {
    setScoreImport({ phase: 'previewing', message: `Reading ${file.name}…`, fileName: file.name });
    try {
      const parsed = parseScoresCsv(await file.text());
      if (parsed.rows.length === 0) {
        setScoreImport({
          phase: 'error',
          message: parsed.errors[0] ?? 'No valid score rows found in the file.',
          fileName: file.name,
          skipped: parsed.skipped,
          parseErrors: parsed.errors,
        });
        return;
      }
      setScoreImport({
        phase: 'previewing',
        message: `Checking matches for ${parsed.rows.length.toLocaleString()} score rows…`,
        fileName: file.name,
        rows: parsed.rows,
        skipped: parsed.skipped,
        parseErrors: parsed.errors,
      });
      const preview = await previewScoreImport(parsed.rows);
      const preferred =
        preview.buildingRecordNumber.matchedRows >= preview.objectId.matchedRows
          ? 'building_record_number'
          : 'object_id';
      setMatchMode(preferred);
      setScoreImport({
        phase: 'ready',
        message: 'Choose a match column and score scale, then import.',
        fileName: file.name,
        rows: parsed.rows,
        preview,
        skipped: parsed.skipped,
        parseErrors: parsed.errors,
      });
    } catch (err) {
      setScoreImport({
        phase: 'error',
        message: err instanceof Error ? err.message : 'Score import preview failed.',
        fileName: file.name,
      });
    }
  }

  function onPickScoreFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) void handleScoreFile(file);
  }

  async function runScoreImport() {
    const rows = scoreImport.rows ?? [];
    if (rows.length === 0) return;
    setScoreImport(prev => ({
      ...prev,
      phase: 'importing',
      message: 'Importing scores…',
      progress: { done: 0, total: rows.length },
    }));
    try {
      const result = await importScores(rows, matchMode, valueScale, (done, total) => {
        setScoreImport(prev => ({ ...prev, phase: 'importing', progress: { done, total } }));
      });
      const skippedParts: string[] = [];
      if (result.unmatched > 0) skippedParts.push(`${result.unmatched.toLocaleString()} unmatched`);
      if (result.invalidValues > 0) skippedParts.push(`${result.invalidValues.toLocaleString()} invalid values`);
      setScoreImport(prev => ({
        ...prev,
        phase: 'done',
        message: `${result.upserted.toLocaleString()} scores imported${
          skippedParts.length ? ` · ${skippedParts.join(' · ')}` : ''
        }`,
        progress: undefined,
        result,
      }));
    } catch (err) {
      setScoreImport(prev => ({
        ...prev,
        phase: 'error',
        message: err instanceof Error ? err.message : 'Score import failed.',
        progress: undefined,
      }));
    }
  }

  // ── Inspection import ────────────────────────────────────────────────────────
  async function handleInspectionFile(file: File) {
    setInspectionImport({ phase: 'reading', message: `Reading ${file.name}…`, fileName: file.name });
    try {
      const parsed = parseInspectionsCsv(await file.text());
      if (parsed.rows.length === 0) {
        setInspectionImport({
          phase: 'error',
          message: parsed.errors[0] ?? 'No valid inspection rows found in the file.',
          fileName: file.name,
          skipped: parsed.skipped,
          parseErrors: parsed.errors,
        });
        return;
      }
      const ok = await confirm({
        title: 'Import inspection log',
        message:
          `Import ${parsed.rows.length.toLocaleString()} inspection CSV rows? ` +
          `For every block without a matching CSV object_id/building record number, ` +
          `the app will insert one mock inspection dated randomly between 2022-01-01 and 2026-05-01.`,
        confirmLabel: 'Import',
      });
      if (!ok) {
        setInspectionImport({ phase: 'idle', message: '' });
        return;
      }
      setInspectionImport({
        phase: 'importing',
        message: 'Importing real inspections and generating fallback inspections…',
        fileName: file.name,
        rows: parsed.rows,
        skipped: parsed.skipped,
        parseErrors: parsed.errors,
      });
      const result = await importInspectionsWithMockFallback(parsed.rows, (done, total) => {
        setInspectionImport(prev => ({ ...prev, phase: 'importing', progress: { done, total } }));
      });
      setInspectionImport({
        phase: 'done',
        message: `${result.realInserted.toLocaleString()} real rows and ${result.mockInserted.toLocaleString()} fallback rows inserted`,
        fileName: file.name,
        rows: parsed.rows,
        skipped: parsed.skipped,
        parseErrors: parsed.errors,
        result,
      });
    } catch (err) {
      setInspectionImport({
        phase: 'error',
        message: err instanceof Error ? err.message : 'Inspection import failed.',
        fileName: file.name,
      });
    }
  }

  function onPickInspectionFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) void handleInspectionFile(file);
  }

  return (
    <div className="admin-root">
      <div className="bg-grid" aria-hidden />
      <div className="bg-vignette" aria-hidden />
      <div className="bg-scanline" aria-hidden />

      <main className="page admin-page">
      <header className="page-header">
        <div className="page-title">
          <Wrench size={16} />
          <h1>Admin Console</h1>
        </div>
        <div className="page-sub">
          Restricted tools — data import, risk-model parameters, and score calculation.
          <a className="admin-back-link" href="/">
            <ArrowLeft size={12} /> Back to dashboard
          </a>
        </div>
      </header>

      <section className="page-body settings-body">
        {/* ── Risk model parameters ──────────────────────────────────────── */}
        <div className="settings-section">
          <div className="settings-section-head">
            <div className="settings-section-title">Risk model parameters</div>
            <div className="settings-section-desc">
              Saved to the database and used the next time you click <strong>Calculate</strong>.
              <code className="mono settings-formula">
                risk = 100 × σ(a₁(BA−30) + a₂(LI−10) + a₃×SAR)
              </code>
              <span className={`param-save-state param-save-${paramSave}`}>
                {paramSave === 'saving' && <><Loader2 size={11} className="spin" /> Saving…</>}
                {paramSave === 'saved' && <><CheckCircle2 size={11} /> Saved to database</>}
                {paramSave === 'error' && <><AlertTriangle size={11} /> Could not save</>}
              </span>
            </div>
          </div>

          <div className="risk-param-list">
            {SCORE_PARAM_META.map(({ key, label, description, min, max, step }) => (
              <div key={key} className="risk-param-row">
                <div className="risk-param-header">
                  <span className="risk-param-label">{label}</span>
                  <span className="risk-param-value mono">{params[key].toFixed(3)}</span>
                </div>
                <input
                  type="range"
                  className="risk-param-slider"
                  min={min}
                  max={max}
                  step={step}
                  value={params[key]}
                  onChange={e => onParamChange(key, parseFloat(e.target.value))}
                />
                <div className="risk-param-bounds">
                  <span>{min}</span><span>{max}</span>
                </div>
                <div className="risk-param-desc">{description}</div>
              </div>
            ))}
          </div>

          <button className="risk-param-reset" onClick={onResetParams} disabled={isDefault}>
            <RotateCcw size={13} />
            Reset to defaults
          </button>
        </div>

        {/* ── Calculate ──────────────────────────────────────────────────── */}
        <div className="settings-section">
          <div className="settings-section-head account-import-head">
            <div>
              <div className="settings-section-title">Calculate risk scores</div>
              <div className="settings-section-desc">
                Recompute and save the risk score for all {blocks.length.toLocaleString()} blocks
                using the parameters stored in the database.
              </div>
            </div>
            <button
              className="action-btn primary"
              onClick={handleRecalculate}
              disabled={recalc.phase === 'working'}
            >
              {recalc.phase === 'working'
                ? <Loader2 size={13} className="spin" />
                : <Calculator size={13} />}
              Calculate
            </button>
          </div>
          {recalc.phase !== 'idle' && (
            <div className={`import-banner import-${
              recalc.phase === 'working' ? 'working' : recalc.phase === 'error' ? 'error' : 'done'
            }`}>
              {recalc.phase === 'working' && <Loader2 size={13} className="spin" />}
              {recalc.phase === 'done' && <CheckCircle2 size={13} />}
              {recalc.phase === 'error' && <AlertTriangle size={13} />}
              <span className="import-banner-text">{recalc.message}</span>
            </div>
          )}
        </div>

        {/* ── Score import ───────────────────────────────────────────────── */}
        <div className="settings-section">
          <div className="settings-section-head account-import-head">
            <div>
              <div className="settings-section-title">Score import</div>
              <div className="settings-section-desc">
                Upload a CSV with object_id, score_name, and score_value columns.
              </div>
            </div>
            <button
              className="action-btn"
              onClick={() => scoreFileRef.current?.click()}
              disabled={scoreImport.phase === 'previewing' || scoreImport.phase === 'importing'}
            >
              {scoreImport.phase === 'previewing'
                ? <Loader2 size={13} className="spin" />
                : <Upload size={13} />}
              Select CSV
            </button>
            <input ref={scoreFileRef} type="file" accept=".csv,text/csv" hidden onChange={onPickScoreFile} />
          </div>

          {scoreImport.phase !== 'idle' && (
            <div className={`import-banner import-${
              scoreImport.phase === 'previewing' || scoreImport.phase === 'importing'
                ? 'working'
                : scoreImport.phase === 'error'
                  ? 'error'
                  : 'done'
            }`}>
              {(scoreImport.phase === 'previewing' || scoreImport.phase === 'importing') && <Loader2 size={13} className="spin" />}
              {(scoreImport.phase === 'ready' || scoreImport.phase === 'done') && <CheckCircle2 size={13} />}
              {scoreImport.phase === 'error' && <AlertTriangle size={13} />}
              <span className="import-banner-text">
                {scoreImport.fileName && <span className="mono">{scoreImport.fileName}</span>}
                {scoreImport.fileName ? ' · ' : ''}
                {scoreImport.message}
                {scoreImport.phase === 'importing' && scoreImport.progress && scoreImport.progress.total > 0 && (
                  <span className="mono"> {scoreImport.progress.done}/{scoreImport.progress.total}</span>
                )}
              </span>
            </div>
          )}

          {scoreImport.phase !== 'idle' && scoreImport.rows && (
            <div className="score-import-panel">
              <div className="score-import-summary">
                <ImportStat label="Valid CSV rows" value={scoreImport.rows.length.toLocaleString()} />
                <ImportStat
                  label="Skipped rows"
                  value={(scoreImport.skipped ?? 0).toLocaleString()}
                  tone={scoreImport.skipped ? 'warn' : undefined}
                />
              </div>

              {scoreImport.preview && (
                <>
                  <div className="score-import-choice">
                    <div className="account-import-label">Match CSV object_id against</div>
                    <div className="score-import-options">
                      <ChoiceButton
                        active={matchMode === 'building_record_number'}
                        onClick={() => setMatchMode('building_record_number')}
                        title="Building record number"
                        primary={`${scoreImport.preview.buildingRecordNumber.matchedRows.toLocaleString()} row matches`}
                        secondary={`${scoreImport.preview.buildingRecordNumber.matchedBlocks.toLocaleString()} blocks`}
                      />
                      <ChoiceButton
                        active={matchMode === 'object_id'}
                        onClick={() => setMatchMode('object_id')}
                        title="Object ID"
                        primary={`${scoreImport.preview.objectId.matchedRows.toLocaleString()} row matches`}
                        secondary={`${scoreImport.preview.objectId.matchedBlocks.toLocaleString()} blocks`}
                      />
                    </div>
                  </div>

                  <div className="score-import-choice">
                    <div className="account-import-label">Score value scale</div>
                    <div className="score-import-options">
                      <ChoiceButton
                        active={valueScale === 'zero_to_one'}
                        onClick={() => setValueScale('zero_to_one')}
                        title="0 to 1"
                        primary={`${scaleStats.zeroToOne.toLocaleString()} values fit`}
                        secondary="Stored as-is"
                      />
                      <ChoiceButton
                        active={valueScale === 'zero_to_hundred'}
                        onClick={() => setValueScale('zero_to_hundred')}
                        title="0 to 100"
                        primary={`${scaleStats.zeroToHundred.toLocaleString()} values fit`}
                        secondary="Divides by 100"
                      />
                    </div>
                  </div>

                  <div className="score-import-actions">
                    <button
                      className="action-btn primary"
                      onClick={runScoreImport}
                      disabled={scoreImport.phase === 'importing' || scoreImport.phase === 'previewing'}
                    >
                      {scoreImport.phase === 'importing'
                        ? <Loader2 size={13} className="spin" />
                        : <CheckCircle2 size={13} />}
                      Import scores
                    </button>
                  </div>
                </>
              )}

              {scoreImport.parseErrors && scoreImport.parseErrors.length > 0 && (
                <div className="score-import-errors">
                  {scoreImport.parseErrors.slice(0, 4).map(e => <div key={e}>{e}</div>)}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Inspection import ──────────────────────────────────────────── */}
        <div className="settings-section">
          <div className="settings-section-head account-import-head">
            <div>
              <div className="settings-section-title">Inspection log import</div>
              <div className="settings-section-desc">
                Upload object_id and date rows. Missing blocks receive one fallback inspection date.
              </div>
            </div>
            <button
              className="action-btn"
              onClick={() => inspectionFileRef.current?.click()}
              disabled={inspectionImport.phase === 'reading' || inspectionImport.phase === 'importing'}
            >
              {inspectionImport.phase === 'reading' || inspectionImport.phase === 'importing'
                ? <Loader2 size={13} className="spin" />
                : <Upload size={13} />}
              Import CSV
            </button>
            <input ref={inspectionFileRef} type="file" accept=".csv,text/csv" hidden onChange={onPickInspectionFile} />
          </div>

          {inspectionImport.phase !== 'idle' && (
            <div className={`import-banner import-${
              inspectionImport.phase === 'reading' || inspectionImport.phase === 'importing'
                ? 'working'
                : inspectionImport.phase === 'error'
                  ? 'error'
                  : 'done'
            }`}>
              {(inspectionImport.phase === 'reading' || inspectionImport.phase === 'importing') && <Loader2 size={13} className="spin" />}
              {inspectionImport.phase === 'done' && <CheckCircle2 size={13} />}
              {inspectionImport.phase === 'error' && <AlertTriangle size={13} />}
              <span className="import-banner-text">
                {inspectionImport.fileName && <span className="mono">{inspectionImport.fileName}</span>}
                {inspectionImport.fileName ? ' · ' : ''}
                {inspectionImport.message}
                {inspectionImport.phase === 'importing' && inspectionImport.progress && inspectionImport.progress.total > 0 && (
                  <span className="mono"> {inspectionImport.progress.done}/{inspectionImport.progress.total}</span>
                )}
              </span>
            </div>
          )}

          {inspectionImport.phase !== 'idle' && (
            <div className="score-import-panel">
              <div className="score-import-summary">
                <ImportStat label="Valid CSV rows" value={(inspectionImport.rows?.length ?? 0).toLocaleString()} />
                <ImportStat
                  label="Skipped rows"
                  value={(inspectionImport.skipped ?? 0).toLocaleString()}
                  tone={inspectionImport.skipped ? 'warn' : undefined}
                />
                {inspectionImport.result && (
                  <>
                    <ImportStat
                      label="Matched blocks"
                      value={`${inspectionImport.result.matchedBlocks.toLocaleString()} / ${inspectionImport.result.totalBlocks.toLocaleString()}`}
                      tone="ok"
                    />
                    <ImportStat
                      label="Inserted rows"
                      value={inspectionImport.result.inserted.toLocaleString()}
                      tone="ok"
                    />
                  </>
                )}
              </div>

              {inspectionImport.result && inspectionImport.result.unmatched > 0 && (
                <div className="score-import-errors">
                  {inspectionImport.result.unmatched.toLocaleString()} CSV rows did not match a building record number.
                  {inspectionImport.result.unmatchedSamples.length > 0 && (
                    <div className="mono">Examples: {inspectionImport.result.unmatchedSamples.join(', ')}</div>
                  )}
                </div>
              )}

              {inspectionImport.parseErrors && inspectionImport.parseErrors.length > 0 && (
                <div className="score-import-errors">
                  {inspectionImport.parseErrors.slice(0, 4).map(e => <div key={e}>{e}</div>)}
                </div>
              )}
            </div>
          )}
        </div>
      </section>
      </main>

      {dialog}
    </div>
  );
}

function ImportStat({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'warn' | 'bad' }) {
  return (
    <div className="account-field">
      <div className="account-field-label">
        <span className="account-field-icon"><Database size={13} /></span>
        {label}
      </div>
      <div className={`account-field-value mono ${tone ? `tone-${tone}` : ''}`}>{value}</div>
    </div>
  );
}

function ChoiceButton({
  active, onClick, title, primary, secondary,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  primary: string;
  secondary: string;
}) {
  return (
    <button
      type="button"
      className={`score-import-option ${active ? 'active' : ''}`}
      onClick={onClick}
      aria-pressed={active}
    >
      <span className="score-import-option-title">{title}</span>
      <span className="score-import-option-primary mono">{primary}</span>
      <span className="score-import-option-secondary">{secondary}</span>
    </button>
  );
}
