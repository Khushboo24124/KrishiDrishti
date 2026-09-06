import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getKnownPredictions } from "../api/localStore";

const TILES = [
  {
    to: "/grow",
    emoji: "🌱",
    title: "Grow",
    desc: "Get a crop recommendation from your soil and environment data.",
  },
  {
    to: "/protect",
    emoji: "🛡️",
    title: "Protect",
    desc: "Upload a crop photo to check for disease.",
  },
  {
    to: "/sell",
    emoji: "💰",
    title: "Sell",
    desc: "Check weather and market prices before you sell.",
  },
];

export default function Dashboard() {
  const { farmer } = useAuth();
  const recent = getKnownPredictions().slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="card bg-leaf-600 text-white border-none">
        <h1 className="text-xl font-bold">
          Welcome back{farmer?.language ? "" : ""} 👋
        </h1>
        <p className="text-leaf-50 text-sm mt-1">
          Farmer ID:{" "}
          <span className="font-mono">{farmer?.farmerId}</span> — keep this
          safe, it's how you sign back in.
        </p>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        {TILES.map((t) => (
          <Link key={t.to} to={t.to} className="card hover:shadow-md transition-shadow">
            <div className="text-3xl mb-2">{t.emoji}</div>
            <h2 className="font-semibold text-soil-900">{t.title}</h2>
            <p className="text-sm text-soil-500 mt-1">{t.desc}</p>
          </Link>
        ))}
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Recent activity</h3>
          <Link to="/history" className="text-xs text-leaf-700 underline">
            View all
          </Link>
        </div>
        {recent.length === 0 ? (
          <p className="text-sm text-soil-400">
            No predictions yet. Try Grow or Protect to get started.
          </p>
        ) : (
          <ul className="divide-y divide-soil-100">
            {recent.map((p) => (
              <li key={p.predictionId} className="py-2 flex items-center justify-between text-sm">
                <span>
                  {p.type === "disease" ? "🛡️ Disease check" : "🌱 Crop recommendation"} —{" "}
                  {p.headline || "prediction"}
                </span>
                <Link
                  to={`/advisory/${p.predictionId}`}
                  className="text-leaf-700 underline text-xs"
                >
                  View status
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
