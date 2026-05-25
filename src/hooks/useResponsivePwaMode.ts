import { useEffect, useState } from "react";
import { usePwaMode } from "./usePwaMode";

export const useResponsivePwaMode = () => {
  const isPwaStandaloneMode = usePwaMode();
  const [isMobileScreen, setIsMobileScreen] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth < 768;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleResize = () => {
      setIsMobileScreen(window.innerWidth < 768);
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return isPwaStandaloneMode || isMobileScreen;
};
