export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="h-8 bg-zinc-800 rounded w-48 animate-pulse" />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 animate-pulse">
            <div className="h-4 bg-zinc-800 rounded w-24 mb-3" />
            <div className="h-8 bg-zinc-800 rounded w-16" />
          </div>
        ))}
      </div>

      <div>
        <div className="h-6 bg-zinc-800 rounded w-32 mb-3 animate-pulse" />
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-zinc-900 border border-zinc-800 rounded p-4 animate-pulse">
              <div className="h-4 bg-zinc-800 rounded w-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
