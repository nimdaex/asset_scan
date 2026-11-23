// Reading CSV / TSV produced by Excel or pasted from a spreadsheet.

/** UTF-8 first; Thai Windows Excel saves "CSV (Comma delimited)" as windows-874 (TIS-620). */
export async function readTextFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('windows-874').decode(buf);
  }
}

function guessDelimiter(text: string): string {
  const nl = text.indexOf('\n');
  const line = nl === -1 ? text : text.slice(0, nl);
  const count = (c: string) => line.split(c).length - 1;
  if (count('\t') > 0) return '\t'; // copy from Excel / Google Sheets
  return count(';') > count(',') ? ';' : ',';
}

/** RFC 4180-ish parser: quoted fields, "" escapes, CRLF/LF. Drops rows that are entirely empty. */
export function parseDelimited(input: string): string[][] {
  const text = input.replace(/^﻿/, '');
  const d = guessDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  const endRow = () => {
    row.push(cell);
    if (row.some((c) => c.trim() !== '')) rows.push(row);
    row = [];
    cell = '';
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === d) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') endRow();
    else if (ch !== '\r') cell += ch;
  }
  if (cell !== '' || row.length) endRow();
  return rows;
}
