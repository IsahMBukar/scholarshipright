'use client';

export default function RightPanel() {
  return (
    <aside className="hidden xl:flex flex-col w-[240px] h-full border-l border-gray-200 bg-white p-5 overflow-y-auto">
      {/* Profile Summary */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-text-inverse font-bold text-[16px]">
            T
          </div>
          <div>
            <p className="text-[14px] font-semibold text-text-primary">Test User</p>
            <p className="text-[12px] text-text-secondary">Profile 60% complete</p>
          </div>
        </div>
        <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div className="h-full bg-primary rounded-full" style={{ width: '60%' }} />
        </div>
      </div>

      {/* Quick Stats */}
      <div className="space-y-3 mb-6">
        <h4 className="text-[12px] font-bold uppercase tracking-wider text-text-secondary">Quick Stats</h4>
        {[
          { label: 'Matched', value: '18', icon: 'school' },
          { label: 'Saved', value: '0', icon: 'bookmark' },
          { label: 'Applied', value: '0', icon: 'send' },
        ].map((stat) => (
          <div key={stat.label} className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] text-text-secondary">{stat.icon}</span>
              <span className="text-[13px] text-text-secondary">{stat.label}</span>
            </div>
            <span className="text-[14px] font-bold text-text-primary">{stat.value}</span>
          </div>
        ))}
      </div>

      {/* Tips */}
      <div className="bg-primary-light rounded-card p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="material-symbols-outlined text-primary text-[20px]">lightbulb</span>
          <h4 className="text-[13px] font-bold text-text-primary">Tip</h4>
        </div>
        <p className="text-[12px] text-text-secondary leading-relaxed">
          Complete your profile to get better scholarship matches. Add your research interests and target countries.
        </p>
      </div>

      {/* Upcoming Deadlines */}
      <div className="mt-6">
        <h4 className="text-[12px] font-bold uppercase tracking-wider text-text-secondary mb-3">Upcoming Deadlines</h4>
        <div className="space-y-2">
          {[
            { name: 'Chevening', days: 12 },
            { name: 'DAAD', days: 28 },
            { name: 'MEXT', days: 45 },
          ].map((item) => (
            <div key={item.name} className="flex items-center justify-between py-1.5">
              <span className="text-[13px] text-text-primary">{item.name}</span>
              <span className={`text-[12px] font-medium ${item.days <= 14 ? 'text-red-500' : 'text-text-secondary'}`}>
                {item.days}d left
              </span>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
