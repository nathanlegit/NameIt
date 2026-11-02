import type { BundleItem } from "@/src/web/bundle";

// The frame SAM boxed, with the chosen object's mask (green) and, optionally,
// the objects it rejected (red dashed). The SVG uses frame pixels as its
// coordinate system, so it scales with the image.
export function EvidenceView({
  item,
  frameSize,
  showRejected = true,
  lazy = false,
}: {
  item: BundleItem;
  frameSize: { width: number; height: number };
  showRejected?: boolean;
  lazy?: boolean; // below the fold (eval page): let the browser load it later
}) {
  const evidence = item.evidence;
  if (!evidence) {
    return (
      <div className="no-evidence" style={{ aspectRatio: `${frameSize.width} / ${frameSize.height}` }}>
        <span>SAM did not find the object · no segmentation evidence</span>
      </div>
    );
  }
  const { box, maskPath, maskBounds } = evidence;
  const description = `Frame at ${item.refinedTime.toFixed(1)} seconds. Green outline: the object Name It chose.${
    showRejected && item.rejectedCandidates.length > 0 ? ` Red dashed boxes: ${item.rejectedCandidates.length} other candidates.` : ""
  }`;
  return (
    <figure className="evidence">
      <img
        src={evidence.frameUrl}
        alt={description}
        width={frameSize.width}
        height={frameSize.height}
        loading={lazy ? "lazy" : undefined}
        decoding="async"
      />
      <svg viewBox={`0 0 ${frameSize.width} ${frameSize.height}`} aria-hidden="true" preserveAspectRatio="none">
        {showRejected &&
          item.rejectedCandidates.map((candidate, index) => (
            <rect
              key={index}
              className="box-other"
              x={candidate.box.left}
              y={candidate.box.top}
              width={candidate.box.right - candidate.box.left}
              height={candidate.box.bottom - candidate.box.top}
            />
          ))}
        {maskPath && maskBounds ? (
          <path className="mask" transform={`translate(${maskBounds.left} ${maskBounds.top})`} d={maskPath} />
        ) : (
          <rect className="box-chosen" x={box.left} y={box.top} width={box.right - box.left} height={box.bottom - box.top} />
        )}
      </svg>
    </figure>
  );
}
