export const normalizeLineRegistrationValue = (value?: string | number | null) =>
  String(value ?? "").trim().replace(/\s+/g, "");

export const hasLineClassroomChanged = (
  fromClassLevel?: string | number | null,
  fromRoom?: string | number | null,
  toClassLevel?: string | number | null,
  toRoom?: string | number | null
) => {
  const fromClass = normalizeLineRegistrationValue(fromClassLevel);
  const toClass = normalizeLineRegistrationValue(toClassLevel);
  const fromRoomValue = normalizeLineRegistrationValue(fromRoom);
  const toRoomValue = normalizeLineRegistrationValue(toRoom);

  return Boolean(fromClass || toClass || fromRoomValue || toRoomValue) &&
    (fromClass !== toClass || fromRoomValue !== toRoomValue);
};

export const buildLineRegistrationReviewUpdate = ({
  fromClassLevel,
  fromRoom,
  toClassLevel,
  toRoom,
  reason = "classroom_changed",
}: {
  fromClassLevel?: string | number | null;
  fromRoom?: string | number | null;
  toClassLevel?: string | number | null;
  toRoom?: string | number | null;
  reason?: string;
}) => {
  if (!hasLineClassroomChanged(fromClassLevel, fromRoom, toClassLevel, toRoom)) {
    return {};
  }

  return {
    lineRegistrationReviewRequired: true,
    lineRegistrationReviewReason: reason,
    lineRegistrationPreviousClassLevel: String(fromClassLevel ?? ""),
    lineRegistrationPreviousRoom: String(fromRoom ?? ""),
    lineRegistrationCurrentClassLevel: String(toClassLevel ?? ""),
    lineRegistrationCurrentRoom: String(toRoom ?? ""),
    lineRegistrationReviewUpdatedAt: new Date().toISOString(),
  };
};

export const buildLineRegistrationResolvedUpdate = () => ({
  lineRegistrationReviewRequired: false,
  lineRegistrationReviewReason: "",
  lineRegistrationReviewResolvedAt: new Date().toISOString(),
});
