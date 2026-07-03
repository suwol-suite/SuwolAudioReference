export type StatusBadgeTone = "neutral" | "success" | "warning" | "danger" | "accent";

export function StatusBadge({ tone = "neutral", children, title }: { tone?: StatusBadgeTone; children: string; title?: string }): JSX.Element {
  return (
    <span className={`status-badge tone-${tone}`} title={title ?? children}>
      {children}
    </span>
  );
}

export function playbackBadgeTone(playable: boolean, fileMissing: boolean): StatusBadgeTone {
  if (fileMissing || !playable) {
    return "danger";
  }
  return "success";
}

export function analysisBadgeTone(hasAnalysis: boolean, isAudio: boolean): StatusBadgeTone {
  if (!isAudio) {
    return "neutral";
  }
  return hasAnalysis ? "success" : "warning";
}
