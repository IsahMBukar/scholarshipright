'use client';

import Sidebar from './Sidebar';
import RightPanel from './RightPanel';

export default function AppLayout({ children, showRightPanel = true }: { children: React.ReactNode; showRightPanel?: boolean }) {
  return (
    <div className="h-screen bg-gray-100 flex flex-col">
      {/* Mobile header */}
      <header className="md:hidden flex items-center justify-between h-16 px-4 bg-white border-b border-gray-200 sticky top-0 z-50">
        <button className="w-10 h-10 flex items-center justify-center">
          <span className="material-symbols-outlined text-[24px]">menu</span>
        </button>
        <span className="text-[18px] font-extrabold text-primary">ScholarshipRight</span>
        <div className="w-10" />
      </header>

      <div className="flex-1 grid md:grid-cols-[80px_1fr] xl:grid-cols-[80px_minmax(0,1fr)_240px] max-w-[1600px] mx-auto w-full overflow-hidden">
        <Sidebar />
        <main className="h-screen overflow-y-auto">
          {children}
        </main>
        {showRightPanel && <RightPanel />}
      </div>
    </div>
  );
}
