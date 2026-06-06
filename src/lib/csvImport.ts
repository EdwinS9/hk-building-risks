import type { InspectionImportRow } from '../data/blocks';

export interface ParsedInspectionsCsv {
  rows: InspectionImportRow[];
  /** Human-readable problems found while parsing (capped). */
  errors: string[];
  /** Count of data lines that were skipped because they were invalid. */
  skipped: number;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Split a single CSV line into fields, honoring double-quoted values and
// escaped quotes ("") inside them. Good enough for the simple two-column
// shape we accept here (object_id, date).
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      out.push(field);
      field = '';
    } else {
      field += c;
    }
  }
  out.push(field);
  return out;
}

// Parse a CSV with header columns `object_id` and `date` (YYYY-MM-DD).
// Column order is detected from the header, so either order works.
export function parseInspectionsCsv(text: string): ParsedInspectionsCsv {
  const errors: string[] = [];
  // Strip BOM and normalize line endings.
  const clean = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const lines = clean.split('\n').filter(l => l.trim() !== '');

  if (lines.length === 0) {
    return { rows: [], errors: ['File is empty.'], skipped: 0 };
  }

  const header = splitCsvLine(lines[0]).map(h => h.trim().toLowerCase());
  const objIdx = header.indexOf('object_id');
  const dateIdx = header.indexOf('date');
  if (objIdx === -1 || dateIdx === -1) {
    return {
      rows: [],
      errors: [`Header must contain "object_id" and "date" columns. Found: ${header.join(', ') || '(none)'}.`],
      skipped: 0,
    };
  }

  const rows: InspectionImportRow[] = [];
  let skipped = 0;
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const objectId = (cells[objIdx] ?? '').trim();
    const date = (cells[dateIdx] ?? '').trim();

    if (!objectId || !date) {
      skipped++;
      if (errors.length < 8) errors.push(`Line ${i + 1}: missing object_id or date.`);
      continue;
    }
    if (!DATE_RE.test(date) || Number.isNaN(new Date(date).getTime())) {
      skipped++;
      if (errors.length < 8) errors.push(`Line ${i + 1}: invalid date "${date}" (expected YYYY-MM-DD).`);
      continue;
    }
    rows.push({ objectId, date });
  }

  return { rows, errors, skipped };
}
