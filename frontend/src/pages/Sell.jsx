import { useState } from "react";
import { api } from "../api/client";
import { ErrorState, Loader, EmptyState } from "../components/States";

export default function Sell() {
  const [lat, setLat] = useState("19.07");
  const [lng, setLng] = useState("72.87");
  const [weather, setWeather] = useState(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState(null);

  const [commodity, setCommodity] = useState("wheat");
  const [market, setMarket] = useState("");
  const [state, setState] = useState("");
  const [prices, setPrices] = useState(null);
  const [pricesLoading, setPricesLoading] = useState(false);
  const [pricesError, setPricesError] = useState(null);

  function detectLocation() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      setLat(pos.coords.latitude.toFixed(4));
      setLng(pos.coords.longitude.toFixed(4));
    });
  }

  async function fetchWeather(e) {
    e.preventDefault();
    setWeatherError(null);
    setWeather(null);
    setWeatherLoading(true);
    try {
      const res = await api.getWeather(lat, lng);
      setWeather(res);
    } catch (err) {
      setWeatherError(err);
    } finally {
      setWeatherLoading(false);
    }
  }

  async function fetchPrices(e) {
    e.preventDefault();
    setPricesError(null);
    setPrices(null);
    if (!commodity.trim()) {
      setPricesError("Commodity is required.");
      return;
    }
    setPricesLoading(true);
    try {
      const res = await api.getMarketPrices({ commodity, market, state });
      setPrices(res);
    } catch (err) {
      setPricesError(err);
    } finally {
      setPricesLoading(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-xl font-bold text-leaf-800">💰 Sell — Weather & Market</h1>
        <p className="text-sm text-soil-500">
          Reported information only — never a guaranteed price or a promise
          you'll get the best deal.
        </p>
      </div>

      {/* Weather */}
      <section className="card space-y-4">
        <h2 className="font-semibold">Weather forecast</h2>
        <form className="flex flex-wrap gap-2 items-end" onSubmit={fetchWeather}>
          <div>
            <label className="label">Latitude</label>
            <input className="input w-32" value={lat} onChange={(e) => setLat(e.target.value)} />
          </div>
          <div>
            <label className="label">Longitude</label>
            <input className="input w-32" value={lng} onChange={(e) => setLng(e.target.value)} />
          </div>
          <button type="button" className="btn-secondary" onClick={detectLocation}>
            Use my location
          </button>
          <button className="btn-primary" type="submit" disabled={weatherLoading}>
            {weatherLoading ? "Loading..." : "Get forecast"}
          </button>
        </form>

        {weatherLoading && <Loader label="Fetching weather..." />}
        <ErrorState error={weatherError} onRetry={() => setWeatherError(null)} />

        {weather && !weather.unavailable && (
          <div className="grid sm:grid-cols-3 gap-3 text-sm">
            <div className="rounded-lg bg-sky-50 border border-sky-100 p-3">
              <p className="text-soil-400 text-xs">Current temp</p>
              <p className="text-lg font-semibold">
                {weather.current?.temperature_2m}°C
              </p>
            </div>
            <div className="rounded-lg bg-sky-50 border border-sky-100 p-3">
              <p className="text-soil-400 text-xs">Precipitation</p>
              <p className="text-lg font-semibold">
                {weather.current?.precipitation} mm
              </p>
            </div>
            <div className="rounded-lg bg-sky-50 border border-sky-100 p-3">
              <p className="text-soil-400 text-xs">Wind speed</p>
              <p className="text-lg font-semibold">
                {weather.current?.wind_speed_10m} km/h
              </p>
            </div>
            <div className="sm:col-span-3 text-[11px] text-soil-400 pt-1 border-t border-soil-100">
              Source: {weather.source} · Retrieved: {new Date(weather.retrievedAt).toLocaleString()} ·
              Timezone: {weather.location?.timezone}
            </div>
          </div>
        )}
        {weather?.unavailable && (
          <EmptyState title="Weather unavailable" subtitle="The provider did not return data — shown honestly, not guessed." />
        )}
      </section>

      {/* Market */}
      <section className="card space-y-4">
        <h2 className="font-semibold">Market prices</h2>
        <form className="flex flex-wrap gap-2 items-end" onSubmit={fetchPrices}>
          <div>
            <label className="label">Commodity *</label>
            <input className="input w-36" value={commodity} onChange={(e) => setCommodity(e.target.value)} />
          </div>
          <div>
            <label className="label">Market</label>
            <input className="input w-36" value={market} onChange={(e) => setMarket(e.target.value)} placeholder="optional" />
          </div>
          <div>
            <label className="label">State</label>
            <input className="input w-36" value={state} onChange={(e) => setState(e.target.value)} placeholder="optional" />
          </div>
          <button className="btn-primary" type="submit" disabled={pricesLoading}>
            {pricesLoading ? "Loading..." : "Check prices"}
          </button>
        </form>

        {pricesLoading && <Loader label="Fetching market prices..." />}
        <ErrorState error={pricesError} onRetry={() => setPricesError(null)} />

        {pricesError?.code === "dependency_unavailable" && (
          <div className="text-xs text-soil-400 bg-soil-50 rounded-lg p-3 border border-soil-100">
            No live Agmarknet source is configured yet on the backend — this
            is the intended "clear unavailable state," not a bug (see
            API_CONTRACT.md).
          </div>
        )}

        {prices && !prices.unavailable && prices.prices?.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-soil-400 border-b border-soil-100">
                  <th className="py-2">Market</th>
                  <th>State</th>
                  <th>Min</th>
                  <th>Max</th>
                  <th>Modal</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {prices.prices.map((p, i) => (
                  <tr key={i} className="border-b border-soil-50">
                    <td className="py-2">{p.market}</td>
                    <td>{p.state}</td>
                    <td>₹{p.minPrice}</td>
                    <td>₹{p.maxPrice}</td>
                    <td>₹{p.modalPrice}</td>
                    <td>{p.priceDate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[11px] text-soil-400 mt-2">
              Source: {prices.source} · Retrieved: {new Date(prices.retrievedAt).toLocaleString()}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
