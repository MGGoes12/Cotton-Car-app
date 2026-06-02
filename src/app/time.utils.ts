export const TIME_HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));

export function minuteOptions(step: number): string[] {
  const options: string[] = [];
  for (let m = 0; m < 60; m += step) {
    options.push(String(m).padStart(2, '0'));
  }
  return options;
}

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':');
  return Number(h) * 60 + Number(m ?? 0);
}

export function formatTime(hour: string, minute: string): string {
  return `${hour}:${minute}`;
}

export function snapTimeToStep(time: string, step: number): string {
  const mins = timeToMinutes(time);
  const snapped = Math.round(mins / step) * step;
  const capped = Math.min(Math.max(snapped, 0), 23 * 60 + (60 - step));
  const h = Math.floor(capped / 60);
  const m = capped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function parseTime(time: string, step: number): { hour: string; minute: string } {
  const normalized = snapTimeToStep(time || '09:00', step);
  const [hour, minute] = normalized.split(':');
  return { hour, minute };
}

export function clampTimeAtOrAfter(time: string, minTime: string, step: number): string {
  const snapped = snapTimeToStep(time, step);
  const minSnapped = snapTimeToStep(minTime, step);
  if (timeToMinutes(snapped) >= timeToMinutes(minSnapped)) {
    return snapped;
  }
  return minSnapped;
}

export function addDaysToDateString(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + days);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addMinutes(time: string, minutes: number, step: number): string {
  const total = Math.min(timeToMinutes(time) + minutes, 23 * 60 + 59);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return snapTimeToStep(formatTime(String(h).padStart(2, '0'), String(m).padStart(2, '0')), step);
}
