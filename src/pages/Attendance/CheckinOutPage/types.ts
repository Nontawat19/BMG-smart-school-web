export interface FoundUser {
  id: string;
  type: "student" | "teacher";
  name: string;
  profileImageUrl: string;
  displayId: string;
  latestActionTime?: string;
  status?: string;
  grade?: string;
  room?: string;
  position?: string;
  advisorRole?: string;
  isHomeroomTeacher?: boolean;
  nickname?: string;
  parentLineUserIds?: string[];
  parentLineRegistrationContexts?: Record<string, {
    liffId?: string;
    teacherId?: string;
    classLevel?: string;
    room?: string;
    registeredAt?: string;
  }>;
  lineRegistrationReviewRequired?: boolean;
  behaviorScore?: number;
  attendanceStats?: {
    present: number;
    late: number;
    leave: number;
    absent: number;
    noCheckout: number;
    officialTravel: number;
  };
  role?: any;
  rfid?: string;
  scanMethod?: string;
  faceConfidence?: number;
  findfaceCardId?: string;
  faceScanImageUrl?: string;
  checkinTime?: string | null;
  checkoutTime?: string | null;
  lastAction?: "checkin" | "checkout" | "checkin_and_checkout";
}
