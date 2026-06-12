import React, { useRef, useEffect, useCallback } from 'react';

interface SearchPanelProps {
  handleSearch: (e: React.FormEvent<HTMLFormElement>) => void;
  searchId: string;
  setSearchId: (id: string) => void;
  error: string | null;
  currentTime: string;
  hideInput?: boolean;
  className?: string;
}

const SearchPanel: React.FC<SearchPanelProps> = ({
  handleSearch,
  searchId,
  setSearchId,
  error,
  currentTime,
  hideInput = false,
  className = "lg:col-span-3",
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const refocus = useCallback(() => {
    if (!hideInput) inputRef.current?.focus();
  }, [hideInput]);

  // Re-focus whenever the input loses focus (user clicks elsewhere, Swal closes, etc.)
  useEffect(() => {
    if (hideInput) return;
    const input = inputRef.current;
    if (!input) return;
    input.addEventListener('blur', refocus);
    return () => input.removeEventListener('blur', refocus);
  }, [hideInput, refocus]);

  // Also restore focus after any Swal dialog closes (Swal steals focus)
  useEffect(() => {
    if (hideInput) return;
    const observer = new MutationObserver(() => {
      const swalOpen = document.querySelector('.swal2-container');
      if (!swalOpen) refocus();
    });
    observer.observe(document.body, { childList: true, subtree: false });
    return () => observer.disconnect();
  }, [hideInput, refocus]);

  return (
    <div
      className={`${className} bg-[#fafbfc] dark:bg-[#2a2b2f] rounded-3xl p-10 text-gray-900 dark:text-white flex flex-col justify-center shadow-sm dark:shadow-none h-full border border-gray-200/50 dark:border-none`}
      onClick={refocus}
    >
      <div className="flex-grow flex flex-col justify-evenly gap-8">
        {!hideInput && (
          <form onSubmit={handleSearch}>
            <input
              ref={inputRef}
              type="text"
              value={searchId}
              onChange={(e) => setSearchId(e.target.value)}
              placeholder="แตะบัตร RFID หรือกรอกรหัสเพื่อลงเวลา"
              className="w-full bg-[#f0f2f6] dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-2xl px-8 py-5 text-2xl text-gray-900 dark:text-white focus:ring-4 focus:ring-indigo-500/20 outline-none transition-all placeholder:text-xl"
              autoFocus
            />
            {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
          </form>
        )}

        {!hideInput && (
          <div className="text-center">
            <p className="text-6xl 2xl:text-7xl font-black text-gray-900 dark:text-white tracking-tight">{currentTime}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SearchPanel;
