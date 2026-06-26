'use client';

// app/not-found.tsx — Custom 404 page matching auth page DNA.

import Link from 'next/link';
import { FileQuestion, ArrowLeft, Home, Search } from 'lucide-react';
import Button from '@/components/admin/ui/Button';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gray-100">
      <div className="max-w-md w-full bg-white rounded-card border border-gray-200 p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center">
            <FileQuestion className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-text-primary">Page not found</h1>
            <p className="text-xs text-text-secondary">
              The page you&apos;re looking for doesn&apos;t exist or has been moved.
            </p>
          </div>
        </div>

        <div className="space-y-3 mb-6">
          <Link
            href="/scholarships"
            className="flex items-center gap-3 rounded-btn border border-gray-200 bg-gray-50 p-3 hover:border-primary/40 transition-colors"
          >
            <Search className="w-4 h-4 text-primary shrink-0" />
            <div>
              <p className="text-sm font-medium text-text-primary">Browse scholarships</p>
              <p className="text-[11px] text-text-secondary">Search and discover matches</p>
            </div>
          </Link>
          <Link
            href="/"
            className="flex items-center gap-3 rounded-btn border border-gray-200 bg-gray-50 p-3 hover:border-primary/40 transition-colors"
          >
            <Home className="w-4 h-4 text-primary shrink-0" />
            <div>
              <p className="text-sm font-medium text-text-primary">Go home</p>
              <p className="text-[11px] text-text-secondary">Back to the homepage</p>
            </div>
          </Link>
        </div>

        <Link
          href="/scholarships"
          className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to scholarships
        </Link>
      </div>
    </div>
  );
}
