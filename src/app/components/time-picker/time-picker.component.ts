import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import {
  TIME_HOURS,
  clampTimeAtOrAfter,
  formatTime,
  minuteOptions,
  parseTime,
  snapTimeToStep,
  timeToMinutes
} from '../../time.utils';

@Component({
  selector: 'app-time-picker',
  templateUrl: './time-picker.component.html',
  styleUrls: ['./time-picker.component.scss']
})
export class TimePickerComponent implements OnInit, OnChanges {
  @Input() value = '09:00';
  @Input() minTime?: string;
  @Input() minuteStep = 5;
  @Input() disabled = false;
  @Output() valueChange = new EventEmitter<string>();

  hour = '09';
  minute = '00';
  hours = TIME_HOURS;
  minutes: string[] = minuteOptions(5);

  ngOnInit(): void {
    this.syncFromValue();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['minuteStep']) {
      this.minutes = minuteOptions(this.minuteStep);
    }
    if (changes['value'] || changes['minTime'] || changes['minuteStep']) {
      this.syncFromValue();
    }
  }

  get availableHours(): string[] {
    if (!this.minTime) {
      return this.hours;
    }
    const minMins = timeToMinutes(this.minTime);
    return this.hours.filter(h =>
      this.minutes.some(m => timeToMinutes(formatTime(h, m)) >= minMins)
    );
  }

  availableMinutesForHour(hour: string): string[] {
    if (!this.minTime) {
      return this.minutes;
    }
    const minMins = timeToMinutes(this.minTime);
    return this.minutes.filter(m => timeToMinutes(formatTime(hour, m)) >= minMins);
  }

  onHourChange(hour: string) {
    this.hour = hour;
    const allowed = this.availableMinutesForHour(hour);
    if (!allowed.includes(this.minute)) {
      this.minute = allowed[0] ?? this.minutes[0];
    }
    this.emitValue();
  }

  onMinuteChange(minute: string) {
    this.minute = minute;
    this.emitValue();
  }

  private syncFromValue() {
    this.minutes = minuteOptions(this.minuteStep);
    let next = snapTimeToStep(this.value || '09:00', this.minuteStep);
    if (this.minTime) {
      next = clampTimeAtOrAfter(next, this.minTime, this.minuteStep);
    }
    const parsed = parseTime(next, this.minuteStep);
    this.hour = parsed.hour;
    this.minute = parsed.minute;
    if (this.value !== next) {
      this.valueChange.emit(next);
    }
  }

  private emitValue() {
    let next = formatTime(this.hour, this.minute);
    if (this.minTime) {
      next = clampTimeAtOrAfter(next, this.minTime, this.minuteStep);
      const parsed = parseTime(next, this.minuteStep);
      this.hour = parsed.hour;
      this.minute = parsed.minute;
    }
    this.valueChange.emit(next);
  }
}
