export default function Loading() {
  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="h-8 bg-zinc-800 rounded w-48 mb-6 animate-pulse" />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="p-4 rounded-lg border border-gray-700 bg-gray-900 animate-pulse">
                <div className="flex items-start justify-between">
                  <div className="space-y-2 flex-1">
                    <div className="h-6 bg-zinc-800 rounded w-1/3" />
                    <div className="h-4 bg-zinc-800 rounded w-2/3" />
                  </div>
                  <div className="h-6 bg-zinc-800 rounded w-20" />
                </div>
                <div className="mt-3 flex items-center gap-4">
                  <div className="h-4 bg-zinc-800 rounded w-16" />
                  <div className="h-4 bg-zinc-800 rounded w-24" />
                </div>
              </div>
            ))}
          </div>

          <div className="lg:col-span-1">
            <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 animate-pulse">
              <div className="h-6 bg-zinc-800 rounded w-32 mb-4" />
              <div className="h-4 bg-zinc-800 rounded w-full mb-4" />
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="bg-gray-800 rounded p-3 space-y-2">
                    <div className="h-4 bg-zinc-700 rounded w-24" />
                    <div className="h-3 bg-zinc-700 rounded w-full" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
