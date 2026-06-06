import { useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  UserCircle2,
  Mail,
  Shield,
  Clock,
  LogOut,
  Database,
  Activity,
  Upload,
  Loader2,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { getAuth, subscribeAuth } from '../../lib/auth';
import { getDbStatus, subscribeDbStatus } from '../../lib/dbStatus';
import {
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
import { parseInspectionsCsv, parseScoresCsv } from '../../lib/csvImport';

interface Props {
  onSignOut: () => void;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

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

export default function AccountView({ onSignOut }: Props) {
  const auth = useSyncExternalStore(subscribeAuth, getAuth, getAuth);
  const db = useSyncExternalStore(subscribeDbStatus, getDbStatus, getDbStatus);
  const scoreFileRef = useRef<HTMLInputElement>(null);
  const inspectionFileRef = useRef<HTMLInputElement>(null);
  const [scoreImport, setScoreImport] = useState<ScoreImportState>({
    phase: 'idle',
    message: '',
  });
  const [inspectionImport, setInspectionImport] = useState<InspectionImportState>({
    phase: 'idle',
    message: '',
  });
  const [matchMode, setMatchMode] = useState<ScoreMatchMode>('building_record_number');
  const [valueScale, setValueScale] = useState<ScoreValueScale>('zero_to_one');

  const user = auth.user;
  const email = user?.email ?? 'Unknown';
  const initial = email.charAt(0).toUpperCase();

  const dbLabel =
    db.state === 'connected' ? 'Connected'
    : db.state === 'error'   ? 'Unreachable'
    : 'Connecting…';

  const scaleStats = useMemo(() => {
    const rows = scoreImport.rows ?? [];
    return {
      zeroToOne: rows.filter(r => r.scoreValue >= 0 && r.scoreValue <= 1).length,
      zeroToHundred: rows.filter(r => r.scoreValue >= 0 && r.scoreValue <= 100).length,
    };
  }, [scoreImport.rows]);

  async function handleScoreFile(file: File) {
    setScoreImport({
      phase: 'previewing',
      message: `Reading ${file.name}…`,
      fileName: file.name,
    });

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

  async function handleInspectionFile(file: File) {
    setInspectionImport({
      phase: 'reading',
      message: `Reading ${file.name}…`,
      fileName: file.name,
    });

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

      const ok = window.confirm(
        `Import ${parsed.rows.length.toLocaleString()} inspection CSV rows?\n\n` +
        `For every block without a matching CSV object_id/building record number, ` +
        `the app will insert one mock inspection dated randomly between 2022-01-01 and 2026-05-01.`,
      );
      if (!ok) {
        setInspectionImport({
          phase: 'idle',
          message: '',
        });
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
        setInspectionImport(prev => ({
          ...prev,
          phase: 'importing',
          progress: { done, total },
        }));
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

  return (
    <main className="page">
      <header className="page-header">
        <div className="page-title">
          <UserCircle2 size={16} />
          <h1>Account</h1>
        </div>
        <div className="page-sub">
          Your signed-in identity and the live connection backing this session.
        </div>
      </header>

      <section className="page-body account-body">
        <div className="account-card">
          <div className="account-id">
            <div className="account-avatar" aria-hidden>{initial}</div>
            <div className="account-id-text">
              <div className="account-email">{email}</div>
              <div className="account-role">
                <span className="account-online-dot" /> Authenticated · Inspector
              </div>
            </div>
            <button className="action-btn account-signout" onClick={onSignOut}>
              <LogOut size={13} /> Sign out
            </button>
          </div>

          <div className="account-grid">
            <AccountField icon={<Mail size={13} />}   label="Email"        value={email} />
            <AccountField icon={<Shield size={13} />} label="User ID"      value={user?.id ?? '—'} mono />
            <AccountField icon={<Clock size={13} />}  label="Last sign-in" value={formatDate(user?.last_sign_in_at)} />
            <AccountField icon={<Clock size={13} />}  label="Account since" value={formatDate(user?.created_at)} />
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-section-head">
            <div className="settings-section-title">Database connection</div>
            <div className="settings-section-desc">
              Live status of the Supabase backend serving block data.
            </div>
          </div>
          <div className="account-grid">
            <AccountField
              icon={<Database size={13} />}
              label="Status"
              value={dbLabel}
              tone={db.state === 'connected' ? 'ok' : db.state === 'error' ? 'bad' : 'warn'}
            />
            <AccountField
              icon={<Activity size={13} />}
              label="Latency"
              value={db.latencyMs != null ? `${db.latencyMs} ms` : '—'}
              mono
            />
            <AccountField
              icon={<Clock size={13} />}
              label="Last checked"
              value={db.checkedAt ? formatDate(new Date(db.checkedAt).toISOString()) : '—'}
            />
            <AccountField
              icon={<Shield size={13} />}
              label="Mode"
              value="Live data"
              tone="ok"
            />
          </div>
          {db.error && <div className="account-db-error">{db.error}</div>}
        </div>

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
            <input
              ref={scoreFileRef}
              type="file"
              accept=".csv,text/csv"
              hidden
              onChange={onPickScoreFile}
            />
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
                <AccountField
                  icon={<Upload size={13} />}
                  label="Valid CSV rows"
                  value={scoreImport.rows.length.toLocaleString()}
                  mono
                />
                <AccountField
                  icon={<AlertTriangle size={13} />}
                  label="Skipped rows"
                  value={(scoreImport.skipped ?? 0).toLocaleString()}
                  mono
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
            <input
              ref={inspectionFileRef}
              type="file"
              accept=".csv,text/csv"
              hidden
              onChange={onPickInspectionFile}
            />
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
                <AccountField
                  icon={<Upload size={13} />}
                  label="Valid CSV rows"
                  value={(inspectionImport.rows?.length ?? 0).toLocaleString()}
                  mono
                />
                <AccountField
                  icon={<AlertTriangle size={13} />}
                  label="Skipped rows"
                  value={(inspectionImport.skipped ?? 0).toLocaleString()}
                  mono
                  tone={inspectionImport.skipped ? 'warn' : undefined}
                />
                {inspectionImport.result && (
                  <>
                    <AccountField
                      icon={<CheckCircle2 size={13} />}
                      label="Matched blocks"
                      value={`${inspectionImport.result.matchedBlocks.toLocaleString()} / ${inspectionImport.result.totalBlocks.toLocaleString()}`}
                      mono
                      tone="ok"
                    />
                    <AccountField
                      icon={<Database size={13} />}
                      label="Inserted rows"
                      value={inspectionImport.result.inserted.toLocaleString()}
                      mono
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

function AccountField({
  icon, label, value, mono, tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
  tone?: 'ok' | 'warn' | 'bad';
}) {
  return (
    <div className="account-field">
      <div className="account-field-label">
        <span className="account-field-icon">{icon}</span>
        {label}
      </div>
      <div className={`account-field-value ${mono ? 'mono' : ''} ${tone ? `tone-${tone}` : ''}`}>
        {value}
      </div>
    </div>
  );
}
