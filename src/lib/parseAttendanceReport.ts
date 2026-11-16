export type ParsedStatus = 'present' | 'absent' | 'excused' | 'leave' | 'half_day' | 'late' | 'unknown';

export interface ParsedRow {
  employeeName: string;
  date: string | null;
  status: ParsedStatus;
  rawText: string;
}

export interface EmployeeSummary {
  name: string;
  present: number;
  absent: number;
  excused: number;
  leave: number;
  halfDay: number;
  late: number;
  unknown: number;
  totalDays: number;
  attendancePercent: number;
}

export interface NeedsReviewRow {
  rawText: string;
  reason: string;
}

export interface ParseResult {
  rows: ParsedRow[];
  totals: {
    present: number;
    absent: number;
    excused: number;
    leave: number;
    halfDay: number;
    late: number;
    unknown: number;
  };
  employees: EmployeeSummary[];
  needsReview: NeedsReviewRow[];
  detectedMonth: string | null;
  totalParsed: number;
}

// ─── Status keyword matching ────────────────────────────────────────────────

const STATUS_KEYWORDS: Record<ParsedStatus, string[]> = {
  present: ['present', 'on time', 'check-in', 'checked in', 'login', 'checked-in'],
  absent: ['absent', 'no show', 'noshow', 'missing'],
  excused: ['excused', 'wfh', 'work from home', 'remote', 'justified'],
  leave: ['leave', 'on leave', 'holiday', 'sunday', 'off today', 'off day'],
  half_day: ['half day', 'half-day', 'halfday'],
  late: ['late', 'delayed', 'tardy'],
  unknown: [],
};

const STATUS_SHORT_CODES: Record<ParsedStatus, string[]> = {
  present: ['p'],
  absent: ['a'],
  excused: ['e'],
  leave: ['l'],
  half_day: ['h', 'hd'],
  late: [],
  unknown: [],
};

function normalizeStatus(raw: string): ParsedStatus {
  const lower = raw.toLowerCase().trim().replace(/[()]/g, '');
  if (!lower) return 'unknown';
  const words = lower.split(/\s+/);
  for (const status of Object.keys(STATUS_SHORT_CODES) as ParsedStatus[]) {
    if (status === 'unknown') continue;
    for (const code of STATUS_SHORT_CODES[status]) {
      if (words.includes(code)) return status;
    }
  }
  for (const status of Object.keys(STATUS_KEYWORDS) as ParsedStatus[]) {
    if (status === 'unknown') continue;
    for (const kw of STATUS_KEYWORDS[status]) {
      if (lower === kw) return status;
    }
  }
  for (const status of Object.keys(STATUS_KEYWORDS) as ParsedStatus[]) {
    if (status === 'unknown') continue;
    for (const kw of STATUS_KEYWORDS[status]) {
      if (lower.startsWith(kw + ' ') || lower.startsWith(kw + '-') || lower.startsWith(kw + ' -')) return status;
    }
  }
  for (const status of Object.keys(STATUS_KEYWORDS) as ParsedStatus[]) {
    if (status === 'unknown') continue;
    for (const kw of STATUS_KEYWORDS[status]) {
      if (lower.includes(kw)) return status;
    }
  }
  return 'unknown';
}

// ─── Date extraction ─────────────────────────────────────────────────────────

