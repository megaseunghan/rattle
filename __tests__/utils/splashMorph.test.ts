import { smoothProgress, splashContours, splashPath, SPLASH_DURATION_MS } from '../../lib/utils/splashMorph';

it('모든 프레임에서 같은 닫힌 곡선을 유지하고 좌표가 유한하다', () => {
  for (let frame = 0; frame <= 120; frame++) {
    const t = frame / 120;
    const contours = splashContours(t);
    expect(contours).toHaveLength(3);
    for (const points of contours) {
      expect(points).toHaveLength(50);
      expect(points.every(Number.isFinite)).toBe(true);
      expect(points[48]).toBeCloseTo(points[0], 7);
      expect(points[49]).toBeCloseTo(points[1], 7);
    }
    expect(splashPath(t).match(/C/g)).toHaveLength(24);
  }
});

it('60Hz 기준 인접 프레임 사이에 조각 좌표가 순간적으로 뛰지 않는다', () => {
  const frames = SPLASH_DURATION_MS / 1000 * 60;
  let previous = splashContours(0).flat();
  for (let frame = 1; frame <= frames; frame++) {
    const next = splashContours(frame / frames).flat();
    expect(Math.max(...next.map((value, i) => Math.abs(value - previous[i])))).toBeLessThan(3);
    previous = next;
  }
  expect(splashContours(0.9)).toEqual(splashContours(1));
});

it('겹치는 모션의 시작과 끝에서 속도가 부드럽게 0으로 이어진다', () => {
  const epsilon = 0.0001;
  expect(smoothProgress(-1)).toBe(0);
  expect(smoothProgress(2)).toBe(1);
  expect(smoothProgress(epsilon) / epsilon).toBeLessThan(0.0001);
  expect((1 - smoothProgress(1 - epsilon)) / epsilon).toBeLessThan(0.0001);
});
