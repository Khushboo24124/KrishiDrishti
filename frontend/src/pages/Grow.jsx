import { useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { rememberPrediction } from "../api/localStore";
import { ErrorState, Loader } from "../components/States";
import PredictionResult from "../components/PredictionResult";

const FIELDS = [
  { key: "nitrogen", label: "Nitrogen (N)", placeholder: "e.g. 83" },
  { key: "phosphorus", label: "Phosphorus (P)", placeholder: "e.g. 122" },
  { key: "potassium", label: "Potassium (K)", placeholder: "e.g. 150" },
  { key: "temperature", label: "Temperature (°C)", placeholder: "e.g. 21.1" },
  { key: "humidity", label: "Humidity (%)", placeholder: "e.g. 54.1" },
  { key: "ph", label: "Soil pH", placeholder: "e.g. 7.8" },
  { key: "rainfall", label: "Rainfall (mm)", placeholder: "e.g. 39.0" },
];

export default function Grow() {
  const { farmer } = useAuth();
  const [values, setValues] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  function update(key, v) {
    setValues((prev) => ({ ...prev, [key]: v }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setResult(null);

    const missing = FIELDS.filter((f) => values[f.key] === undefined || values[f.key] === "");
    if (missing.length) {
      setError(`Missing: ${missing.map((f) => f.label).join(", ")}`);
      return;
    }

    setLoading(true);
    try {
      const payload = {
        nitrogen: Number(values.nitrogen),
        phosphorus: Number(values.phosphorus),
        potassium: Number(values.potassium),
        temperature: Number(values.temperature),
        humidity: Number(values.humidity),
        ph: Number(values.ph),
        rainfall: Number(values.rainfall),
        farmerId: farmer?.farmerId,
      };
      const res = await api.recommendCrop(payload);
      setResult(res);
      if (res.predictionId && res.routingStatus === "REVIEW_REQUIRED") {
        rememberPrediction(res.predictionId, {
          type: "crop",
          headline: res.recommendedCrop || "no result",
          routingStatus: res.routingStatus,
        });
      }
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-leaf-800">🌱 Grow — Crop Recommendation</h1>
        <p className="text-sm text-soil-500">
          Enter your soil and environment readings for a model-backed recommendation.
        </p>
      </div>

      <form className="card grid sm:grid-cols-2 gap-4" onSubmit={handleSubmit}>
        {FIELDS.map((f) => (
          <div key={f.key}>
            <label className="label">{f.label}</label>
            <input
              className="input"
              type="number"
              step="any"
              placeholder={f.placeholder}
              value={values[f.key] ?? ""}
              onChange={(e) => update(f.key, e.target.value)}
            />
          </div>
        ))}
        <div className="sm:col-span-2 flex items-center justify-between pt-2">
          <p className="text-[11px] text-soil-400">
            Location is optional and currently unused by the crop model.
          </p>
          <button className="btn-primary" type="submit" disabled={loading}>
            {loading ? "Analyzing..." : "Get recommendation"}
          </button>
        </div>
      </form>

      {loading && <Loader label="Calling the crop model..." />}
      <ErrorState error={error} onRetry={() => setError(null)} />
      <PredictionResult result={result} />
    </div>
  );
}