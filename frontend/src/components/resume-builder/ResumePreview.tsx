'use client';

import { createContext, useContext } from 'react';
import type {
  Resume,
  ResumeEducation,
  ResumeExperience,
  ResumeResearchProject,
  ResumeCertification,
  ResumePublication,
  ResumeLanguage,
  ResumeAward,
  ResumeReference,
} from '@/services/api';
import type { ResumeStyle } from './StyleTab';
import { DEFAULT_STYLE } from './StyleTab';

// ── Theme configurations ─────────────────────────────────────────────

interface ThemeConfig {
  /** Container padding */
  padding: string;
  /** Section spacing (gap between sections) */
  sectionGap: number;
  /** Entry spacing within a section */
  entryGap: number;
  /** Name alignment */
  nameAlign: 'left' | 'center';
  /** Section title: text-transform */
  titleTransform: 'uppercase' | 'none';
  /** Section title: font-size */
  titleSize: number;
  /** Section title: alignment */
  titleAlign: 'left' | 'center';
  /** Section title decoration: 'underline' | 'bar' | 'double' | 'none' */
  titleDecoration: 'underline' | 'bar' | 'double' | 'none';
  /** Bullet character */
  bulletChar: string;
  /** Base font size multiplier (1 = normal, 0.9 = compact) */
  fontScale: number;
  /** Entry title font size */
  entryTitleSize: number;
  /** Body font size */
  bodySize: number;
  /** Show footer */
  showFooter: boolean;
}

const THEMES: Record<string, ThemeConfig> = {
  classic: {
    padding: '28px 32px',
    sectionGap: 14,
    entryGap: 8,
    nameAlign: 'left',
    titleTransform: 'uppercase',
    titleSize: 13,
    titleAlign: 'left',
    titleDecoration: 'underline',
    bulletChar: '|',
    fontScale: 1,
    entryTitleSize: 11,
    bodySize: 10,
    showFooter: true,
  },
  modern: {
    padding: '32px 36px',
    sectionGap: 18,
    entryGap: 10,
    nameAlign: 'left',
    titleTransform: 'none',
    titleSize: 12,
    titleAlign: 'left',
    titleDecoration: 'bar',
    bulletChar: '•',
    fontScale: 1,
    entryTitleSize: 11,
    bodySize: 10,
    showFooter: false,
  },
  academic: {
    padding: '28px 32px',
    sectionGap: 12,
    entryGap: 7,
    nameAlign: 'center',
    titleTransform: 'uppercase',
    titleSize: 12,
    titleAlign: 'center',
    titleDecoration: 'double',
    bulletChar: '–',
    fontScale: 0.95,
    entryTitleSize: 10.5,
    bodySize: 9.5,
    showFooter: true,
  },
  compact: {
    padding: '20px 24px',
    sectionGap: 8,
    entryGap: 5,
    nameAlign: 'left',
    titleTransform: 'uppercase',
    titleSize: 11,
    titleAlign: 'left',
    titleDecoration: 'underline',
    bulletChar: '•',
    fontScale: 0.88,
    entryTitleSize: 10,
    bodySize: 9,
    showFooter: false,
  },
};

function getTheme(id: string): ThemeConfig {
  return THEMES[id] || THEMES.classic;
}

// ── Style context ────────────────────────────────────────────────────

const StyleCtx = createContext<ResumeStyle>(DEFAULT_STYLE);
const ThemeCtx = createContext<ThemeConfig>(THEMES.classic);

function useStyle() {
  return useContext(StyleCtx);
}
function useTheme() {
  return useContext(ThemeCtx);
}

interface Props {
  resume: Partial<Resume>;
  activeSection?: string | null;
  onSectionClick?: (section: string) => void;
  mode?: 'resume' | 'cv';
  style?: ResumeStyle;
}

