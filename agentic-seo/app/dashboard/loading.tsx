export default function DashboardLoading() {
  return (
    <div className="h-full w-full bg-gray-50 dark:bg-gray-950 flex flex-col animate-pulse">
      <div className="flex-shrink-0 h-16 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/50 px-6 flex items-center gap-3">
        <div className="w-5 h-5 rounded bg-gray-200 dark:bg-gray-800" />
        <div className="w-40 h-5 rounded bg-gray-200 dark:bg-gray-800" />
      </div>
      <div className="flex-1 p-6 space-y-4">
        <div className="w-full h-20 rounded-xl bg-gray-200 dark:bg-gray-800/60" />
        <div className="w-full h-20 rounded-xl bg-gray-200 dark:bg-gray-800/60" />
        <div className="w-3/4 h-20 rounded-xl bg-gray-200 dark:bg-gray-800/60" />
      </div>
    </div>
  )
}
