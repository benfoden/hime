// Pure coordinate-mapping math for Phase 16 in-place image overlay translation.
// NO chrome.* and NO document references: this module is imported by both the
// service worker side and the node test harness (test/overlay-geometry.mjs).
// The DOM/canvas wiring stays in content.ts; only the MATH lives here (Pattern law).

// A single vertex in pixel-coordinate space.
export interface Vertex {
  x: number;
  y: number;
}

// CSS object-fit values supported by mapBox letterbox math.
export type ObjectFit = 'fill' | 'contain' | 'cover' | 'none' | 'scale-down';

/**
 * Compute the object-fit transform parameters for a natural image size rendered
 * into a target rect. Returns either a uniform `scale` with `offX`/`offY` (for
 * contain/cover/none/scale-down) or independent `scaleX`/`scaleY` (for fill).
 *
 * Internal helper — called by mapBox.
 */
function objectFitTransform(
  natural: { w: number; h: number },
  rendered: { w: number; h: number },
  objectFit: ObjectFit,
): { scaleX: number; scaleY: number; offX: number; offY: number } {
  const nW = natural.w;
  const nH = natural.h;
  const rW = rendered.w;
  const rH = rendered.h;

  if (objectFit === 'fill') {
    // Independent x/y scaling — no letterbox offset.
    return { scaleX: rW / nW, scaleY: rH / nH, offX: 0, offY: 0 };
  }

  let scale: number;
  if (objectFit === 'contain') {
    scale = Math.min(rW / nW, rH / nH);
  } else if (objectFit === 'cover') {
    scale = Math.max(rW / nW, rH / nH);
  } else if (objectFit === 'none') {
    scale = 1;
  } else {
    // 'scale-down': behaves as the smaller of none vs contain
    scale = Math.min(1, Math.min(rW / nW, rH / nH));
  }

  const offX = (rW - nW * scale) / 2;
  const offY = (rH - nH * scale) / 2;
  return { scaleX: scale, scaleY: scale, offX, offY };
}

/**
 * Map a 4-vertex bounding box from submitted-image-pixel space to a
 * {left, top, width, height} rect relative to the RENDERED image rect.
 *
 * Three composable transforms (OVL-04, RESEARCH Pattern 3):
 *   (a) submitted-px -> natural-px: undo the worker's downscale (upX/upY ratio).
 *   (b) natural-px -> rendered rect: scale + object-fit letterbox offset.
 *   (c) rendered rect -> viewport: done by the overlay CONTAINER (Pattern 2), NOT here.
 *
 * @param box       4 vertices in submitted-image-pixel space (Vision's coordinate frame).
 * @param submitted Dimensions of the image actually sent to Vision (post-downscale).
 * @param natural   img.naturalWidth / img.naturalHeight.
 * @param rendered  img.getBoundingClientRect() width / height.
 * @param objectFit CSS object-fit value read from getComputedStyle(img).objectFit.
 *
 * Guard: if submitted.w or submitted.h is <= 0, returns a safe zero rect (no NaN/Infinity).
 */
export function mapBox(
  box: Vertex[],
  submitted: { w: number; h: number },
  natural: { w: number; h: number },
  rendered: { w: number; h: number },
  objectFit: ObjectFit,
): { left: number; top: number; width: number; height: number } {
  // Guard against degenerate submitted dimensions (Threat T-16-03).
  if (submitted.w <= 0 || submitted.h <= 0) {
    return { left: 0, top: 0, width: 0, height: 0 };
  }

  // (a) Undo the worker's downscale: submitted-px -> natural-px.
  const upX = natural.w / submitted.w;
  const upY = natural.h / submitted.h;
  const xs = box.map((v) => v.x * upX);
  const ys = box.map((v) => v.y * upY);

  // Axis-aligned bounding box from the 4 natural-px vertices (ignore skew).
  const nLeft = Math.min(...xs);
  const nTop  = Math.min(...ys);
  const nW    = Math.max(...xs) - nLeft;
  const nH    = Math.max(...ys) - nTop;

  // (b) natural-px -> rendered rect, honoring object-fit letterboxing.
  const { scaleX, scaleY, offX, offY } = objectFitTransform(natural, rendered, objectFit);

  return {
    left:   nLeft * scaleX + offX,
    top:    nTop  * scaleY + offY,
    width:  nW    * scaleX,
    height: nH    * scaleY,
  };
}
