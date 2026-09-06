import { Link } from "react-router-dom";
import StatusBadge from "./StatusBadge";

// Shared result renderer for both crop recommendation and disease analysis
// responses (they share one contract shape - API_CONTRACT.md Part 2).
export default function PredictionResult({ result }) {
  if (!result) return null;
  const {
    predictionId,
    recommendedCrop,
    disease,
    crop,
    confidence,
    modelVersion,
    routingStatus,
    reason,
    message,
    evidence,
  } = result;

  const headline = recommendedCrop
    ? `Recommended crop: ${recommendedCrop}`
    : disease
    ? `${disease}${crop ? ` (on ${crop})` : ""}`
    : "No definitive result yet";

  return (
    <div className="card space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <h3 className="text-lg font-semibold text-soil-900">{headline}</h3>
        <StatusBadge status={routingStatus} confidence={confidence} />
      </div>

      <p className="text-sm text-soil-600">{message}</p>

      {routingStatus === "ADDITIONAL_INPUT_REQUIRED" && evidence?.guidance && (
        <ul className="list-disc list-inside text-sm text-sky-800 bg-sky-50 border border-sky-200 rounded-lg p-3 space-y-1">
          {evidence.guidance.map((g, i) => (
            <li key={i}>{g}</li>
          ))}
        </ul>
      )}

      {routingStatus === "REVIEW_REQUIRED" && (
        <div className="text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-3">
          This result is not confirmed yet. It has been sent to the community
          review queue.{" "}
          {predictionId && (
            <Link
              to={`/advisory/${predictionId}`}
              className="font-semibold underline"
            >
              Track its status →
            </Link>
          )}
        </div>
      )}

      {routingStatus === "EXPERT_REQUIRED" && (
        <div className="text-sm bg-rose-50 border border-rose-200 text-rose-800 rounded-lg p-3">
          This case needs an agricultural officer's input. No treatment or
          action recommendation is provided until then.
        </div>
      )}

      {evidence?.top_3 && (
        <details className="text-xs text-soil-500">
          <summary className="cursor-pointer select-none font-medium text-soil-600">
            Model evidence
          </summary>
          <ul className="mt-2 space-y-1">
            {evidence.top_3.map((t, i) => (
              <li key={i} className="flex justify-between">
                <span>{t.crop || t.label}</span>
                <span>{(t.probability * 100).toFixed(1)}%</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {evidence?.quality && (
        <details className="text-xs text-soil-500">
          <summary className="cursor-pointer select-none font-medium text-soil-600">
            Image quality evidence
          </summary>
          <ul className="mt-2 space-y-1">
            {Object.entries(evidence.quality).map(([k, v]) => (
              <li key={k} className="flex justify-between">
                <span>{k}</span>
                <span>{typeof v === "number" ? v.toFixed(2) : String(v)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="flex items-center justify-between text-[11px] text-soil-400 pt-2 border-t border-soil-100">
        <span>Model: {modelVersion || "n/a"}</span>
        <span>Reason: {reason || "n/a"}</span>
      </div>
      {predictionId && (
        <div className="text-[11px] text-soil-400 break-all">
          Prediction ID: {predictionId}
        </div>
      )}
    </div>
  );
}
