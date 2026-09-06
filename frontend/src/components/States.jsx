export function Loader({ label = "Loading..." }) {
  return (
    <div className="flex items-center gap-3 text-soil-500 py-6 justify-center">
      <span className="h-4 w-4 rounded-full border-2 border-leaf-400 border-t-transparent animate-spin" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  if (!error) return null;
  const message =
    typeof error === "string" ? error : error.message || "Something went wrong.";
  const details =
    error?.details && typeof error.details === "object"
      ? JSON.stringify(error.details)
      : Array.isArray(error?.details)
      ? error.details.join(", ")
      : null;

  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50 text-rose-800 px-4 py-3 text-sm">
      <p className="font-semibold">
        {error?.code ? error.code.replaceAll("_", " ") : "Error"}
      </p>
      <p>{message}</p>
      {details && <p className="mt-1 text-xs opacity-75">{details}</p>}
      {onRetry && (
        <button onClick={onRetry} className="mt-2 text-xs font-semibold underline">
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, subtitle }) {
  return (
    <div className="text-center py-10 text-soil-400">
      <p className="font-medium text-soil-600">{title}</p>
      {subtitle && <p className="text-sm mt-1">{subtitle}</p>}
    </div>
  );
}
