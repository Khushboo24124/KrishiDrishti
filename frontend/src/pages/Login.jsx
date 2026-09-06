import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ErrorState, Loader } from "../components/States";

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "hi", label: "हिन्दी (Hindi)" },
  { code: "mr", label: "मराठी (Marathi)" },
  { code: "bn", label: "বাংলা (Bengali)" },
];

export default function Login() {
  const { register, loginWithId } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState("register"); // "register" | "existing"
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // register fields
  const [phone, setPhone] = useState("");
  const [language, setLanguage] = useState("en");
  const [useLocation, setUseLocation] = useState(false);
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");

  // existing farmer id
  const [farmerId, setFarmerId] = useState("");

  function detectLocation() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      setLat(pos.coords.latitude.toFixed(4));
      setLng(pos.coords.longitude.toFixed(4));
      setUseLocation(true);
    });
  }

  async function handleRegister(e) {
    e.preventDefault();
    setError(null);
    if (!phone.trim()) {
      setError("Phone number is required.");
      return;
    }
    setLoading(true);
    try {
      await register({
        language,
        phone: phone.trim(),
        latitude: useLocation ? lat : undefined,
        longitude: useLocation ? lng : undefined,
      });
      navigate("/dashboard");
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleExisting(e) {
    e.preventDefault();
    setError(null);
    if (!farmerId.trim()) {
      setError("Enter your Farmer ID.");
      return;
    }
    setLoading(true);
    try {
      await loginWithId(farmerId);
      navigate("/dashboard");
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto mt-8 space-y-4">
      <div className="text-center space-y-1">
        <h1 className="text-2xl font-bold text-leaf-800">Welcome to AgriSense AI</h1>
        <p className="text-sm text-soil-500">
          Grow · Protect · Sell — data-driven advisory for your farm.
        </p>
      </div>

      <div className="card">
        <div className="flex rounded-lg bg-soil-50 p-1 mb-4 text-sm font-medium">
          <button
            className={`flex-1 rounded-md py-1.5 ${
              mode === "register" ? "bg-white shadow text-leaf-700" : "text-soil-500"
            }`}
            onClick={() => setMode("register")}
          >
            New farmer
          </button>
          <button
            className={`flex-1 rounded-md py-1.5 ${
              mode === "existing" ? "bg-white shadow text-leaf-700" : "text-soil-500"
            }`}
            onClick={() => setMode("existing")}
          >
            I already have an ID
          </button>
        </div>

        {mode === "register" ? (
          <form className="space-y-3" onSubmit={handleRegister}>
            <div>
              <label className="label">Phone number</label>
              <input
                className="input"
                placeholder="e.g. 9876543210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              <p className="text-[11px] text-soil-400 mt-1">
                Stored only as a hash — never in plain text (Phase 3 §9).
              </p>
            </div>
            <div>
              <label className="label">Preferred language</label>
              <select
                className="input"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center justify-between">
              <label className="text-sm text-soil-600 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={useLocation}
                  onChange={(e) => setUseLocation(e.target.checked)}
                />
                Share farm location (optional)
              </label>
              <button
                type="button"
                className="text-xs text-leaf-700 underline"
                onClick={detectLocation}
              >
                Use current location
              </button>
            </div>
            {useLocation && (
              <div className="grid grid-cols-2 gap-2">
                <input
                  className="input"
                  placeholder="Latitude"
                  value={lat}
                  onChange={(e) => setLat(e.target.value)}
                />
                <input
                  className="input"
                  placeholder="Longitude"
                  value={lng}
                  onChange={(e) => setLng(e.target.value)}
                />
              </div>
            )}
            <ErrorState error={error} />
            <button className="btn-primary w-full" disabled={loading} type="submit">
              {loading ? "Creating profile..." : "Create profile & continue"}
            </button>
          </form>
        ) : (
          <form className="space-y-3" onSubmit={handleExisting}>
            <div>
              <label className="label">Farmer ID</label>
              <input
                className="input"
                placeholder="paste your farmer ID"
                value={farmerId}
                onChange={(e) => setFarmerId(e.target.value)}
              />
            </div>
            <ErrorState error={error} />
            <button className="btn-primary w-full" disabled={loading} type="submit">
              {loading ? "Checking..." : "Continue"}
            </button>
          </form>
        )}
        {loading && <Loader label="Talking to backend..." />}
      </div>

      <p className="text-center text-xs text-soil-400">
        Reviewer or agricultural officer?{" "}
        <a href="/review" className="underline text-leaf-700">
          Go to the review dashboard
        </a>{" "}
        — no farmer sign-in needed.
      </p>
    </div>
  );
}
