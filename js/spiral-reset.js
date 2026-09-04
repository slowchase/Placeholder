// ---------------------------------------------------------------------------
// SEAMLESS SPIRAL RESET — LOCAL GATHER + PERSISTENT ORIGINAL TEXT
// ---------------------------------------------------------------------------
let spiralActive = false;

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function smoothstep(edge0, edge1, x) {
  if (edge0 === edge1) return x < edge0 ? 0 : 1;
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function sampleCircle(cx, cy, radius, count = 220) {
  const points = [];
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const angle = Math.PI + t * Math.PI * 2;
    points.push({ x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius });
  }
  return points;
}

function transformPoints(points, node) {
  // Stage 2 writes each live motion angle as a native SVG rotate(... 400 400)
  // transform. Read that angle first. The computed-style fallback is retained
  // only for compatibility with older snapshots. Reapplying the angle around
  // the same SVG center keeps the frozen Spiral snapshot on the exact live ring.
  const nativeTransform = node.getAttribute("transform") || "";
  const nativeMatch = nativeTransform.match(/rotate\(\s*([-+]?\d*\.?\d+)/i);
  let angle;
  if (nativeMatch) {
    angle = Number(nativeMatch[1]) * Math.PI / 180;
  } else {
    const transform = getComputedStyle(node).transform;
    if (!transform || transform === "none") return points.map(point => ({ ...point }));
    const matrix = new DOMMatrix(transform);
    angle = Math.atan2(matrix.b, matrix.a);
  }
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const cx = 400;
  const cy = 400;

  return points.map(point => {
    const dx = point.x - cx;
    const dy = point.y - cy;
    return {
      x: cx + dx * cos - dy * sin,
      y: cy + dx * sin + dy * cos
    };
  });
}

function interpolatePoints(from, to, t) {
  return from.map((point, i) => ({
    x: point.x + (to[i].x - point.x) * t,
    y: point.y + (to[i].y - point.y) * t
  }));
}

function pointsToPath(points) {
  if (!points.length) return "";
  let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let i = 1; i < points.length; i++) d += ` L ${points[i].x.toFixed(2)} ${points[i].y.toFixed(2)}`;
  return d;
}

function polylineLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  return total;
}

