export const PWA_ATTENDANCE_HUB_PATH = "/academic/hub/attendance";
export const PWA_MY_SCHEDULE_PATH = "/academic/my-schedule";

export const isPwaStandalone = () => {
  if (typeof window === "undefined") return false;

  const navigatorWithStandalone = window.navigator as Navigator & {
    standalone?: boolean;
  };

  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    navigatorWithStandalone.standalone === true
  );
};