export default function ResumePreview({
  resume,
  activeSection,
  onSectionClick,
  mode = 'cv',
  style = DEFAULT_STYLE,
}: Props) {
  const concise = mode === 'resume';
  const primary = style.primaryColor;
  const headingFont = style.fontHeading;
  const bodyFont = style.fontBody;
  const theme = getTheme(style.theme);

  return (
    <StyleCtx.Provider value={style}>
      <ThemeCtx.Provider value={theme}>
        <div
          className="bg-white shadow-lg overflow-y-auto"
          style={{
            width: '100%',
            maxWidth: 595,
            minHeight: 842,
            fontFamily: bodyFont,
            fontSize: Math.round(10 * theme.fontScale),
            lineHeight: 1.4,
            color: '#1e1e1e',
            padding: theme.padding,
            position: 'relative',
          }}
        >
          {/* ── Name & Contact ──────────────────────────────────────── */}
          <Section region="header" activeSection={activeSection} onSectionClick={onSectionClick}>
            <h1
              style={{
                fontSize: Math.round(22 * theme.fontScale),
                fontWeight: 700,
                fontFamily: headingFont,
                color: '#1e1e1e',
                margin: 0,
                lineHeight: 1.2,
                textAlign: theme.nameAlign,
              }}
            >
              {resume.full_name || 'Your Name'}
            </h1>

            {[resume.email, resume.phone, resume.location].filter(Boolean).length > 0 && (
              <p style={{ fontSize: Math.round(10 * theme.fontScale), color: '#646464', margin: '4px 0 0', textAlign: theme.nameAlign }}>
                {[resume.email, resume.phone, resume.location].filter(Boolean).join('  |  ')}
              </p>
            )}

            {(resume.linkedin_url || resume.portfolio_url) && (
              <p style={{ fontSize: Math.round(9 * theme.fontScale), color: primary, margin: '2px 0 0', textAlign: theme.nameAlign }}>
                {[
                  resume.linkedin_url && `LinkedIn: ${resume.linkedin_url}`,
                  resume.portfolio_url && `Portfolio: ${resume.portfolio_url}`,
                ]
                  .filter(Boolean)
                  .join('  |  ')}
              </p>
            )}
          </Section>

          <div style={{ height: theme.sectionGap }} />

        {resume.summary && (
          <Section region="summary" activeSection={activeSection} onSectionClick={onSectionClick}>
            <SectionTitle>Professional Summary</SectionTitle>
            <BodyText>{resume.summary}</BodyText>
          </Section>
        )}

        {resume.education && resume.education.length > 0 && (
          <Section region="education" activeSection={activeSection} onSectionClick={onSectionClick}>
            <SectionTitle>Education</SectionTitle>
            {resume.education.map((edu, i) => (
              <EducationEntry key={i} edu={edu} concise={concise} />
            ))}
          </Section>
        )}

        {resume.experience && resume.experience.length > 0 && (
          <Section region="experience" activeSection={activeSection} onSectionClick={onSectionClick}>
            <SectionTitle>Work Experience</SectionTitle>
            {resume.experience.map((exp, i) => (
              <ExperienceEntry key={i} exp={exp} concise={concise} />
            ))}
          </Section>
        )}

        {resume.research_projects && resume.research_projects.length > 0 && (
          <Section region="research" activeSection={activeSection} onSectionClick={onSectionClick}>
            <SectionTitle>Research &amp; Projects</SectionTitle>
            {resume.research_projects.map((p, i) => (
              <ResearchEntry key={i} project={p} />
            ))}
          </Section>
        )}

        {resume.skills && resume.skills.length > 0 && (
          <Section region="skills" activeSection={activeSection} onSectionClick={onSectionClick}>
            <SectionTitle>Skills</SectionTitle>
            <p style={{ fontSize: Math.round(theme.bodySize * theme.fontScale), color: '#1e1e1e', margin: 0 }}>
              {resume.skills.join(' | ')}
            </p>
          </Section>
        )}

        {resume.languages && resume.languages.length > 0 && (
          <Section region="languages" activeSection={activeSection} onSectionClick={onSectionClick}>
            <SectionTitle>Languages</SectionTitle>
            {resume.languages.map((lang, i) => (
              <LanguageEntry key={i} lang={lang} />
            ))}
          </Section>
        )}

        {!concise && resume.certifications && resume.certifications.length > 0 && (
          <Section region="certifications" activeSection={activeSection} onSectionClick={onSectionClick}>
            <SectionTitle>Certifications</SectionTitle>
            {resume.certifications.map((c, i) => (
              <CertEntry key={i} cert={c} />
            ))}
          </Section>
        )}

        {!concise && resume.publications && resume.publications.length > 0 && (
          <Section region="publications" activeSection={activeSection} onSectionClick={onSectionClick}>
            <SectionTitle>Publications</SectionTitle>
            {resume.publications.map((p, i) => (
              <PublicationEntry key={i} pub={p} />
            ))}
          </Section>
        )}

        {!concise && resume.awards && resume.awards.length > 0 && (
          <Section region="awards" activeSection={activeSection} onSectionClick={onSectionClick}>
            <SectionTitle>Awards</SectionTitle>
            {resume.awards.map((a, i) => (
              <AwardEntry key={i} award={a} />
            ))}
          </Section>
        )}

        {!concise && resume.ref_list && resume.ref_list.length > 0 && (
          <Section region="references" activeSection={activeSection} onSectionClick={onSectionClick}>
            <SectionTitle>References</SectionTitle>
            {resume.ref_list.map((r, i) => (
              <RefEntry key={i} reference={r} />
            ))}
          </Section>
        )}

        {theme.showFooter && (
          <div
            style={{
              position: 'absolute',
              bottom: 12,
              left: 0,
              right: 0,
              textAlign: 'center',
              fontSize: 8,
              fontStyle: 'italic',
              color: '#646464',
            }}
          >
            Generated by ScholarshipRight | {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </div>
        )}
        </div>
      </ThemeCtx.Provider>
    </StyleCtx.Provider>
  );
}

// ── Clickable section wrapper ────────────────────────────────────────

function Section({
  region,
  activeSection,
  onSectionClick,
  children,
}: {
  region: string;
  activeSection?: string | null;
  onSectionClick?: (section: string) => void;
  children: React.ReactNode;
}) {
  const { primaryColor } = useStyle();
  const isActive = activeSection === region;
  return (
    <div
      onClick={() => onSectionClick?.(region)}
      style={{
        cursor: onSectionClick ? 'pointer' : undefined,
        borderRadius: 4,
        transition: 'background-color 150ms',
        backgroundColor: isActive ? `${primaryColor}14` : 'transparent',
        borderLeft: isActive ? `3px solid ${primaryColor}` : '3px solid transparent',
        padding: '4px 6px',
        marginBottom: 2,
      }}
    >
      {children}
    </div>
  );
}

// ── Reusable primitives ──────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  const { primaryColor, fontHeading } = useStyle();
  const { titleSize, titleTransform, titleAlign, titleDecoration, fontScale } = useTheme();

  const decoration = (() => {
    switch (titleDecoration) {
      case 'underline':
        return (
          <div style={{ height: 2, backgroundColor: primaryColor, marginTop: 2, marginBottom: 6 }} />
        );
      case 'bar':
        return null; // Bar is handled via border-left on the title itself
      case 'double':
        return (
          <div style={{ marginTop: 2, marginBottom: 6 }}>
            <div style={{ height: 1.5, backgroundColor: primaryColor }} />
            <div style={{ height: 0.5, backgroundColor: primaryColor, marginTop: 1.5 }} />
          </div>
        );
      case 'none':
      default:
        return <div style={{ height: 4 }} />;
    }
  })();

  return (
    <>
      <h2
        style={{
          fontSize: Math.round(titleSize * fontScale),
          fontWeight: 700,
          fontFamily: fontHeading,
          color: '#1e1e1e',
          textTransform: titleTransform,
          margin: '0 0 2px',
          letterSpacing: '0.02em',
          textAlign: titleAlign,
          borderLeft: titleDecoration === 'bar' ? `3px solid ${primaryColor}` : undefined,
          paddingLeft: titleDecoration === 'bar' ? 8 : undefined,
        }}
      >
        {children}
      </h2>
      {decoration}
    </>
  );
}

