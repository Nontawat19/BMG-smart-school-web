import { useEffect, useState } from "react";
import { isPwaStandalone } from "@/utils/pwaMode";

const DISPLAY_MODE_QUERIES = [
  "(display-mode: standalone)",
];

export const usePwaMode = () => {
  const [isPwaMode, setIsPwaMode] = useState(() => isPwaStandalone());

  useEffect(() => {
    const updatePwaMode = () => setIsPwaMode(isPwaStandalone());
    const mediaQueries = DISPLAY_MODE_QUERIES.map((query) => window.matchMedia(query));

    mediaQueries.forEach((mediaQuery) => {
      if (mediaQuery.addEventListener) {
        mediaQuery.addEventListener("change", updatePwaMode);
      } else {
        mediaQuery.addListener(updatePwaMode);
      }
    });

    updatePwaMode();

    return () => {
      mediaQueries.forEach((mediaQuery) => {
        if (mediaQuery.removeEventListener) {
          mediaQuery.removeEventListener("change", updatePwaMode);
        } else {
          mediaQuery.removeListener(updatePwaMode);
        }
      });
    };
  }, []);

  return isPwaMode;
};
