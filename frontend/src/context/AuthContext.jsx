import { createContext, useContext, useEffect, useState } from "react";
import { api } from "../api/client";
import { getFarmerSession, setFarmerSession, clearFarmerSession } from "../api/localStore";

// NOTE on "auth": the backend (Phase 2/3) has no password/JWT login — only
// POST /api/v1/farmers (create profile, phone is hashed) and GET
// /api/v1/farmers/:id. So "auth" here means: create a farmer profile once,
// remember the returned farmerId in this browser, and re-fetch/verify it on
// return visits. This is intentionally lightweight for the MVP and should be
// swapped for real OTP/password auth before production (see README).

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [farmer, setFarmer] = useState(() => getFarmerSession());
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState(null);

  // Re-validate the stored farmer still exists on the backend on first load.
  useEffect(() => {
    if (!farmer?.farmerId) return;
    setChecking(true);
    api
      .getFarmer(farmer.farmerId)
      .then((fresh) => {
        const merged = { ...farmer, ...fresh };
        setFarmer(merged);
        setFarmerSession(merged);
      })
      .catch(() => {
        // Backend has no record (fresh DB, wiped, etc.) — sign out locally.
        clearFarmerSession();
        setFarmer(null);
      })
      .finally(() => setChecking(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function register({ language, phone, latitude, longitude, label }) {
    setError(null);
    const location =
      latitude !== undefined && longitude !== undefined
        ? { latitude: Number(latitude), longitude: Number(longitude), label }
        : undefined;
    const created = await api.createFarmer({ language, phone, location });
    setFarmer(created);
    setFarmerSession(created);
    return created;
  }

  async function loginWithId(farmerId) {
    setError(null);
    const found = await api.getFarmer(farmerId.trim());
    setFarmer(found);
    setFarmerSession(found);
    return found;
  }

  function logout() {
    clearFarmerSession();
    setFarmer(null);
  }

  return (
    <AuthContext.Provider value={{ farmer, checking, error, register, loginWithId, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
