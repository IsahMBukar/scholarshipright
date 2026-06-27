'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import LandingShell from '@/components/LandingShell';

export default function NotFound() {
  return (
    <LandingShell>
      <div className="min-h-[70vh] flex items-center justify-center px-4 sm:px-6 pt-20">
        <motion.div
          className="text-center max-w-[520px]"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="text-[80px] sm:text-[100px] font-black text-[#f5b942]/20 leading-none mb-2 select-none">
            404
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight mb-3">
            Page not found
          </h1>
          <p className="text-sm sm:text-base text-gray-600 leading-relaxed mb-8">
            The page you&apos;re looking for doesn&apos;t exist or has been moved. Maybe it&apos;s time to find your scholarship match instead?
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/signup"
              className="sr-border-beam relative text-sm font-bold text-[#1a1a1a] bg-[#f5b942] rounded-full px-7 py-3.5 hover:bg-[#d4972e] hover:text-white transition w-full sm:w-auto text-center"
            >
              Find your matches →
            </Link>
            <Link
              href="/"
              className="text-sm font-medium text-[#1a1a1a] px-6 py-3.5 rounded-full border border-[#f0ebe0] hover:border-[#f5b942] transition w-full sm:w-auto text-center"
            >
              Back to home
            </Link>
          </div>
        </motion.div>
      </div>
    </LandingShell>
  );
}