function BodyText({ children, bold = false }: { children: string; bold?: boolean }) {
  const { bodySize, fontScale } = useTheme();
  return (
    <p
      style={{
        fontSize: Math.round(bodySize * fontScale),
        fontWeight: bold ? 700 : 400,
        color: '#1e1e1e',
        margin: '0 0 4px',
        lineHeight: 1.5,
      }}
    >
      {children}
    </p>
  );
}

function LabelValue({ label, value }: { label: string; value: string }) {
  const { bodySize, fontScale } = useTheme();
  if (!value) return null;
  return (
    <p style={{ fontSize: Math.round(bodySize * fontScale), margin: '0 0 3px' }}>
      <span style={{ fontWeight: 700, color: '#646464' }}>{label}: </span>
      <span style={{ color: '#1e1e1e' }}>{value}</span>
    </p>
  );
}

function Bullet({ text }: { text: string }) {
  const { primaryColor } = useStyle();
  const { bulletChar, bodySize, fontScale } = useTheme();
  if (!text) return null;
  return (
    <p style={{ fontSize: Math.round(bodySize * fontScale), color: '#1e1e1e', margin: '0 0 2px', paddingLeft: 8 }}>
      <span style={{ color: primaryColor, marginRight: 4 }}>{bulletChar}</span>
      {text}
    </p>
  );
}

// ── Section entries ──────────────────────────────────────────────────

function EducationEntry({ edu, concise }: { edu: ResumeEducation; concise: boolean }) {
  const degreeField = [edu.degree, edu.field].filter(Boolean).join(' ');
  const dates = [edu.start_date, edu.end_date].filter(Boolean).join(' - ');

  return (
    <div style={{ marginBottom: 8 }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: '#1e1e1e', margin: 0 }}>
        {degreeField || edu.institution || 'Education'}
      </p>
      {degreeField && edu.institution && (
        <p style={{ fontSize: 10, color: '#646464', margin: '1px 0 0' }}>{edu.institution}</p>
      )}
      {dates && (
        <p style={{ fontSize: 9, fontStyle: 'italic', color: '#646464', margin: '1px 0 0' }}>
          {dates}
        </p>
      )}
      {!concise && edu.gpa && <LabelValue label="GPA" value={edu.gpa} />}
      {!concise && edu.description && <BodyText>{edu.description}</BodyText>}
    </div>
  );
}

