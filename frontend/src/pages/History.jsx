import { Link } from "react-router-dom";
import { getKnownPredictions } from "../api/localStore";
import { EmptyState } from "../components/States";

export default function History() {
  const items = getKnownPredictions();

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-bold text-leaf-800">History</h1>
        <p className="text-sm text-soil-500">
          Predictions made from this device. Stored locally in your browser —
          the source of truth is always the backend's <code>/advisory/:id</code>.
        </p>
      </div>

      {items.length === 0 ? (
        <EmptyState title="No history yet" subtitle="Try Grow or Protect first." />
      ) : (
        <ul className="space-y-2">
          {items.map((p) => (
            <li key={p.predictionId} className="card flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">
                  {p.type === "disease" ? "🛡️ Disease check" : "🌱 Crop recommendation"}
                </p>
                <p className="text-xs text-soil-500">{p.headline}</p>
                <p className="text-[11px] text-soil-400">
                  {new Date(p.savedAt).toLocaleString()}
                </p>
              </div>
              <Link
                to={`/advisory/${p.predictionId}`}
                className="btn-secondary text-xs"
              >
                View status
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
