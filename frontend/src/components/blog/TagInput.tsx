'use client';

import { useState } from 'react';

export function TagInput({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [input, setInput] = useState('');
  const addTag = () => {
    const t = input.trim().toLowerCase();
    if (t && !tags.includes(t)) onChange([...tags, t]);
    setInput('');
  };
  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {tags.map((tag) => (
          <span key={tag} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-[#fdfbf7] text-[#d4972e] border border-[#f0ebe0]">
            #{tag}
            <button onClick={() => onChange(tags.filter((t) => t !== tag))} className="ml-0.5 text-gray-400 hover:text-red-500 transition" type="button">×</button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addTag();
            }
          }}
          placeholder="Add a tag..."
          className="flex-1 px-3 py-2 rounded-lg border border-[#f0ebe0] bg-white text-sm text-[#1a1a1a] placeholder:text-gray-400 focus:outline-none focus:border-[#f5b942] transition"
        />
        <button onClick={addTag} type="button" className="px-3 py-2 rounded-lg text-sm font-medium bg-[#fdfbf7] text-[#d4972e] border border-[#f0ebe0] hover:bg-[#f5b942]/10 transition">Add</button>
      </div>
    </div>
  );
}