function ExperienceEntry({ exp, concise }: { exp: ResumeExperience; concise: boolean }) {
  const position = exp.position || exp.title || '';
  const rightText = [exp.company, exp.location].filter(Boolean).join(', ');
  const dates = [exp.start_date, exp.end_date].filter(Boolean).join(' - ');

  return (
    <div style={{ marginBottom: 8 }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: '#1e1e1e', margin: 0 }}>{position}</p>
      {(rightText || dates) && (
        <p style={{ fontSize: 10, color: '#646464', margin: '1px 0 0' }}>
          {[rightText, dates].filter(Boolean).join('  |  ')}
        </p>
      )}
      {!concise && exp.description && <BodyText>{exp.description}</BodyText>}
      {(exp as any).achievements?.map?.((ach: string, i: number) => (
        <Bullet key={i} text={ach} />
      ))}
    </div>
  );
}

function ResearchEntry({ project }: { project: ResumeResearchProject }) {
  const ptype = (project.type || 'project').charAt(0).toUpperCase() + (project.type || 'project').slice(1);
  const details = [project.role, project.organization, [project.start_date, project.end_date].filter(Boolean).join(' - ')]
    .filter(Boolean)
    .join(' | ');

  return (
    <div style={{ marginBottom: 8 }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: '#1e1e1e', margin: 0 }}>
        [{ptype}] {project.title || 'Untitled'}
      </p>
      {details && <p style={{ fontSize: 10, color: '#646464', margin: '1px 0 0' }}>{details}</p>}
      {project.technologies && (
        <p style={{ fontSize: 9, fontStyle: 'italic', color: '#646464', margin: '1px 0 0' }}>
          Tech: {project.technologies}
        </p>
      )}
      {project.description && <BodyText>{project.description}</BodyText>}
      {project.outcomes && <LabelValue label="Outcomes" value={project.outcomes} />}
      {project.url && <LabelValue label="URL" value={project.url} />}
    </div>
  );
}

function LanguageEntry({ lang }: { lang: ResumeLanguage }) {
  const name = typeof lang === 'string' ? lang : lang.language || '';
  const prof = typeof lang === 'string' ? '' : lang.proficiency || '';
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 3 }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: '#1e1e1e', minWidth: 100 }}>{name}</span>
      <span style={{ fontSize: 10, color: '#646464' }}>{prof}</span>
    </div>
  );
}

function CertEntry({ cert }: { cert: ResumeCertification }) {
  const details = [cert.issuer, cert.date].filter(Boolean).join(' | ');
  return (
    <div style={{ marginBottom: 6 }}>
      <p style={{ fontSize: 10, fontWeight: 700, color: '#1e1e1e', margin: 0 }}>{cert.name}</p>
      {details && <p style={{ fontSize: 9, color: '#646464', margin: '1px 0 0' }}>{details}</p>}
    </div>
  );
}

function PublicationEntry({ pub }: { pub: ResumePublication }) {
  const details = [pub.journal, pub.date].filter(Boolean).join(' | ');
  return (
    <div style={{ marginBottom: 6 }}>
      <Bullet text={pub.title || ''} />
      {details && (
        <p style={{ fontSize: 9, fontStyle: 'italic', color: '#646464', margin: '0 0 1px', paddingLeft: 16 }}>
          {details}
        </p>
      )}
      {pub.doi && (
        <p style={{ fontSize: 8, color: '#646464', margin: 0, paddingLeft: 16 }}>
          DOI: {pub.doi}
        </p>
      )}
    </div>
  );
}

function AwardEntry({ award }: { award: ResumeAward }) {
  const details = [award.issuer, award.date].filter(Boolean).join(' | ');
  return (
    <div style={{ marginBottom: 6 }}>
      <p style={{ fontSize: 10, fontWeight: 700, color: '#1e1e1e', margin: 0 }}>
        {award.name || award.title}
      </p>
      {details && <p style={{ fontSize: 9, color: '#646464', margin: '1px 0 0' }}>{details}</p>}
    </div>
  );
}

function RefEntry({ reference }: { reference: ResumeReference }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <p style={{ fontSize: 10, fontWeight: 700, color: '#1e1e1e', margin: 0 }}>{reference.name}</p>
      {reference.position && <p style={{ fontSize: 9, color: '#646464', margin: '1px 0 0' }}>{reference.position}</p>}
      {reference.contact && <p style={{ fontSize: 9, color: '#646464', margin: '1px 0 0' }}>{reference.contact}</p>}
    </div>
  );
}
