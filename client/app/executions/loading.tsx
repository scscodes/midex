export default function Loading() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="h-8 bg-zinc-800 rounded w-48 animate-pulse" />
        <div className="h-10 bg-zinc-800 rounded w-32 animate-pulse" />
      </div>

      <div className="space-y-2">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="bg-zinc-900 border border-zinc-800 rounded p-4 animate-pulse">
            <div className="flex items-center justify-between">
              <div className="space-y-2 flex-1">
                <div className="h-5 bg-zinc-800 rounded w-1/3" />
                <div className="h-4 bg-zinc-800 rounded w-1/4" />
              </div>
              <div className="h-6 bg-zinc-800 rounded w-20" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
