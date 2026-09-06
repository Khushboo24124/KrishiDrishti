// Renders routingStatus honestly per Phase 3 §7 state machine. This is the
// single place that decides badge color/label so no screen can accidentally
// present an uncertain result as confirmed.

const STATUS_META = {
  HIGH_CONFIDENCE: {
    label: "Likely result",
    className: "bg-leaf-100 text-leaf-800 border-leaf-300",
    dot: "bg-leaf-500",
  },
  REVIEW_REQUIRED: {
    label: "Under verification",
    className: "bg-amber-100 text-amber-800 border-amber-300",
    dot: "bg-amber-500",
  },
  ADDITIONAL_INPUT_REQUIRED: {
    label: "More input needed",
    className: "bg-sky-100 text-sky-800 border-sky-300",
    dot: "bg-sky-500",
  },
  EXPERT_REQUIRED: {
    label: "Expert review required",
    className: "bg-rose-100 text-rose-800 border-rose-300",
    dot: "bg-rose-500",
  },
};

export default function StatusBadge({ status, confidence }) {
  const meta = STATUS_META[status] || {
    label: status || "Unknown",
    className: "bg-soil-100 text-soil-700 border-soil-300",
    dot: "bg-soil-400",
  };

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${meta.className}`}
    >
      <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
      {meta.label}
      {typeof confidence === "number" && (
        <span className="opacity-70 font-normal">· {(confidence * 100).toFixed(1)}%</span>
      )}
    </span>
  );
}
