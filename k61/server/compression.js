const DIFF_THRESHOLD_LOSSY = 2;
const DIFF_THRESHOLD_LOSSLESS = 0;
const MIN_POINTS_TO_COMPRESS = 10;

function calculateDistance(p1, p2) {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
}

function douglasPeucker(points, epsilon) {
  if (points.length <= 2) return points;
  if (epsilon <= 0) return points.slice();

  let maxDistance = 0;
  let maxIndex = 0;
  const end = points.length - 1;

  for (let i = 1; i < end; i++) {
    const distance = perpendicularDistance(points[i], points[0], points[end]);
    if (distance > maxDistance) {
      maxDistance = distance;
      maxIndex = i;
    }
  }

  if (maxDistance > epsilon) {
    const left = douglasPeucker(points.slice(0, maxIndex + 1), epsilon);
    const right = douglasPeucker(points.slice(maxIndex), epsilon);
    return left.slice(0, -1).concat(right);
  }

  return [points[0], points[end]];
}

function perpendicularDistance(point, lineStart, lineEnd) {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  const mag = Math.sqrt(dx * dx + dy * dy);

  if (mag === 0) {
    return calculateDistance(point, lineStart);
  }

  const pvx = point.x - lineStart.x;
  const pvy = point.y - lineStart.y;
  const u = (pvx * dx + pvy * dy) / (mag * mag);

  if (u <= 0) {
    return calculateDistance(point, lineStart);
  } else if (u >= 1) {
    return calculateDistance(point, lineEnd);
  }

  const cx = lineStart.x + u * dx;
  const cy = lineStart.y + u * dy;

  return calculateDistance(point, { x: cx, y: cy });
}

function diffCompress(path, existingPaths, mode = 'lossy') {
  const originalJson = JSON.stringify(path);
  const originalSize = Buffer.byteLength(originalJson, 'utf8');

  if (!path.points || path.points.length < 2) {
    return {
      compressed: { ...path, skip: false, compressionMode: mode },
      originalSize,
      compressedSize: originalSize
    };
  }

  const epsilon = mode === 'lossless' ? DIFF_THRESHOLD_LOSSLESS : DIFF_THRESHOLD_LOSSY;
  const simplifiedPoints = douglasPeucker(path.points, epsilon);

  let isDuplicate = false;
  if (existingPaths && existingPaths.length > 0) {
    const lastPath = existingPaths[existingPaths.length - 1];
    if (lastPath && lastPath.points && lastPath.points.length > 0) {
      const lastPoint = lastPath.points[lastPath.points.length - 1];
      const firstPoint = simplifiedPoints[0];
      if (calculateDistance(lastPoint, firstPoint) < (mode === 'lossless' ? 0.1 : DIFF_THRESHOLD_LOSSY * 2) && 
          path.type === lastPath.type) {
        isDuplicate = true;
      }
    }
  }

  const compressedPath = {
    ...path,
    points: simplifiedPoints,
    isCompressed: mode === 'lossy',
    compressionMode: mode,
    originalPointCount: path.points.length,
    compressedPointCount: simplifiedPoints.length
  };

  if (isDuplicate && simplifiedPoints.length < MIN_POINTS_TO_COMPRESS) {
    return {
      compressed: { skip: true },
      originalSize,
      compressedSize: 0
    };
  }

  const compressedJson = JSON.stringify(compressedPath);
  const compressedSize = Buffer.byteLength(compressedJson, 'utf8');

  return {
    compressed: compressedPath,
    originalSize,
    compressedSize
  };
}

function diffDecompress(compressedPath) {
  if (!compressedPath || compressedPath.skip) {
    return null;
  }

  return {
    ...compressedPath,
    points: compressedPath.points || []
  };
}

function calculateCompressionRatio(originalSize, compressedSize) {
  if (originalSize === 0) return 0;
  return ((1 - compressedSize / originalSize) * 100).toFixed(2);
}

module.exports = {
  diffCompress,
  diffDecompress,
  calculateCompressionRatio,
  douglasPeucker
};
