'use client';

import { useState, useEffect } from 'react';
import AppLayout from '@/components/AppLayout';
import { ProfileSkeleton } from '@/components/Skeletons';
import { fetchProfile, createOrUpdateProfile } from '@/services/api';
import type { Profile } from '@/services/api';

const DEGREE_OPTIONS = ['bachelor', 'master', 'phd'];
const COUNTRIES = ['Nigeria', 'Ghana', 'Kenya', 'South Africa', 'Ethiopia', 'Tanzania', 'Uganda', 'Egypt', 'Morocco', 'Senegal', 'Cameroon', 'Rwanda', 'Other'];
const TARGET_COUNTRIES = ['Germany', 'United Kingdom', 'United States', 'Canada', 'Japan', 'Australia', 'France', 'Sweden', 'Netherlands', 'Switzerland', 'South Korea', 'China', 'Turkey', 'Belgium'];
const LANGUAGES = ['English', 'French', 'Arabic', 'Portuguese', 'Swahili', 'Spanish', 'German', 'Japanese', 'Chinese', 'Korean', 'Turkish'];
const FIELDS = ['computer_science', 'engineering', 'medicine', 'business', 'law', 'natural_sciences', 'social_sciences', 'arts', 'education', 'agriculture', 'public_health', 'economics', 'mathematics', 'physics', 'chemistry', 'biology'];

const STEPS = [
  { label: 'Academic', icon: 'school' },
  { label: 'Research', icon: 'science' },
  { label: 'Targets', icon: 'flag' },
  { label: 'Languages', icon: 'translate' },
  { label: 'Review', icon: 'check_circle' },
];

