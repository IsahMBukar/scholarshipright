'use client';

import { useState, useEffect, useCallback } from 'react';

interface EligibilityWarningModalProps {
  isOpen: boolean;
  reason: string;
  scholarshipUrl: string;
  onClose: () => void;
  /** Called when user confirms they want to proceed anyway */
  onConfirm: () => void;
  /** Seconds to wait before the Continue button becomes clickable */
  delaySeconds?: number;
}

export default function EligibilityWarningModal({
  isOpen,
  reason,
  scholarshipUrl,
  onClose,
  onConfirm,
  delaySeconds = 3,
}: EligibilityWarningModalProps) {
  const [countdown, setCountdown] = useState(delaySeconds);
  const canContinue = countdown <= 0;

  // Reset countdown when modal opens
  useEffect(() => {
    if (!isOpen) return;
    setCountdown(delaySeconds);
  }, [isOpen, delaySeconds]);

  // Countdown timer
  useEffect(() => {
    if (!isOpen || countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isOpen, countdown]);

  const handleConfirm = useCallback(() => {
    if (!canContinue) return;
    onConfirm();
    // Open the scholarship URL in a new tab
    window.open(scholarshipUrl, '_blank', 'noopener,noreferrer');
    onClose();
  }, [canContinue, onConfirm, scholarshipUrl, onClose]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-xl max-w-md w-full p-6 animate-fade-in">
        {/* Warning icon */}
        <div className="flex justify-center mb-4">
          <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center">
            <span className="material-symbols-outlined text-amber-600 text-[32px]">warning</span>
          </div>
        </div>

        {/* Title */}
        <h2 className="text-[18px] font-bold text-text-primary text-center mb-2">
          You may not be eligible
        </h2>

        {/* Reason */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4">
          <p className="text-[13px] text-amber-800 leading-relaxed">
            {reason}
          </p>
        </div>

        <p className="text-[13px] text-text-secondary text-center mb-6">
          You can still proceed, but the scholarship provider may reject your application
          if you do not meet their eligibility criteria.
        </p>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 px-4 border border-gray-200 text-[13px] font-semibold text-text-secondary rounded-btn hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canContinue}
            className={`flex-1 py-2.5 px-4 text-[13px] font-semibold rounded-btn transition-all ${
              canContinue
                ? 'bg-amber-500 text-white hover:bg-amber-600'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            {canContinue ? 'Continue Anyway' : `Wait ${countdown}s...`}
          </button>
        </div>
      </div>
    </div>
  );
}
