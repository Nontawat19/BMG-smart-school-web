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
  nickname?: string;
  parentLineUserIds?: string[];
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
}