function resamplePolyline(points, count) {
  if (points.length === count) return points.map(p => ({ ...p }));
  const distances = [0];
  for (let i = 1; i < points.length; i++) {
    distances.push(distances[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  }
  const total = distances[distances.length - 1] || 1;
  const result = [];
  let seg = 1;
  for (let i = 0; i < count; i++) {
    const target = total * (i / (count - 1));
    while (seg < distances.length - 1 && distances[seg] < target) seg++;
    const a = points[seg - 1];
    const b = points[seg];
    const d0 = distances[seg - 1];
    const d1 = distances[seg];
    const u = d1 === d0 ? 0 : (target - d0) / (d1 - d0);
    result.push({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });
  }
  return result;
}

function nearestIndexToDirection(points, angle) {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  let bestIndex = 0;
  let bestScore = -Infinity;
  // Choose the point furthest along a fixed world-space ray from the green
  // center. This keeps every ring's break in the same visual neighborhood.
  for (let i = 0; i < points.length - 1; i++) {
    const px = points[i].x - 400;
    const py = points[i].y - 400;
    const score = px * dx + py * dy;
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }
  return bestIndex;
}

function circularArcSequence(points, startIndex, endIndex, direction) {
  const n = points.length - 1;
  const result = [];
  let idx = startIndex;
  result.push(points[idx]);
  let guard = 0;
  while (idx !== endIndex && guard < n + 2) {
    idx = (idx + direction + n) % n;
    result.push(points[idx]);
    guard++;
  }
  return result;
}

function normalizedVector(dx, dy) {
  const length = Math.hypot(dx, dy) || 1;
  return { x: dx / length, y: dy / length };
}

function cubicBezierConnector(a, aTangent, b, bTangent, samples = 28) {
  // Join neighboring ring arcs as though they were one continuous piece of wire.
  // Both Bézier handles lie on the tangents of the ring at the cut points, so
  // the connector leaves and enters each circle without a visible corner.
  const distance = Math.hypot(b.x - a.x, b.y - a.y);
  const handle = Math.max(10, Math.min(72, distance * 0.72));

  const c1 = {
    x: a.x + aTangent.x * handle,
    y: a.y + aTangent.y * handle
  };
  const c2 = {
    x: b.x - bTangent.x * handle,
    y: b.y - bTangent.y * handle
  };

  const points = [];
  for (let i = 0; i < samples; i++) {
    const t = i / (samples - 1);
    const u = 1 - t;
    points.push({
      x: u*u*u*a.x + 3*u*u*t*c1.x + 3*u*t*t*c2.x + t*t*t*b.x,
      y: u*u*u*a.y + 3*u*u*t*c1.y + 3*u*t*t*c2.y + t*t*t*b.y
    });
  }
  return points;
}

function orderedClosedCircle(points, startIndex, direction, samples = 220) {
  // Keep the exact frozen circle. We only choose where point 0 lives and which
  // direction the point order travels; no alternate/broken source geometry is built.
  const unique = points.slice(0, -1);
  const n = unique.length;
  if (!n) return [];
  const ordered = [];
  for (let i = 0; i <= n; i++) {
    const idx = ((startIndex + direction * i) % n + n) % n;
    ordered.push({ ...unique[idx] });
  }
  return resamplePolyline(ordered, samples);
}

function correspondenceCost(source, target, stopAt = Infinity) {
  let cost = 0;
  const n = Math.min(source.length, target.length);
  for (let i = 0; i < n; i++) {
    const dx = source[i].x - target[i].x;
    const dy = source[i].y - target[i].y;
    cost += dx * dx + dy * dy;
    if (cost >= stopAt) return cost;
  }
  return cost / Math.max(1, n);
}

function bestCircleCorrespondence(points, target, samples = 220) {
  // A closed circle has no intrinsic start point. Try every possible starting
  // point in both directions and keep the ordering that requires the least total
  // point travel into this spiral turn. This removes the arbitrary 25/75% cut and
  // lets the two coincident circle endpoints separate naturally into the spiral.
  const unique = points.slice(0, -1);
  const n = unique.length;
  const targetSampled = resamplePolyline(target, samples);
  let bestPath = resamplePolyline(points, samples);
  let bestCost = Infinity;
  let bestStart = 0;
  let bestDirection = 1;

  for (const direction of [1, -1]) {
    for (let start = 0; start < n; start++) {
      const candidate = orderedClosedCircle(points, start, direction, samples);
      const cost = correspondenceCost(candidate, targetSampled, bestCost);
      if (cost < bestCost) {
        bestCost = cost;
        bestPath = candidate;
        bestStart = start;
        bestDirection = direction;
      }
    }
  }

  return { path: bestPath, cost: bestCost, startIndex: bestStart, direction: bestDirection };
}

function buildDirectSpiralGeometry(rawCircles, samples = 220) {
  // OPTIMAL-CORRESPONDENCE SPIRAL MORPH
  //
  // There is no pre-cut ring and no "near-closed" surrogate. Each target segment
  // is one turn of a single Archimedean spiral. The exact frozen circle is mapped
  // to that turn using the start point + direction that minimizes total movement.
  // Because the first and last source points are the SAME pixel, their separation
  // during interpolation is the break opening. The circle therefore becomes an
  // open spiral turn directly, in one deformation.
  const count = rawCircles.length;

  const lineRadii = rawCircles.map(points => {
    let sum = 0;
    for (const pt of points.slice(0, -1)) sum += Math.hypot(pt.x - 400, pt.y - 400);
    return sum / Math.max(1, points.length - 1);
  });

  // One spiral revolution per logical ring is the most natural correspondence:
  // a full circle opens into a nearly circular spiral turn rather than first being
  // shortened to an arbitrary fraction of itself.
  const innerRadius = Math.max(48, Math.min(...lineRadii));
  const outerRadius = Math.max(innerRadius + 12, Math.max(...lineRadii));
  const turns = Math.max(1, count);
  const startAngle = -Math.PI * 0.12;

  const masterCount = count * samples - (count - 1);
  const targetMaster = archimedeanSpiral(masterCount, turns, innerRadius, outerRadius, startAngle);
  const targetSegments = [];
  let cursor = 0;
  for (let i = 0; i < count; i++) {
    const seg = targetMaster.slice(cursor, cursor + samples);
    targetSegments.push(resamplePolyline(seg, samples));
    cursor += samples - 1;
  }

  const sourceSegments = rawCircles.map((points, index) =>
    bestCircleCorrespondence(points, targetSegments[index], samples).path
  );

  return {
    sourceSegments,
    targetSegments,
    targetMaster,
    startAngle,
    turns,
    innerRadius,
    outerRadius
  };
}

function directSpiralSegmentsAtProgress(rawCircles, geometry, progress, samples = 220) {
  // Frame zero is literally the frozen circle (just re-indexed around the same
  // pixels). From there the coincident endpoints separate while every other point
  // follows its minimum-travel correspondence into the target spiral turn.
  const q = easeInOutCubic(clamp(progress, 0, 1));
  return geometry.sourceSegments.map((sourceSegment, i) => {
    const source = resamplePolyline(sourceSegment, samples);
    const target = resamplePolyline(geometry.targetSegments[i], samples);
    return interpolatePoints(source, target, q);
  });
}

function masterFromSegments(segments, connectors) {
  const points = [];
  segments.forEach((segment, i) => {
    points.push(...(i === 0 ? segment : segment.slice(1)));
    if (i < connectors.length) points.push(...connectors[i].slice(1));
  });
  return points;
}

function archimedeanSpiral(count, turns, innerRadius, outerRadius, startAngle = -Math.PI / 2) {
  const points = [];
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const angle = startAngle + t * Math.PI * 2 * turns;
    const radius = innerRadius + (outerRadius - innerRadius) * t;
    points.push({ x: 400 + Math.cos(angle) * radius, y: 400 + Math.sin(angle) * radius });
  }
  return points;
}

function segmentRangesForMaster(segments, connectors) {
  let cursor = 0;
  return segments.map((segment, i) => {
    const start = cursor;
    const end = cursor + segment.length - 1;
    cursor = end + (i < connectors.length ? connectors[i].length - 1 : 0);
    return [start, end];
  });
}

function extractRange(points, range, count = 220) {
  const [a, b] = range;
  return resamplePolyline(points.slice(a, b + 1), count);
}

function rotateClosedPolylineFromFraction(points, fraction = 0, count = 220) {
  // Start the temporary text path exactly where the live text currently begins.
  // This avoids the visual jump caused by keeping the old textPath percentage
  // while swapping to a path with a completely different length.
  const closed = points.slice(0, -1);
  const n = closed.length;
  if (!n) return [];
  const start = ((Math.round(clamp(fraction, 0, 1) * n) % n) + n) % n;
  const ordered = [];
  for (let i = 0; i <= n; i++) ordered.push(closed[(start + i) % n]);
  return resamplePolyline(ordered, count);
}

function nearestIndexOnPolyline(points, target, minIndex = 0, maxIndex = points.length - 1) {
  let best = Math.max(0, minIndex);
  let bestDistance = Infinity;
  const hi = Math.min(points.length - 1, maxIndex);
  for (let i = best; i <= hi; i++) {
    const d = Math.hypot(points[i].x - target.x, points[i].y - target.y);
    if (d < bestDistance) { bestDistance = d; best = i; }
  }
  return best;
}

function nearestTextWindowOnSpiral(sourcePath, master, count = 220, maxIndex = master.length - 1) {
  // Find the closest point on the spiral to the text's current first visible
  // character, then follow the spiral from there. Persistent original labels
  // can constrain maxIndex so they settle onto the central portion that survives.
  const anchor = sourcePath[0];
  const safeMax = Math.max(1, Math.min(master.length - 1, maxIndex));
  const start = nearestIndexOnPolyline(master, anchor, 0, safeMax);
  const availableAfter = safeMax - start + 1;
  let slice;
  if (availableAfter >= 2) {
    slice = master.slice(start, safeMax + 1);
  } else {
    const back = Math.max(0, safeMax - Math.max(2, Math.floor(master.length / 5)));
    slice = master.slice(back, safeMax + 1);
  }
  return resamplePolyline(slice, count);
}

function temporaryDeletionWindow(index, count) {
  const normalized = count <= 1 ? 0 : index / (count - 1);
  const start = 0.08 + normalized * 0.34;
  return [start, Math.min(0.72, start + 0.30)];
}

function deletedTemporaryText(source, index, count, progress) {
  const [start, end] = temporaryDeletionWindow(index, count);
  const p = clamp((progress - start) / Math.max(0.001, end - start), 0, 1);
  const eased = smoothstep(0, 1, p);
  const keep = Math.max(0, source.length - Math.floor(eased * source.length));
  return source.slice(0, keep);
}

function createSpiralSnapshot() {
  const layer = svgEl("g", { class: "spiral-reset-layer" });
  cameraLayer.appendChild(layer);

  const rawLineCircles = rings.map(ring => {
    const lineR = Math.max(1, ring.currentRadius - 17);
    const lineCx = Number(ring.dom.line.getAttribute("cx"));
    const lineCy = Number(ring.dom.line.getAttribute("cy"));
    return transformPoints(sampleCircle(lineCx, lineCy, lineR), ring.dom.lineMotion);
  });

  // Build the destination spiral and solve the correspondence from the exact
  // frozen circles. No gap percentage and no alternate source pose exists.
  const gather = buildDirectSpiralGeometry(rawLineCircles);

  const snapshots = rings.map((ring, index) => {
    const r = Math.max(1, ring.currentRadius);
    const fullTextCircle = transformPoints(sampleCircle(400, 400, r), ring.dom.textMotion);
    const startText = rotateClosedPolylineFromFraction(
      fullTextCircle,
      (ring.textStart ?? 8) / 100,
      220
    );
    const fullText = ring.kind === "email" ? (emailInput.value.trim() || "email") : ring.text;
    const persistent = ring.kind === "email" || ring.kind === "weekly";

    // IMPORTANT: this is the correspondence-ordered version of the exact frozen
    // circle. Re-indexing does not move a single pixel; it only chooses where the
    // closed path starts so the future opening can happen continuously.
    const exactFrozen = gather.sourceSegments[index];
    const linePath = svgEl("path", { class: "spiral-reset-line", d: pointsToPath(exactFrozen) });
    const textPathId = `spiral-text-path-${ring.serial}`;
    const hiddenPath = svgEl("path", { id: textPathId, fill: "none", stroke: "none", d: pointsToPath(startText) });
    const text = svgEl("text", { class: "spiral-reset-text", "data-kind": ring.kind });
    if (ring.kind === "email" && subscribed) text.classList.add("is-subscribed");
    const textPath = svgEl("textPath", { href: `#${textPathId}`, startOffset: "0%" });
    textPath.textContent = fullText;
    text.appendChild(textPath);
    layer.append(linePath, hiddenPath, text);

    return {
      ring,
      startLine: exactFrozen,
      localSegment: gather.targetSegments[index],
      startText,
      linePath,
      hiddenPath,
      text,
      textPath,
      fullText,
      persistent,
      spiralTextPath: null
    };
  });

  return { layer, snapshots, gather, rawLineCircles };
}

function setLiveAnimationsToRest() {
  for (const ring of rings) {
    ring.lineAngle = 0;
    ring.textAngle = 0;
    ring.textDragging = false;
    ring.dom.lineMotion.setAttribute("transform", "rotate(0 400 400)");
    ring.dom.textMotion.setAttribute("transform", "rotate(0 400 400)");
  }
}

function prepareOriginalTwoRingsForResolve() {
  const emailRing = rings.find(ring => ring.kind === "email");
  const weeklyRing = rings.find(ring => ring.kind === "weekly");

  for (const ring of [...rings]) {
    if (ring !== emailRing && ring !== weeklyRing) ring.dom.wrapper.remove();
  }

  rings.splice(0, rings.length, emailRing, weeklyRing);
  aboutIndex = 0;
  contactIndex = 0;
  aboutButton.classList.remove("is-gone");
  contactButton.classList.remove("is-gone");
  // Once unlocked, the quiet help link persists for the rest of this page visit.
  // Spiral can close an open guide, but it never hides the unlocked link again.
  if (typeof setFeelingLostOpen === "function") setFeelingLostOpen(false);
  layoutRings(true);
  syncEmailDisplay();
  setLiveAnimationsToRest();
  return { emailRing, weeklyRing };
}

function lineCirclePointsForRing(ring, count = 260) {
  const cx = Number(ring.dom.line.getAttribute("cx"));
  const cy = Number(ring.dom.line.getAttribute("cy"));
  const r = Number(ring.dom.line.getAttribute("r"));
  return sampleCircle(cx, cy, r, count);
}

function sampleSvgPath(pathNode, count = 220) {
  // Sample the ACTUAL live SVG text path instead of reconstructing a circle.
  // This preserves the browser's exact path direction/start point, which makes
  // the final temporary-to-live text handoff pixel-consistent.
  const total = Math.max(0.001, pathNode.getTotalLength());
  const points = [];
  for (let i = 0; i < count; i++) {
    const point = pathNode.getPointAtLength(total * (i / (count - 1)));
    points.push({ x: point.x, y: point.y });
  }
  return points;
}

function textCirclePointsForRing(ring, count = 220) {
  return sampleSvgPath(ring.dom.path, count);
}

function orientSpiralTextPath(sourcePath, targetSegment, count = 320) {
  // Give every label a full spiral turn so long strings cannot be clipped by a
  // short nearest-point window. Choose the end of the turn nearest the label's
  // current first character, which keeps the morph local without sacrificing
  // usable path length.
  const target = resamplePolyline(targetSegment, count);
  const anchor = sourcePath[0];
  const first = target[0];
  const last = target[target.length - 1];
  const dFirst = Math.hypot(first.x - anchor.x, first.y - anchor.y);
  const dLast = Math.hypot(last.x - anchor.x, last.y - anchor.y);
  return dLast < dFirst ? target.slice().reverse() : target;
}

function restartLiveOrbitAnimations() {
  // The shared Stage 2 motion clock resumes automatically once spiralActive
  // clears. Keep the resolved rings at their current native SVG angles.
  for (const ring of rings) ring.textDragging = false;
}

function beginSpiralReset() {
  if (spiralActive || submissionActive) return;
  // Spiral takes precedence over the highlight card. Close it exactly as the
  // Highlight control would, then continue into the spiral animation.
  if (typeof setHighlightOpen === "function" && highlightPanel?.classList.contains("is-open")) {
    setHighlightOpen(false);
  }
  spiralActive = true;
  solarSystem.classList.add("is-spiraling");
  aboutButton.disabled = true;
  contactButton.disabled = true;
  if (highlightButton) highlightButton.disabled = true;
  if (orbitToggleButton) orbitToggleButton.disabled = true;
  spiralButton.disabled = true;
  submitEventButton.disabled = true;

  requestAnimationFrame(() => {
    const { layer, snapshots, gather, rawLineCircles } = createSpiralSnapshot();
    ringsLayer.style.visibility = "hidden";

    const gatherDuration = 760;
    const contractDuration = 1550;
    const splitDuration = 1350;
    const started = performance.now();

    const localMaster = gather.targetMaster;
    // Each ring owns one contiguous full turn of the same master spiral.
    // The ranges remain deterministic because adjacent target segments share endpoints.
    const ranges = [];
    let rangeCursor = 0;
    for (let i = 0; i < rings.length; i++) {
      const start = rangeCursor;
      const end = Math.min(localMaster.length - 1, start + 219);
      ranges.push([start, end]);
      rangeCursor = end;
    }
    const spiralSegments = gather.targetSegments.map(seg => resamplePolyline(seg, 220));
    const temporaryShots = snapshots.filter(s => !s.persistent);

    // Spiral deletion now happens from the OUTERMOST end toward the center.
    // Keep approximately two logical turns at the center for the original email
    // and weekly strands to resolve from. Nothing scales; the path simply gets
    // shorter from its outer endpoint.
    const pointsPerLogicalTurn = 219;
    const finalKeepCount = Math.min(
      localMaster.length,
      pointsPerLogicalTurn * 2 + 1
    );
    const persistentMaxIndex = Math.max(1, finalKeepCount - 1);

    // Keep every label on a FULL spiral turn. The previous nearest-point window
    // could become too short, which clipped strings such as the weekly calendar
    // label down to only a few visible characters. A full turn preserves the
    // whole label while still choosing the locally-nearest end of that turn.
    snapshots.forEach((shot, index) => {
      shot.spiralTextPath = orientSpiralTextPath(
        shot.startText,
        spiralSegments[index],
        320
      );
      shot.currentSpiralTextPath = shot.spiralTextPath;
      // Remember whether this label chose the reverse direction on its turn.
      const forward = spiralSegments[index];
      const dForward = Math.hypot(shot.spiralTextPath[0].x - forward[0].x, shot.spiralTextPath[0].y - forward[0].y);
      const dReverse = Math.hypot(shot.spiralTextPath[0].x - forward[forward.length - 1].x, shot.spiralTextPath[0].y - forward[forward.length - 1].y);
      shot.spiralTextReversed = dReverse < dForward;
    });

    // The two persistent phrases finish phase 2 on the innermost two turns.
    // During contraction their one-turn text windows slide inward along the
    // actual master spiral rather than interpolating straight across the plane.
    const persistentShots = snapshots.filter(s => s.persistent);
    const emailShotForCenter = persistentShots.find(s => s.ring.kind === "email");
    const weeklyShotForCenter = persistentShots.find(s => s.ring.kind === "weekly");
    const persistentTargetStart = new Map();
    if (emailShotForCenter) persistentTargetStart.set(emailShotForCenter, 0);
    if (weeklyShotForCenter) persistentTargetStart.set(weeklyShotForCenter, pointsPerLogicalTurn);
    snapshots.forEach((shot, index) => { shot.masterTurnStart = index * pointsPerLogicalTurn; });

    function spiralTurnWindow(startIndex, reversed, samples = 320) {
      const start = Math.max(0, Math.min(localMaster.length - 2, Math.round(startIndex)));
      const end = Math.max(start + 1, Math.min(localMaster.length - 1, start + pointsPerLogicalTurn));
      let windowPoints = resamplePolyline(localMaster.slice(start, end + 1), samples);
      if (reversed) windowPoints = windowPoints.reverse();
      return windowPoints;
    }

    function frame(now) {
      const elapsed = now - started;

      // Phase 1 — exact frozen circles directly become spiral turns.
      // No broken source pose exists. The duplicated endpoint of each closed circle
      // simply separates as its optimally-corresponding points move into the spiral.
      if (elapsed <= gatherDuration) {
        const rawP = clamp(elapsed / gatherDuration, 0, 1);
        const liveSegments = directSpiralSegmentsAtProgress(rawLineCircles, gather, rawP, 220);
        const textMorph = easeInOutCubic(clamp(rawP, 0, 1));
        snapshots.forEach((shot, index) => {
          shot.linePath.setAttribute("d", pointsToPath(liveSegments[index]));
          const destination = shot.spiralTextPath;
          const source = resamplePolyline(shot.startText, destination.length);
          shot.hiddenPath.setAttribute("d", pointsToPath(interpolatePoints(source, destination, textMorph)));
          shot.textPath.textContent = shot.fullText;
        });
        requestAnimationFrame(frame);
        return;
      }

      // At the gather boundary replace the stitched pieces with one exact path.
      if (!layer._masterPrepared) {
        layer._masterPrepared = true;
        const masterPath = svgEl("path", { class: "spiral-reset-line", d: pointsToPath(localMaster) });
        layer.insertBefore(masterPath, layer.firstChild);
        snapshots.forEach(shot => shot.linePath.remove());
        layer._masterPath = masterPath;
      }

      // Phase 2 — the rings are now one exact spiral.
      // Immediately delete its OUTER end inward; no connector solve or flip exists.
      const contractionElapsed = elapsed - gatherDuration;
      if (contractionElapsed <= contractDuration) {
        const raw = clamp(contractionElapsed / contractDuration, 0, 1);

        const spiralNow = localMaster;

        // Progressively remove points from the END of the path, which is the
        // outermost end of this Archimedean spiral. The center remains fixed and
        // the surviving line therefore collects naturally around the green core.
        const erase = easeInOutCubic(raw);
        const keepCount = Math.max(
          finalKeepCount,
          Math.round(localMaster.length - (localMaster.length - finalKeepCount) * erase)
        );
        const visibleSpiral = spiralNow.slice(0, keepCount);
        layer._masterPath.setAttribute("d", pointsToPath(visibleSpiral));

        snapshots.forEach((shot, index) => {
          if (shot.persistent) {
            const targetStart = persistentTargetStart.get(shot);
            const movingStart = shot.masterTurnStart + (targetStart - shot.masterTurnStart) * erase;
            const movingPath = spiralTurnWindow(movingStart, shot.spiralTextReversed, 320);
            shot.currentSpiralTextPath = movingPath;
            shot.hiddenPath.setAttribute("d", pointsToPath(movingPath));
            shot.textPath.textContent = shot.fullText;
          } else {
            shot.hiddenPath.setAttribute("d", pointsToPath(shot.spiralTextPath));
            const temporaryIndex = temporaryShots.indexOf(shot);
            shot.textPath.textContent = deletedTemporaryText(shot.fullText, temporaryIndex, temporaryShots.length, raw);
          }
        });

        requestAnimationFrame(frame);
        return;
      }

      // Phase 3 preparation. Temporary text is already gone. Keep the original
      // weekly and email text nodes alive and morph their actual text paths into
      // the exact paths used by the restored live rings.
      if (!layer._splitPrepared) {
        layer._splitPrepared = true;
        snapshots.filter(s => !s.persistent).forEach(shot => {
          shot.hiddenPath.remove();
          shot.text.remove();
        });

        const emailShot = snapshots.find(s => s.ring.kind === "email");
        const weeklyShot = snapshots.find(s => s.ring.kind === "weekly");
        const emailIndex = snapshots.indexOf(emailShot);
        const weeklyIndex = snapshots.indexOf(weeklyShot);

        // The OUTER end has now been erased, leaving only the central two-turn
        // portion. Split that surviving center directly into the two reset strands.
        const surviving = localMaster.slice(0, finalKeepCount);
        const splitPoint = Math.max(2, Math.floor((surviving.length - 1) / 2) + 1);
        const strandAStart = resamplePolyline(surviving.slice(0, splitPoint), 280);
        const strandBStart = resamplePolyline(surviving.slice(splitPoint - 1), 280);

        const { emailRing, weeklyRing } = prepareOriginalTwoRingsForResolve();
        const targetA = resamplePolyline(lineCirclePointsForRing(emailRing, 280), 280);
        const targetB = resamplePolyline(lineCirclePointsForRing(weeklyRing, 280), 280);

        const strandA = svgEl("path", { class: "spiral-reset-line", d: pointsToPath(strandAStart) });
        const strandB = svgEl("path", { class: "spiral-reset-line", d: pointsToPath(strandBStart) });
        layer.append(strandA, strandB);
        layer._masterPath.remove();

        const emailTextStart = resamplePolyline(emailShot.currentSpiralTextPath || emailShot.spiralTextPath, 220);
        const weeklyTextStart = resamplePolyline(weeklyShot.currentSpiralTextPath || weeklyShot.spiralTextPath, 220);
        // Sample the real restored text paths, then rotate the sampled point order
        // by the exact live textPath startOffset. This makes the final frame of
        // the animation geometrically identical to the first visible live frame.
        const emailTextTarget = rotateClosedPolylineFromFraction(
          textCirclePointsForRing(emailRing, emailTextStart.length),
          (emailRing.textStart ?? 20) / 100,
          emailTextStart.length
        );
        const weeklyTextTarget = rotateClosedPolylineFromFraction(
          textCirclePointsForRing(weeklyRing, weeklyTextStart.length),
          (weeklyRing.textStart ?? 6) / 100,
          weeklyTextStart.length
        );

        // The live rings are already laid out underneath this snapshot. Keep their
        // text suppressed until the temporary text reaches the exact same path.
        ringsLayer.classList.add("is-line-handoff");

        layer._splitState = {
          strandA, strandB, strandAStart, strandBStart, targetA, targetB,
          emailShot, weeklyShot,
          emailTextStart, weeklyTextStart,
          emailTextTarget, weeklyTextTarget
        };
      }

      const splitElapsed = contractionElapsed - contractDuration;
      const rawSplit = clamp(splitElapsed / splitDuration, 0, 1);
      const s = easeInOutCubic(rawSplit);
      const state = layer._splitState;

      state.strandA.setAttribute("d", pointsToPath(interpolatePoints(state.strandAStart, state.targetA, s)));
      state.strandB.setAttribute("d", pointsToPath(interpolatePoints(state.strandBStart, state.targetB, s)));

      state.emailShot.hiddenPath.setAttribute("d", pointsToPath(interpolatePoints(state.emailTextStart, state.emailTextTarget, s)));
      state.weeklyShot.hiddenPath.setAttribute("d", pointsToPath(interpolatePoints(state.weeklyTextStart, state.weeklyTextTarget, s)));
      state.emailShot.textPath.textContent = state.emailShot.fullText;
      state.weeklyShot.textPath.textContent = state.weeklyShot.fullText;
      state.emailShot.textPath.setAttribute("startOffset", "0%");
      state.weeklyShot.textPath.setAttribute("startOffset", "0%");

      if (rawSplit < 1) {
        requestAnimationFrame(frame);
        return;
      }

      // Exact geometry + exact text handoff. The temporary persistent text is
      // sitting on the same circle paths with the same offsets as the live SVG
      // text before we swap layers, so there is no delete/reappear moment.
      ringsLayer.style.visibility = "visible";
      layer.remove();
      solarSystem.classList.remove("is-spiraling");
      ringsLayer.classList.remove("is-line-handoff");

      requestAnimationFrame(() => {
        restartLiveOrbitAnimations();
        targetZoom = 1;
        requestZoomFrame();
        aboutButton.disabled = false;
        contactButton.disabled = false;
        if (highlightButton) highlightButton.disabled = false;
        if (orbitToggleButton) orbitToggleButton.disabled = false;
        spiralButton.disabled = false;
        submitEventButton.disabled = false;
        spiralActive = false;
      });
    }

    requestAnimationFrame(frame);
  });
}