function parseDateString(dateStr: string): string | null {
  const m = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!m) return null;
  let year = m[3];
  if (year.length === 2) year = '20' + year;
  return `${year}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
}

// ─── WhatsApp / chat line parsing ────────────────────────────────────────────

interface ChatLine {
  date: string | null;
  sender: string;
  message: string;
  raw: string;
}

const TS = '\\d{1,2}:\\d{2}(?::\\d{2})?\\s*(?:AM|PM)?';
const DATE = '(\\d{1,2}\\/\\d{1,2}\\/\\d{2,4})';

const LINE_PATTERNS: RegExp[] = [
  new RegExp(`^\\[${DATE},\\s*${TS}\\]\\s*(.+?):\\s*(.*)$`, 'i'),
  new RegExp(`^\\[${DATE}\\s+${TS}\\]\\s*(.+?):\\s*(.*)$`, 'i'),
  new RegExp(`^${DATE},\\s*${TS}\\s*[-\u2013]\\s*(.+?):\\s*(.*)$`, 'i'),
  new RegExp(`^${DATE},\\s*${TS}\\)\\s*(.+?):\\s*(.*)$`, 'i'),
];

function parseChatLine(line: string): ChatLine | null {
  for (const pattern of LINE_PATTERNS) {
    const match = line.match(pattern);
    if (match) {
      const [, dateStr, sender, message] = match;
      const date = parseDateString(dateStr);
      return { date, sender: sender.trim(), message: message.trim(), raw: line };
    }
  }
  return null;
}

// ─── Sender validation ───────────────────────────────────────────────────────

const SYSTEM_SENDERS = new Set([
  'you', 'system', 'whatsapp', 'group', 'admin',
]);

const SYSTEM_MESSAGE_PREFIXES = [
  'messages and calls are end-to-end encrypted',
  'changed', 'added', 'removed', 'left', 'joined',
  'created group', 'changed the subject', 'changed this group',
  'deleted this message', 'message deleted', 'this message was deleted',
  'image omitted', 'video omitted', 'audio omitted', 'document omitted',
  'sticker omitted', 'gif omitted', 'contact card omitted',
  'missed call', 'missed voice call', 'missed video call',
  'tap to unblock', 'waiting for this message',
];

function isSystemSender(sender: string): boolean {
  const lower = sender.toLowerCase().trim();
  if (SYSTEM_SENDERS.has(lower)) return true;
  for (const prefix of SYSTEM_MESSAGE_PREFIXES) {
    if (lower.startsWith(prefix)) return true;
  }
  return false;
}

// ─── Message-to-status parsing ───────────────────────────────────────────────

const NON_ATTENDANCE_KEYWORDS = [
  'good morning', 'good evening', 'good night', 'good afternoon',
  'thanks', 'thank you', 'thanku', 'thx', 'ok', 'okay', 'sure',
  'haha', 'lol', 'nice', 'great', 'cool', 'wow', 'oh', 'hmm',
  'please', 'sir', 'maam', 'madam', 'bro', 'bhai', 'bhaiya',
  'see you', 'bye', 'tc', 'take care', 'gn', 'gm',
  'http', 'www.', '.com', '.in',
  'screenshot', 'photo', 'file', 'doc', 'video',
  'yes sir', 'no sir', 'ok sir', 'sure sir',
  'hello', 'hi ', 'hey',
  'what', 'why', 'how', 'when', 'where', 'who',
  'meeting', 'call you', 'will call', 'let me', 'let us',
  'send', 'share', 'update', 'check this', 'look at',
  'sir ', 'mam ',
];

function isAttendanceMessage(message: string): boolean {
  const lower = message.toLowerCase().trim();
  if (!lower) return false;
  const words = lower.split(/\s+/).filter(Boolean);

  for (const status of Object.keys(STATUS_KEYWORDS) as ParsedStatus[]) {
    if (status === 'unknown') continue;
    for (const kw of STATUS_KEYWORDS[status]) {
      if (lower === kw) return true;
      if (lower.startsWith(kw + ' ')) return true;
      if (lower.startsWith(kw + '-')) return true;
      if (lower.startsWith(kw + ' -')) return true;
    }
  }
  if (words.length <= 3) {
    for (const status of Object.keys(STATUS_SHORT_CODES) as ParsedStatus[]) {
      if (status === 'unknown') continue;
      for (const code of STATUS_SHORT_CODES[status]) {
        if (words.includes(code)) return true;
      }
    }
  }
  if (words.length <= 8) {
    for (const kw of NON_ATTENDANCE_KEYWORDS) {
      if (lower === kw.trim() || lower.startsWith(kw)) return false;
    }
    if (words.length <= 3) {
      const status = normalizeStatus(message);
      if (status !== 'unknown') return true;
    }
  }
  return false;
}

// ─── Month detection ────────────────────────────────────────────────────────

function detectMonth(rows: ParsedRow[]): string | null {
  const monthCounts = new Map<string, number>();
  for (const row of rows) {
    if (row.date && row.date.length >= 7) {
      const month = row.date.slice(0, 7);
      monthCounts.set(month, (monthCounts.get(month) ?? 0) + 1);
    }
  }
  let bestMonth: string | null = null;
  let bestCount = 0;
  for (const [month, count] of monthCounts) {
    if (count > bestCount) {
      bestMonth = month;
      bestCount = count;
    }
  }
  return bestMonth;
}

// ─── Main parser ────────────────────────────────────────────────────────────

export function parseAttendanceText(rawText: string): ParseResult {
  const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const rows: ParsedRow[] = [];
  const needsReview: NeedsReviewRow[] = [];

  const employeeDates = new Map<string, Set<string>>();

  for (const line of lines) {
    const chatLine = parseChatLine(line);

    if (chatLine) {
      const { date, sender, message, raw } = chatLine;

      if (isSystemSender(sender)) continue;
      if (!isAttendanceMessage(message)) continue;

      const status = normalizeStatus(message);

      const dateKey = date ?? 'no-date';
      const dedupKey = sender.toLowerCase();
      if (!employeeDates.has(dedupKey)) employeeDates.set(dedupKey, new Set());
      const seenDates = employeeDates.get(dedupKey)!;
      if (seenDates.has(dateKey)) continue;
      seenDates.add(dateKey);

      rows.push({ employeeName: sender, date, status, rawText: raw });
    } else {
      const parts = line.includes('\t') ? line.split('\t').map(s => s.trim()).filter(Boolean)
        : line.includes('|') ? line.split('|').map(s => s.trim()).filter(Boolean)
        : null;

      if (parts && parts.length >= 2) {
        const lowerParts = parts.map(p => p.toLowerCase());
        if ((lowerParts[0] === 'name' || lowerParts[0] === 'employee' || lowerParts[0] === 'employee name')
            && (lowerParts.includes('status') || lowerParts.includes('date') || lowerParts.includes('attendance'))) {
          continue;
        }

        const name = parts[0];
        const statusPart = parts[1];
        const datePart = parts.length >= 3 ? parts[2] : null;

        const status = normalizeStatus(statusPart);
        const parsedDate = datePart ? parseDateString(datePart) : null;

        const dateKey = parsedDate ?? 'no-date';
        const dedupKey = name.toLowerCase();
        if (!employeeDates.has(dedupKey)) employeeDates.set(dedupKey, new Set());
        const seenDates = employeeDates.get(dedupKey)!;
        if (seenDates.has(dateKey)) continue;
        seenDates.add(dateKey);

        rows.push({ employeeName: name, date: parsedDate, status, rawText: line });
        continue;
      }

      if (line.startsWith('---') || line.startsWith('===') || line.length < 3) continue;
      if (/^[\d\s\/\-:.,]+$/.test(line)) continue;
      const lower = line.toLowerCase();
      if (lower.includes('end-to-end encrypted') || lower.includes('messages and calls')) continue;

      if (/[a-zA-Z]{3,}/.test(line)) {
        needsReview.push({ rawText: line, reason: 'Unrecognized line format — could not extract sender and attendance status' });
      }
    }
  }

  const totals = { present: 0, absent: 0, excused: 0, leave: 0, halfDay: 0, late: 0, unknown: 0 };
  const empMap = new Map<string, EmployeeSummary>();

  for (const row of rows) {
    const statusKey = row.status === 'half_day' ? 'halfDay' : row.status;
    totals[statusKey as keyof typeof totals]++;
    const dedupKey = row.employeeName.toLowerCase();
    if (!empMap.has(dedupKey)) {
      empMap.set(dedupKey, {
        name: row.employeeName, present: 0, absent: 0, excused: 0, leave: 0, halfDay: 0, late: 0, unknown: 0,
        totalDays: 0, attendancePercent: 0,
      });
    }
    const emp = empMap.get(dedupKey)!;
    (emp[statusKey as keyof EmployeeSummary] as unknown as number)++;
    emp.totalDays++;
  }

  const employees: EmployeeSummary[] = [];
  for (const emp of empMap.values()) {
    const counted = emp.present + emp.absent + emp.excused + emp.leave + emp.halfDay + emp.late + emp.unknown;
    if (counted > 0) {
      emp.attendancePercent = Math.round(((emp.present + emp.late + emp.halfDay * 0.5) / counted) * 100);
    }
    employees.push(emp);
  }

  employees.sort((a, b) => b.attendancePercent - a.attendancePercent);

  return {
    rows, totals, employees, needsReview,
    detectedMonth: detectMonth(rows),
    totalParsed: rows.length,
  };
}
