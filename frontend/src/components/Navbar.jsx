import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const linkClass = ({ isActive }) =>
  `px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
    isActive ? "bg-leaf-600 text-white" : "text-soil-700 hover:bg-leaf-100"
  }`;

export default function Navbar() {
  const { farmer, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="bg-white border-b border-leaf-100 sticky top-0 z-20">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🌾</span>
          <span className="font-bold text-lg text-leaf-800">AgriSense AI</span>
        </div>

        <nav className="hidden md:flex items-center gap-1 flex-wrap">
          {farmer && (
            <>
              <NavLink to="/dashboard" className={linkClass}>
                Dashboard
              </NavLink>
              <NavLink to="/grow" className={linkClass}>
                Grow
              </NavLink>
              <NavLink to="/protect" className={linkClass}>
                Protect
              </NavLink>
              <NavLink to="/sell" className={linkClass}>
                Sell
              </NavLink>
              <NavLink to="/history" className={linkClass}>
                History
              </NavLink>
            </>
          )}
          <NavLink to="/review" className={linkClass}>
            Review Dashboard
          </NavLink>
        </nav>

        <div className="flex items-center gap-2">
          {farmer ? (
            <>
              <span className="hidden sm:inline text-xs text-soil-500">
                Farmer: {farmer.farmerId.slice(0, 8)}…
              </span>
              <button
                className="btn-secondary !px-3 !py-1.5 text-xs"
                onClick={() => {
                  logout();
                  navigate("/login");
                }}
              >
                Sign out
              </button>
            </>
          ) : (
            <NavLink to="/login" className="btn-primary !px-3 !py-1.5 text-xs">
              Farmer sign in
            </NavLink>
          )}
        </div>
      </div>

      {/* mobile nav */}
      {farmer && (
        <nav className="md:hidden flex overflow-x-auto gap-1 px-4 pb-2">
          <NavLink to="/dashboard" className={linkClass}>Dashboard</NavLink>
          <NavLink to="/grow" className={linkClass}>Grow</NavLink>
          <NavLink to="/protect" className={linkClass}>Protect</NavLink>
          <NavLink to="/sell" className={linkClass}>Sell</NavLink>
          <NavLink to="/history" className={linkClass}>History</NavLink>
          <NavLink to="/review" className={linkClass}>Review</NavLink>
        </nav>
      )}
    </header>
  );
}
