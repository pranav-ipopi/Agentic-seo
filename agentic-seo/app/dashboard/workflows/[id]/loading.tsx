export default function WorkflowDetailLoading() {
  return (
    <div className="h-full w-full bg-gray-50 dark:bg-gray-950 flex flex-col animate-pulse">
      {/* Header bar */}
      <div className="flex-shrink-0 h-16 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/50 px-6 flex items-center gap-4">
        <div className="w-8 h-8 rounded-lg bg-gray-200 dark:bg-gray-800" />
        <div className="w-48 h-5 rounded bg-gray-200 dark:bg-gray-800" />
      </div>
      {/* Body */}
      <div className="flex-1 overflow-y-auto p-6 max-w-3xl mx-auto w-full space-y-6">
        {/* Template description card */}
        <div className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-6 space-y-3">
          <div className="w-32 h-4 rounded bg-gray-200 dark:bg-gray-800" />
          <div className="w-full h-4 rounded bg-gray-200 dark:bg-gray-800" />
          <div className="w-4/5 h-4 rounded bg-gray-200 dark:bg-gray-800" />
        </div>
        {/* Config card */}
        <div className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-6 space-y-4">
          <div className="w-40 h-5 rounded bg-gray-200 dark:bg-gray-800" />
          <div className="w-full h-10 rounded-lg bg-gray-200 dark:bg-gray-800" />
          <div className="w-full h-10 rounded-lg bg-gray-200 dark:bg-gray-800" />
          <div className="w-full h-10 rounded-lg bg-gray-200 dark:bg-gray-800" />
          <div className="w-full h-10 rounded-lg bg-gray-200 dark:bg-gray-800" />
          <div className="w-36 h-10 rounded-lg bg-indigo-500/20 ml-auto" />
        </div>
      </div>
    </div>
  )
}
