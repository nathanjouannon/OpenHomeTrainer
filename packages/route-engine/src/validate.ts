import { angleDelta, type Route } from './route';

export interface RouteIssue {
  code:
    | 'closure-position'
    | 'closure-altitude'
    | 'closure-grade'
    | 'closure-heading'
    | 'grade-range';
  message: string;
}

/**
 * Checks a loop's start/finish join (docs/07-donnees-et-api.md §1): the closing
 * segment must look like any other segment of the route.
 */
export function validateLoop(route: Route, maxAbsGradePercent = 25): RouteIssue[] {
  const issues: RouteIssue[] = [];
  const n = route.pointCount;
  const last = n - 1;
  const step = route.lengthM - (route.d[last] as number);
  const gap = Math.hypot(
    (route.x[0] as number) - (route.x[last] as number),
    (route.y[0] as number) - (route.y[last] as number),
  );
  if (Math.abs(gap - step) > 0.5) {
    issues.push({
      code: 'closure-position',
      message: `closing segment is ${gap.toFixed(2)} m long, expected ${step.toFixed(2)} m`,
    });
  }
  // Altitude: the closing segment must follow the local grade (±0.2 m).
  const g0 = route.grade[0] as number;
  const gl = route.grade[last] as number;
  const expectedDz = (((g0 + gl) / 2) * step) / 100;
  const dz = (route.z[0] as number) - (route.z[last] as number);
  if (Math.abs(dz - expectedDz) > 0.2) {
    issues.push({
      code: 'closure-altitude',
      message: `altitude jump of ${(dz - expectedDz).toFixed(2)} m at the line`,
    });
  }
  // Grade continuity: the jump at the line must not exceed the largest jump elsewhere + 0.5 %.
  let maxJump = 0;
  for (let i = 1; i < n; i++) {
    maxJump = Math.max(
      maxJump,
      Math.abs((route.grade[i] as number) - (route.grade[i - 1] as number)),
    );
  }
  if (Math.abs(g0 - gl) > Math.max(0.5, maxJump + 0.01)) {
    issues.push({
      code: 'closure-grade',
      message: `grade jump of ${(g0 - gl).toFixed(2)} % at the line`,
    });
  }
  const turn = Math.abs(angleDelta(route.heading[last] as number, route.heading[0] as number));
  if (turn > 0.35) {
    issues.push({
      code: 'closure-heading',
      message: `heading turns by ${turn.toFixed(2)} rad at the line`,
    });
  }
  for (const g of route.grade) {
    if (Math.abs(g) > maxAbsGradePercent) {
      issues.push({ code: 'grade-range', message: `grade ${g.toFixed(1)} % out of range` });
      break;
    }
  }
  return issues;
}