export default function ProfilePage() {
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState<Partial<Profile>>({
    degree_level: '', field_of_study: '', university: '', country_of_origin: '',
    cgpa: undefined, graduation_year: undefined, research_interests: [],
    certifications: [], work_experience_years: undefined, target_degree: '',
    target_fields: [], target_countries: [], target_start_date: undefined,
    has_ielts: false, ielts_score: undefined, languages: [],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchProfile()
      .then((data) => setProfile(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const updateField = (field: string, value: any) => {
    setProfile((prev) => ({ ...prev, [field]: value }));
    setSaved(false);
  };

  const toggleArrayItem = (field: string, item: string) => {
    setProfile((prev) => {
      const arr = (prev[field as keyof Profile] as string[]) || [];
      return { ...prev, [field]: arr.includes(item) ? arr.filter((i) => i !== item) : [...arr, item] };
    });
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await createOrUpdateProfile(profile);
      setSaved(true);
    } catch (err) {
      console.error('Failed to save profile:', err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <AppLayout showRightPanel={false}>
        <ProfileSkeleton />
      </AppLayout>
    );
  }

  return (
    <AppLayout showRightPanel={false}>
      <div className="px-4 md:px-6 py-6 max-w-[800px]">
        <h1 className="text-[28px] font-bold text-text-primary mb-1">Your Profile</h1>
        <p className="text-[16px] text-text-secondary mb-6">Help us find the best scholarships for you</p>

        {/* Step indicator */}
        <div className="flex items-center justify-between mb-8 max-w-lg">
          {STEPS.map((s, i) => (
            <button key={s.label} onClick={() => setStep(i)} className={`flex flex-col items-center gap-1 transition-colors ${i === step ? 'text-primary' : i < step ? 'text-primary/60' : 'text-text-secondary'}`}>
 <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${i === step ? 'border-primary bg-primary-light/20' : i < step ? 'border-primary/40 bg-primary-light/10' : 'border-gray-200'}`}>
                <span className="material-symbols-outlined text-[18px]">{s.icon}</span>
              </div>
              <span className="text-[11px] font-medium">{s.label}</span>
            </button>
          ))}
        </div>

        {/* Step content */}
        <div className="bg-white p-6 rounded-card border border-gray-200 mb-6">
          {step === 0 && (
            <div className="space-y-5">
              <h2 className="text-[20px] font-bold text-text-primary">Academic Background</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[14px] font-semibold text-text-primary block mb-1.5">Degree Level</label>
                  <select value={profile.degree_level || ''} onChange={(e) => updateField('degree_level', e.target.value)} className="w-full p-3 bg-gray-100 border border-gray-200 rounded-chip text-text-primary focus:ring-2 focus:ring-primary">
                    <option value="">Select</option>
                    {DEGREE_OPTIONS.map((d) => <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[14px] font-semibold text-text-primary block mb-1.5">Field of Study</label>
                  <select value={profile.field_of_study || ''} onChange={(e) => updateField('field_of_study', e.target.value)} className="w-full p-3 bg-gray-100 border border-gray-200 rounded-chip text-text-primary focus:ring-2 focus:ring-primary">
                    <option value="">Select</option>
                    {FIELDS.map((f) => <option key={f} value={f}>{f.replace(/_/g, ' ')}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[14px] font-semibold text-text-primary block mb-1.5">University</label>
                  <input type="text" value={profile.university || ''} onChange={(e) => updateField('university', e.target.value)} className="w-full p-3 bg-gray-100 border border-gray-200 rounded-chip text-text-primary focus:ring-2 focus:ring-primary" placeholder="Your university" />
                </div>
                <div>
                  <label className="text-[14px] font-semibold text-text-primary block mb-1.5">Country of Origin</label>
                  <select value={profile.country_of_origin || ''} onChange={(e) => updateField('country_of_origin', e.target.value)} className="w-full p-3 bg-gray-100 border border-gray-200 rounded-chip text-text-primary focus:ring-2 focus:ring-primary">
                    <option value="">Select</option>
                    {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[14px] font-semibold text-text-primary block mb-1.5">CGPA</label>
                  <input type="number" step="0.01" min="0" max="5" value={profile.cgpa || ''} onChange={(e) => updateField('cgpa', e.target.value ? parseFloat(e.target.value) : undefined)} className="w-full p-3 bg-gray-100 border border-gray-200 rounded-chip text-text-primary focus:ring-2 focus:ring-primary" placeholder="e.g. 3.50" />
                </div>
                <div>
                  <label className="text-[14px] font-semibold text-text-primary block mb-1.5">Graduation Year</label>
                  <input type="number" min="2020" max="2030" value={profile.graduation_year || ''} onChange={(e) => updateField('graduation_year', e.target.value ? parseInt(e.target.value) : undefined)} className="w-full p-3 bg-gray-100 border border-gray-200 rounded-chip text-text-primary focus:ring-2 focus:ring-primary" placeholder="e.g. 2025" />
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5">
              <h2 className="text-[20px] font-bold text-text-primary">Research & Experience</h2>
              <div>
                <label className="text-[14px] font-semibold text-text-primary block mb-2">Research Interests</label>
                <div className="flex flex-wrap gap-2">
                  {FIELDS.map((f) => (
                    <button key={f} onClick={() => toggleArrayItem('research_interests', f)} className={`px-3 py-1.5 rounded-chip text-[13px] font-medium transition-colors ${(profile.research_interests || []).includes(f) ? 'bg-primary text-text-inverse' : 'bg-gray-100 text-text-primary hover:bg-gray-200'}`}>
                      {f.replace(/_/g, ' ')}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[14px] font-semibold text-text-primary block mb-1.5">Work Experience (years)</label>
                <input type="number" min="0" max="30" value={profile.work_experience_years || ''} onChange={(e) => updateField('work_experience_years', e.target.value ? parseInt(e.target.value) : undefined)} className="w-full p-3 bg-gray-100 border border-gray-200 rounded-chip text-text-primary focus:ring-2 focus:ring-primary" placeholder="0" />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <h2 className="text-[20px] font-bold text-text-primary">Target Preferences</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[14px] font-semibold text-text-primary block mb-1.5">Target Degree</label>
                  <select value={profile.target_degree || ''} onChange={(e) => updateField('target_degree', e.target.value)} className="w-full p-3 bg-gray-100 border border-gray-200 rounded-chip text-text-primary focus:ring-2 focus:ring-primary">
                    <option value="">Select</option>
                    <option value="master">Master&apos;s</option>
                    <option value="phd">PhD</option>
                  </select>
                </div>
                <div>
                  <label className="text-[14px] font-semibold text-text-primary block mb-1.5">Target Start Date</label>
                  <input type="date" value={profile.target_start_date || ''} onChange={(e) => updateField('target_start_date', e.target.value)} className="w-full p-3 bg-gray-100 border border-gray-200 rounded-chip text-text-primary focus:ring-2 focus:ring-primary" />
                </div>
              </div>
              <div>
                <label className="text-[14px] font-semibold text-text-primary block mb-2">Target Countries</label>
                <div className="flex flex-wrap gap-2">
                  {TARGET_COUNTRIES.map((c) => (
                    <button key={c} onClick={() => toggleArrayItem('target_countries', c)} className={`px-3 py-1.5 rounded-chip text-[13px] font-medium transition-colors ${(profile.target_countries || []).includes(c) ? 'bg-primary text-text-inverse' : 'bg-gray-100 text-text-primary hover:bg-gray-200'}`}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[14px] font-semibold text-text-primary block mb-2">Target Fields</label>
                <div className="flex flex-wrap gap-2">
                  {FIELDS.map((f) => (
                    <button key={f} onClick={() => toggleArrayItem('target_fields', f)} className={`px-3 py-1.5 rounded-chip text-[13px] font-medium transition-colors ${(profile.target_fields || []).includes(f) ? 'bg-primary text-text-inverse' : 'bg-gray-100 text-text-primary hover:bg-gray-200'}`}>
                      {f.replace(/_/g, ' ')}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <h2 className="text-[20px] font-bold text-text-primary">Languages & IELTS</h2>
              <div>
                <label className="text-[14px] font-semibold text-text-primary block mb-2">Languages You Speak</label>
                <div className="flex flex-wrap gap-2">
                  {LANGUAGES.map((l) => (
                    <button key={l} onClick={() => toggleArrayItem('languages', l)} className={`px-3 py-1.5 rounded-chip text-[13px] font-medium transition-colors ${(profile.languages || []).includes(l) ? 'bg-primary text-text-inverse' : 'bg-gray-100 text-text-primary hover:bg-gray-200'}`}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <input type="checkbox" id="has_ielts" checked={profile.has_ielts || false} onChange={(e) => updateField('has_ielts', e.target.checked)} className="w-4 h-4" />
                <label htmlFor="has_ielts" className="text-[14px] text-text-primary cursor-pointer">I have an IELTS score</label>
              </div>
              {profile.has_ielts && (
                <div>
                  <label className="text-[14px] font-semibold text-text-primary block mb-1.5">IELTS Score</label>
                  <input type="number" step="0.5" min="0" max="9" value={profile.ielts_score || ''} onChange={(e) => updateField('ielts_score', e.target.value ? parseFloat(e.target.value) : undefined)} className="w-full p-3 bg-gray-100 border border-gray-200 rounded-chip text-text-primary focus:ring-2 focus:ring-primary" placeholder="e.g. 7.0" />
                </div>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-5">
              <h2 className="text-[20px] font-bold text-text-primary">Review Your Profile</h2>
              <div className="space-y-3">
                {[
                  { label: 'Degree', value: profile.degree_level },
                  { label: 'Field', value: profile.field_of_study?.replace(/_/g, ' ') },
                  { label: 'University', value: profile.university },
                  { label: 'Country', value: profile.country_of_origin },
                  { label: 'CGPA', value: profile.cgpa },
                  { label: 'Target Degree', value: profile.target_degree },
                  { label: 'Target Countries', value: (profile.target_countries || []).join(', ') },
                  { label: 'Languages', value: (profile.languages || []).join(', ') },
                  { label: 'IELTS', value: profile.has_ielts ? profile.ielts_score : 'Not taken' },
                ].filter((item) => item.value).map((item) => (
                  <div key={item.label} className="flex items-center justify-between py-2 border-b border-gray-200 last:border-0">
                    <span className="text-[13px] text-text-secondary">{item.label}</span>
                    <span className="text-[14px] font-semibold text-text-primary">{String(item.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <button onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0} className="px-6 py-3 text-[14px] font-semibold text-text-secondary hover:text-text-primary disabled:opacity-30 transition-colors">
            ← Back
          </button>
          <div className="flex items-center gap-3">
            {saved && <span className="text-[13px] text-primary font-medium">✓ Saved</span>}
            {step < 4 ? (
              <button onClick={() => setStep(step + 1)} className="bg-primary text-text-inverse font-bold px-8 py-3 rounded-btn hover:brightness-110 transition-all">
                Next →
              </button>
            ) : (
              <button onClick={handleSave} disabled={saving} className="bg-primary text-text-inverse font-bold px-8 py-3 rounded-btn hover:brightness-110 transition-all disabled:opacity-50">
                {saving ? 'Saving...' : 'Save Profile'}
              </button>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
