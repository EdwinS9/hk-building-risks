import { useMemo, useRef, useState } from 'react';
import { ClipboardCheck, MapPin, Upload, Loader2, CheckCircle2, AlertTriangle, Sparkles } from 'lucide-react';
import type { Block } from '../../data/blocks';
import { importInspections, generateMockInspections, type InspectionImportResult } from '../../data/blocks';
import { parseInspectionsCsv } from '../../lib/csvImport';
import { colorForBand, relativeTime } from '../../lib/constants';

interface Props {
  blocks: Block[];
  onJump: (id: string) => void;
}

type ImportPhase = 'idle' | 'working' | 'done' | 'error';

interface ImportState {
  phase: ImportPhase;
  message: string;
  progress?: { done: number; total: number };
  result?: InspectionImportResult;
}

export default function InspectedLog({ blocks, onJump }: Props) {
  const rows = useMemo(
    () =>
      blocks
        .filter(b => b.status === 'Inspected' && b.lastInspected)
        .sort((a, b) => (b.lastInspected! > a.lastInspected! ? 1 : -1)),
    [blocks],
  );

  const fileRef = useRef<HTMLInputElement>(null);
  const [imp, setImp] = useState<ImportState>({ phase: 'idle', message: '' });

  async function handleFile(file: File) {
    setImp({ phase: 'working', message: `Reading ${file.name}…` });
    try {
      const text = await file.text();
      const parsed = parseInspectionsCsv(text);

      if (parsed.rows.length === 0) {
        setImp({
          phase: 'error',
          message: parsed.errors[0] ?? 'No valid rows found in the file.',
        });
        return;
      }

      setImp({
        phase: 'working',
        message: `Importing ${parsed.rows.length} inspections…`,
        progress: { done: 0, total: parsed.rows.length },
      });

      const result = await importInspections(parsed.rows, (done, total) => {
        setImp(prev => ({ ...prev, phase: 'working', progress: { done, total } }));
      });

      const parts = [
        `${result.inserted} inserted across ${result.matchedBlocks} blocks`,
      ];
      if (result.unmatched > 0) {
        parts.push(`${result.unmatched} skipped (no matching object_id${
          result.unmatchedSamples.length ? `: ${result.unmatchedSamples.join(', ')}…` : ''
        })`);
      }
      if (parsed.skipped > 0) parts.push(`${parsed.skipped} invalid CSV rows`);

      setImp({ phase: 'done', message: parts.join(' · '), result });
    } catch (err) {
      setImp({
        phase: 'error',
        message: err instanceof Error ? err.message : 'Import failed.',
      });
    }
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset the input so picking the same file again re-triggers onChange.
    e.target.value = '';
    if (file) void handleFile(file);
  }

  async function handleGenerateMock() {
    const ok = window.confirm(
      `Generate mock inspection data for all ${blocks.length.toLocaleString()} blocks?\n\n` +
      `This inserts one inspection per block, dated so its age matches the block's ` +
      `current risk score (1 year ago for score 0, up to 30 years ago for score 100). ` +
      `It cannot be undone.`,
    );
    if (!ok) return;

    setImp({
      phase: 'working',
      message: 'Generating mock inspections…',
      progress: { done: 0, total: blocks.length },
    });
    try {
      const result = await generateMockInspections((done, total) => {
        setImp(prev => ({ ...prev, phase: 'working', progress: { done, total } }));
      });
      setImp({
        phase: 'done',
        message: `${result.inserted.toLocaleString()} mock inspections generated from risk scores.`,
      });
    } catch (err) {
      setImp({
        phase: 'error',
        message: err instanceof Error ? err.message : 'Generation failed.',
      });
    }
  }

  const busy = imp.phase === 'working';

  return (
    <main className="page">
      <header className="page-header">
        <div className="page-title">
          <ClipboardCheck size={16} />
          <h1>Inspected Log</h1>
          <span className="page-count mono">{rows.length}</span>
          <button
            className="action-btn tiny page-import-btn"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            title="Import inspections from a CSV (columns: object_id, date)"
          >
            {busy ? <Loader2 size={11} className="spin" /> : <Upload size={11} />}
            {busy ? 'Importing…' : 'Import CSV'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={onPick}
          />
          <button
            className="action-btn tiny"
            onClick={handleGenerateMock}
            disabled={busy}
            title="Generate one mock inspection per block, dated from its risk score"
          >
            {busy ? <Loader2 size={11} className="spin" /> : <Sparkles size={11} />}
            Generate mock
          </button>
        </div>
        <div className="page-sub">
          Chronological record of completed inspections. Sorted by most recent.
        </div>

        {imp.phase !== 'idle' && (
          <div className={`import-banner import-${imp.phase}`}>
            {imp.phase === 'working' && <Loader2 size={13} className="spin" />}
            {imp.phase === 'done' && <CheckCircle2 size={13} />}
            {imp.phase === 'error' && <AlertTriangle size={13} />}
            <span className="import-banner-text">
              {imp.message}
              {imp.phase === 'working' && imp.progress && imp.progress.total > 0 && (
                <span className="mono"> {imp.progress.done}/{imp.progress.total}</span>
              )}
            </span>
            {imp.phase !== 'working' && (
              <button
                className="import-banner-dismiss"
                onClick={() => setImp({ phase: 'idle', message: '' })}
              >
                Dismiss
              </button>
            )}
          </div>
        )}
      </header>

      <section className="page-body">
        {rows.length === 0 ? (
          <div className="page-empty">No inspections recorded yet.</div>
        ) : (
          <div className="data-table-wrap">
            <div className="data-table inspected-table">
              <div className="data-thead">
                <div>BLOCK</div>
                <div>DISTRICT</div>
                <div className="ta-r">SCORE</div>
                <div>BAND</div>
                <div>INSPECTED</div>
                <div className="ta-r">ACTION</div>
              </div>
              <div className="data-tbody">
                {rows.map(b => {
                  const color = colorForBand(b.riskBand);
                  return (
                    <div className="data-trow" key={b.id}>
                      <div className="dt-name">
                        <span className="row-dot" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
                        <span>{b.name}</span>
                      </div>
                      <div className="dt-dim">{b.district}</div>
                      <div className="ta-r mono" style={{ color }}>{b.riskScore}</div>
                      <div className="dt-band" style={{ color }}>{b.riskBand.toUpperCase()}</div>
                      <div className="dt-dim mono">{relativeTime(b.lastInspected!)}</div>
                      <div className="ta-r">
                        <button className="action-btn tiny" onClick={() => onJump(b.id)}>
                          <MapPin size={11} /> View on map
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
