'use client';

import Sidebar from './Sidebar';
import RightPanel from './RightPanel';

export default function AppLayout({ children, showRightPanel = true }: { children: React.ReactNode; showRightPanel?: boolean }) {
  const gridCols = showRightPanel
    ? 'md:grid-cols-[80px_1fr] xl:grid-cols-[80px_minmax(0,1fr)_240px]'
    : 'md:grid-cols-[80px_1fr]';

  return (
    <div className="h-screen bg-gray-100 flex flex-col">
      <div className={`flex-1 grid grid-cols-1 ${gridCols} max-w-[1600px] mx-auto w-full overflow-hidden`}>
        <Sidebar />
        <main id="main-content" className="h-screen overflow-y-auto">
          {children}
        </main>
        {showRightPanel && <RightPanel />}
      </div>
    </div>
  );
}
