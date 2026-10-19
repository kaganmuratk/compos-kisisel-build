export function dateStringFromDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getTodayDateString(): string {
  return dateStringFromDate(new Date());
}

export function addDaysToDateString(dateString: string, deltaDays: number): string {
  const date = new Date(`${dateString}T00:00:00`);
  date.setDate(date.getDate() + deltaDays);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const shortDateFormatter = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short' });

export function formatShortDate(dateString: string): string {
  return shortDateFormatter.format(new Date(`${dateString}T00:00:00`));
}

const dayMonthFormatter = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long' });

// Default session title, e.g. "5 Ağustos" — full month name, no year (matches
// the everyday-use context of this app better than the abbreviated short form).
export function formatDayMonth(dateString: string): string {
  return dayMonthFormatter.format(new Date(`${dateString}T00:00:00`));
}

// "5 Ağustos" for the 1st session of the day, "5 Ağustos 2" for the 2nd, etc.
// `existingCount` = how many sessions of this type already exist today.
export function defaultSessionTitle(dateString: string, existingCount: number): string {
  const base = dayMonthFormatter.format(new Date(`${dateString}T00:00:00`));
  return existingCount > 0 ? `${base} ${existingCount + 1}` : base;
}

// Time-of-day helpers for bedtime/wake-time tracking. Times are plain "HH:MM"
// strings (no date attached) — bedtime is "last night", wake time is "this
// morning", so duration math needs to handle wrapping past midnight itself.
function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(totalMinutes: number): string {
  const wrapped = ((totalMinutes % 1440) + 1440) % 1440;
  const hours = Math.floor(wrapped / 60);
  const minutes = wrapped % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function addMinutesToTime(time: string, deltaMinutes: number): string {
  return minutesToTime(timeToMinutes(time) + deltaMinutes);
}

export function sleepDurationHours(bedTime: string, wakeTime: string): number {
  const bed = timeToMinutes(bedTime);
  const wake = timeToMinutes(wakeTime);
  const diffMinutes = wake > bed ? wake - bed : 1440 - bed + wake;
  return Math.round((diffMinutes / 60) * 4) / 4;
}

const clockTimeFormatter = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' });

export function formatClockTime(isoString: string): string {
  return clockTimeFormatter.format(new Date(isoString));
}

export function formatSleepDuration(hours: number): string {
  const totalMinutes = Math.round(hours * 60);
  const wholeHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${wholeHours}h` : `${wholeHours}h ${minutes}m`;
}
