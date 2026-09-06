import { useEffect, useState } from "react";
import { api } from "../api/client";
import {
  getKnownPredictions,
  getReviewerId,
  setReviewerId,
  rememberPrediction,
} from "../api/localStore";
import { ErrorState, Loader, EmptyState } from "../components/States";
import StatusBadge from "../components/StatusBadge";

// KNOWN GAP (documented in API_CONTRACT.md / README): the backend has no
// "list all pending reviews" endpoint - only create/submit/status-by-id.
// This dashboard works around that by tracking predictionIds this browser
// has seen (localStorage) and by letting a reviewer paste in any
// predictionId directly. A real deployment should add
// GET /api/v1/review/pending and swap the local list for that.

function ReviewerIdBar({ reviewerId, setReviewerIdState }) {
  return (
    <div className="card flex flex-wrap items-center gap-2">
      <label className="label !mb-0">Reviewer ID</label>
      <input
        className="input max-w-xs"
        placeholder="e.g. your name or officer ID"
        value={reviewerId}
        onChange={(e) => {
          setReviewerIdState(e.target.value);
          setReviewerId(e.target.value);
        }}
      />
      <p className="text-[11px] text-soil-400">
        Hashed by the backend before storage — never kept raw (Phase 3 §9).
      </p>
    </div>
  );
}

function ReviewCard({ item, reviewerId, onUpdated }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getReviewStatus(item.predictionId);
      setStatus(res);
    } catch (err) {
      if (err.code === "not_found") {
        // No review case yet - try to open one (backend requires
        // routingStatus REVIEW_REQUIRED at creation time).
        try {
          const created = await api.createReview(item.predictionId);
          setStatus(created);
        } catch (createErr) {
          setError(createErr);
        }
      } else {
        setError(err);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.predictionId]);

  async function submit(decision) {
    if (!reviewerId.trim()) {
      setError({ message: "Enter a Reviewer ID above before submitting a decision." });
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.submitReview({
        predictionId: item.predictionId,
        reviewerId: reviewerId.trim(),
        decision,
      });
      setStatus(res);
      onUpdated?.();
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <p className="font-medium text-sm">
            {item.type === "disease" ? "🛡️ Disease check" : "🌱 Crop recommendation"}
          </p>
          <p className="text-xs text-soil-500">{item.headline}</p>
          <p className="text-[11px] text-soil-400 break-all">{item.predictionId}</p>
        </div>
        {status && (
          <StatusBadge status={status.finalState} confidence={undefined} />
        )}
      </div>

      {loading && <Loader label="Loading review case..." />}
      <ErrorState error={error} onRetry={refresh} />

      {status && (
        <>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-lg bg-leaf-50 py-2">
              <p className="font-semibold text-leaf-700">{status.agreeCount ?? 0}</p>
              <p className="text-soil-400">Agree</p>
            </div>
            <div className="rounded-lg bg-rose-50 py-2">
              <p className="font-semibold text-rose-700">{status.disagreeCount ?? 0}</p>
              <p className="text-soil-400">Disagree</p>
            </div>
            <div className="rounded-lg bg-soil-50 py-2">
              <p className="font-semibold text-soil-700">{status.unsureCount ?? 0}</p>
              <p className="text-soil-400">Unsure</p>
            </div>
          </div>

          {status.finalAdvisory && (
            <p className="text-xs text-soil-600 bg-soil-50 rounded-lg p-2">
              {status.finalAdvisory}
            </p>
          )}

          <div className="flex gap-2">
            <button
              className="btn-primary flex-1 !bg-leaf-600"
              disabled={submitting}
              onClick={() => submit("AGREE")}
            >
              👍 Agree
            </button>
            <button
              className="btn-primary flex-1 !bg-rose-600 hover:!bg-rose-700"
              disabled={submitting}
              onClick={() => submit("DISAGREE")}
            >
              👎 Disagree
            </button>
            <button
              className="btn-secondary flex-1"
              disabled={submitting}
              onClick={() => submit("UNSURE")}
            >
              🤔 Unsure
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function ReviewDashboard() {
  const [reviewerId, setReviewerIdState] = useState(getReviewerId());
  const [items, setItems] = useState([]);
  const [manualId, setManualId] = useState("");
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    setItems(getKnownPredictions());
  }, [refreshTick]);

  const pending = items; // all known predictions are shown; ReviewCard fetches/derives real state

  function addManual(e) {
    e.preventDefault();
    if (!manualId.trim()) return;
    rememberPrediction(manualId.trim(), {
      type: "unknown",
      headline: "manually added",
      routingStatus: "REVIEW_REQUIRED",
    });
    setManualId("");
    setRefreshTick((t) => t + 1);
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-leaf-800">🧑‍🌾 Review Dashboard</h1>
        <p className="text-sm text-soil-500">
          Uncertain (low-confidence) results are routed here for community
          verification instead of being shown to farmers as confirmed advice.
        </p>
      </div>

      <ReviewerIdBar reviewerId={reviewerId} setReviewerIdState={setReviewerIdState} />

      <form className="card flex gap-2" onSubmit={addManual}>
        <input
          className="input"
          placeholder="Add a prediction ID to review (from another device/session)"
          value={manualId}
          onChange={(e) => setManualId(e.target.value)}
        />
        <button className="btn-secondary shrink-0" type="submit">
          Add
        </button>
      </form>

      {pending.length === 0 ? (
        <EmptyState
          title="No cases tracked yet"
          subtitle="Cases appear here automatically once a farmer's crop or disease check comes back REVIEW_REQUIRED on this device, or add one manually above."
        />
      ) : (
        <div className="space-y-4">
          {pending.map((item) => (
            <ReviewCard
              key={item.predictionId}
              item={item}
              reviewerId={reviewerId}
              onUpdated={() => setRefreshTick((t) => t + 1)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
