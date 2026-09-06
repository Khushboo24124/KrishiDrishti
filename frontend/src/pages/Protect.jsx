import { useRef, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { rememberPrediction } from "../api/localStore";
import { ErrorState, Loader } from "../components/States";
import PredictionResult from "../components/PredictionResult";

const MAX_BYTES = 8 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

export default function Protect() {
  const { farmer } = useAuth();
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const inputRef = useRef(null);

  function handleFile(f) {
    setError(null);
    setResult(null);
    if (!f) return;
    if (!ACCEPTED.includes(f.type)) {
      setError("Please choose a JPEG, PNG, or WebP image.");
      return;
    }
    if (f.size > MAX_BYTES) {
      setError("Image is larger than 8MB. Please choose a smaller photo.");
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!file) {
      setError("Please select or capture a photo of the affected leaf/crop first.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await api.analyzeDisease({ file, farmerId: farmer?.farmerId });
      setResult(res);
      if (res.predictionId) {
        rememberPrediction(res.predictionId, {
          type: "disease",
          headline: res.disease || "no result",
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
    <div className="max-w-xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-leaf-800">🛡️ Protect — Disease Detection</h1>
        <p className="text-sm text-soil-500">
          Upload a clear photo of a single leaf. Blurry or unclear photos will
          be flagged and you'll be asked for a better one — never guessed at.
        </p>
      </div>

      <form className="card space-y-4" onSubmit={handleSubmit}>
        <div
          className="border-2 border-dashed border-leaf-200 rounded-xl p-6 text-center cursor-pointer hover:border-leaf-400 transition-colors"
          onClick={() => inputRef.current?.click()}
        >
          {preview ? (
            <img
              src={preview}
              alt="Selected crop"
              className="max-h-64 mx-auto rounded-lg object-contain"
            />
          ) : (
            <div className="text-soil-400 text-sm space-y-1">
              <div className="text-3xl">📷</div>
              <p>Tap to choose or capture a photo</p>
              <p className="text-xs">JPEG / PNG / WebP · up to 8MB</p>
            </div>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
        </div>

        <div className="flex justify-end gap-2">
          {preview && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setFile(null);
                setPreview(null);
                setResult(null);
              }}
            >
              Clear
            </button>
          )}
          <button className="btn-primary" type="submit" disabled={loading}>
            {loading ? "Analyzing..." : "Analyze photo"}
          </button>
        </div>
      </form>

      {loading && <Loader label="Calling the disease model..." />}
      <ErrorState error={error} onRetry={() => setError(null)} />
      <PredictionResult result={result} />
    </div>
  );
}
