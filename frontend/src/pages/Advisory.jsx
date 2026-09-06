import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { ErrorState, Loader } from "../components/States";
import StatusBadge from "../components/StatusBadge";

export default function Advisory() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [inputId, setInputId] = useState(id || "");

  const load = useCallback(async (pid) => {
    if (!pid) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.getAdvisory(pid);
      setData(res);
    } catch (err) {
      setError(err);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (id) load(id);
    else setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return (
    <div className="max-w-xl mx-auto space-y-5">
      <h1 className="text-xl font-bold text-leaf-800">Advisory status</h1>

      {!id && (
        <form
          className="card flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            navigate(`/advisory/${inputId.trim()}`);
          }}
        >
          <input
            className="input"
            placeholder="Paste a prediction ID"
            value={inputId}
            onChange={(e) => setInputId(e.target.value)}
          />
          <button className="btn-primary shrink-0" type="submit">
            Look up
          </button>
        </form>
      )}

      {loading && <Loader label="Fetching advisory..." />}
      <ErrorState error={error} onRetry={() => load(id)} />

      {data && (
        <div className="card space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="font-semibold">
              {data.prediction?.recommendedCrop ||
                data.prediction?.disease ||
                data.type}
            </h2>
            <StatusBadge status={data.routingStatus} confidence={data.confidence} />
          </div>
          <p className="text-sm text-soil-600">{data.message}</p>

          {data.review && (
            <div className="text-sm bg-soil-50 rounded-lg p-3 border border-soil-100">
              <p className="font-medium mb-1">Community review</p>
              <p>Reviews so far: {data.review.reviewCount}</p>
              <p>Consensus: {data.review.consensus}</p>
            </div>
          )}

          <div className="text-[11px] text-soil-400 pt-2 border-t border-soil-100 flex justify-between flex-wrap gap-1">
            <span>Model: {data.modelVersion}</span>
            <span>Created: {data.createdAt && new Date(data.createdAt).toLocaleString()}</span>
          </div>
          <button className="btn-secondary text-xs" onClick={() => load(id)}>
            Refresh status
          </button>
        </div>
      )}

      {!loading && !error && !data && id && (
        <p className="text-sm text-soil-400">No advisory found for this ID yet.</p>
      )}
    </div>
  );
}
