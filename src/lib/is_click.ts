import euclideanDistance from './euclidean_distance';

const FINE_TOLERANCE = 4;
const GROSS_TOLERANCE = 12;
const INTERVAL = 500;

interface Point {
  x: number;
  y: number;
}

interface EventData {
  point?: Point;
  time?: number;
}

interface IsClickOptions {
  fineTolerance?: number;
  grossTolerance?: number;
  interval?: number;
}

export default function isClick(start: EventData, end: EventData, options: IsClickOptions = {}): boolean {
  const fineTolerance = (options.fineTolerance != null) ? options.fineTolerance : FINE_TOLERANCE;
  const grossTolerance = (options.grossTolerance != null) ? options.grossTolerance : GROSS_TOLERANCE;
  const interval = (options.interval != null) ? options.interval : INTERVAL;

  start.point = start.point || end.point;
  start.time = start.time || end.time;
  const moveDistance = euclideanDistance(start.point, end.point);

  return moveDistance < fineTolerance ||
    (moveDistance < grossTolerance && (end.time - start.time) < interval);
};
