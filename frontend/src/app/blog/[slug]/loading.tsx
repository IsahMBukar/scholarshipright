export default function BlogDetailLoading() {
  return (
    <div className="pt-28 sm:pt-32 pb-20 px-4">
      <div className="max-w-[720px] mx-auto animate-pulse space-y-6">
        {/* Back link + category */}
        <div className="flex items-center justify-between">
          <div className="h-4 bg-gray-100 rounded w-24" />
          <div className="h-6 bg-gray-100 rounded-full w-20" />
        </div>

        {/* Title */}
        <div className="h-10 bg-gray-100 rounded w-3/4" />

        {/* Meta row */}
        <div className="flex gap-3">
          <div className="h-4 bg-gray-100 rounded w-20" />
          <div className="h-4 bg-gray-100 rounded w-24" />
          <div className="h-4 bg-gray-100 rounded w-16" />
        </div>

        {/* Excerpt */}
        <div className="h-5 bg-gray-100 rounded w-full" />
        <div className="h-5 bg-gray-100 rounded w-5/6" />

        {/* Cover image */}
        <div className="aspect-[16/9] bg-gray-100 rounded-2xl" />

        {/* Body */}
        <div className="space-y-3">
          <div className="h-4 bg-gray-100 rounded w-full" />
          <div className="h-4 bg-gray-100 rounded w-5/6" />
          <div className="h-4 bg-gray-100 rounded w-4/6" />
          <div className="h-4 bg-gray-100 rounded w-full" />
          <div className="h-4 bg-gray-100 rounded w-3/4" />
        </div>
      </div>
    </div>
  );
}
