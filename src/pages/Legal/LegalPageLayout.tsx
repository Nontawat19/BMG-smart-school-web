import React, { useState } from "react";
import { Link } from "react-router-dom";
import { FaPrint, FaChevronLeft, FaBars, FaTimes } from "react-icons/fa";

export interface LegalSection {
  id: string;
  title: string;
  content: React.ReactNode;
}

interface LegalPageLayoutProps {
  docTitle: string;
  docSubtitle: string;
  effectiveDate: React.ReactNode;
  version: string;
  sections: LegalSection[];
  relatedLinkTo: string;
  relatedLinkLabel: string;
}

// เอกสารทางกฎหมาย (Privacy Policy / Terms of Use) ต้องเปิดดูได้โดยไม่ต้อง login — จึงไม่ใช้ MainLayout
// (ซึ่งบังคับ sidebar ของผู้ใช้ที่ authenticate แล้ว) และไม่ห่อด้วย ProtectedRoute/PublicRoute ใน App.tsx
const LegalPageLayout: React.FC<LegalPageLayoutProps> = ({
  docTitle,
  docSubtitle,
  effectiveDate,
  version,
  sections,
  relatedLinkTo,
  relatedLinkLabel,
}) => {
  const [isTocOpen, setIsTocOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 dark:bg-[#15161a] dark:text-white">
      {/* Top bar */}
      <div className="sticky top-0 z-30 border-b border-gray-200 bg-white/90 backdrop-blur-md dark:border-gray-800 dark:bg-[#15161a]/90 print:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-bold text-gray-700 transition hover:bg-gray-100 dark:border-gray-700 dark:bg-[#1e1f21] dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <FaChevronLeft size={11} />
            กลับสู่หน้าหลัก
          </Link>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700 transition hover:bg-indigo-100 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300 dark:hover:bg-indigo-500/20"
            >
              <FaPrint size={11} />
              พิมพ์เอกสาร
            </button>
            <button
              type="button"
              onClick={() => setIsTocOpen((v) => !v)}
              className="inline-flex items-center justify-center rounded-xl border border-gray-200 bg-gray-50 p-2.5 text-gray-700 transition hover:bg-gray-100 dark:border-gray-700 dark:bg-[#1e1f21] dark:text-gray-300 dark:hover:bg-gray-800 lg:hidden"
              aria-label="สารบัญ"
            >
              {isTocOpen ? <FaTimes size={14} /> : <FaBars size={14} />}
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-12">
        {/* Document header */}
        <header className="mb-8 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-[#242529] sm:p-8">
          <p className="text-xs font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
            {docSubtitle}
          </p>
          <h1 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">{docTitle}</h1>
          <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
            <div className="flex gap-1.5">
              <dt className="font-bold">มีผลบังคับใช้ตั้งแต่:</dt>
              <dd>{effectiveDate}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="font-bold">เวอร์ชันเอกสาร:</dt>
              <dd>{version}</dd>
            </div>
          </dl>
        </header>

        <div className="lg:flex lg:gap-8">
          {/* TOC — sticky sidebar on desktop, collapsible on mobile */}
          <nav
            className={`mb-6 shrink-0 lg:mb-0 lg:block lg:w-64 ${isTocOpen ? "block" : "hidden"} print:hidden`}
            aria-label="สารบัญเอกสาร"
          >
            <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#242529] lg:sticky lg:top-24">
              <p className="mb-3 text-xs font-black uppercase tracking-widest text-gray-400 dark:text-gray-500">
                สารบัญ
              </p>
              <ol className="space-y-1">
                {sections.map((section, index) => (
                  <li key={section.id}>
                    <a
                      href={`#${section.id}`}
                      onClick={() => setIsTocOpen(false)}
                      className="block rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-100 hover:text-indigo-600 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-indigo-400"
                    >
                      {index + 1}. {section.title}
                    </a>
                  </li>
                ))}
              </ol>
            </div>
          </nav>

          {/* Document body */}
          <main className="min-w-0 flex-1 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-[#242529] sm:p-8 lg:p-10">
            <div className="legal-doc space-y-10">
              {sections.map((section, index) => (
                <section key={section.id} id={section.id} className="scroll-mt-24">
                  <h2 className="mb-3 text-lg font-black tracking-tight sm:text-xl">
                    <span className="mr-2 text-indigo-500">{index + 1}.</span>
                    {section.title}
                  </h2>
                  <div className="prose prose-sm max-w-none text-[13.5px] leading-7 text-gray-700 dark:text-gray-300 sm:text-sm">
                    {section.content}
                  </div>
                </section>
              ))}
            </div>

            <div className="mt-12 border-t border-gray-100 pt-6 text-center dark:border-gray-800 print:hidden">
              <Link
                to={relatedLinkTo}
                className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2 text-xs font-bold text-gray-700 transition hover:bg-gray-100 dark:border-gray-700 dark:bg-[#1e1f21] dark:text-gray-300 dark:hover:bg-gray-800"
              >
                {relatedLinkLabel}
              </Link>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
};

export default LegalPageLayout;
