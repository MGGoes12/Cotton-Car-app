import { addMinutes, snapTimeToStep, timeToMinutes } from './time.utils';

describe('time.utils', () => {
  it('converts time to minutes', () => {
    expect(timeToMinutes('09:30')).toBe(570);
  });

  it('snaps to 5-minute steps', () => {
    expect(snapTimeToStep('09:02', 5)).toBe('09:00');
    expect(snapTimeToStep('09:03', 5)).toBe('09:05');
  });

  it('adds minutes with step snap', () => {
    expect(addMinutes('09:00', 5, 5)).toBe('09:05');
  });
});
