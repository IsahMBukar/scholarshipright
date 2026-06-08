'use client';

import Sidebar from './Sidebar';
import RightPanel from './RightPanel';

export default function AppLayout({ children, showRightPanel = true }: { children: React.ReactNode; showRightPanel?: boolean }) {
  return (
    <div className="h-screen bg-gray-100 flex flex-col">
      <div className="flex-1 grid grid-cols-1 md:grid-cols-[80px_1fr] xl:grid-cols-[80px_minmax(0,1fr)_240px] max-w-[1600px] mx-auto w-full overflow-hidden">
        <Sidebar />
        <main className="h-screen overflow-y-auto">
          {children}
        </main>
        {showRightPanel && <RightPanel />}
      </div>
    </div>
  );
}
