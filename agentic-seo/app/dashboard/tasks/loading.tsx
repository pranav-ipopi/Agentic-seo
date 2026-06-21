export default function TasksLoading() {
  return (
    <div className="h-full overflow-y-auto animate-pulse">
      <div className="max-w-4xl mx-auto px-6 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="space-y-2">
            <div className="w-16 h-6 rounded bg-gray-200 dark:bg-gray-800" />
            <div className="w-48 h-4 rounded bg-gray-200 dark:bg-gray-800" />
          </div>
          <div className="w-64 h-9 rounded-lg bg-gray-200 dark:bg-gray-800" />
        </div>
        {/* Task cards */}
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex items-start gap-3"
            >
              <div className="w-4 h-4 rounded-full bg-gray-200 dark:bg-gray-800 mt-0.5 flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-48 h-4 rounded bg-gray-200 dark:bg-gray-800" />
                  <div className="w-16 h-5 rounded-full bg-gray-200 dark:bg-gray-800 ml-auto" />
                </div>
                <div className="w-32 h-3 rounded bg-gray-200 dark:bg-gray-800" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
