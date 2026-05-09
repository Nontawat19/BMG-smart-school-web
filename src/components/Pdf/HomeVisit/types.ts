export interface FamilyMember {
    id: string;
    name: string;
    age: string;
    education: string;
    occupation: string;
    income: string;
}

export interface HomeVisitData {
    visitNo: string;
    semester: string;
    academicYear: string;
    visitStatus: string;
    visitType: string;
    visitDate: string;
    startTime: string;
    endTime: string;
    visitorNameBySide: string;
    relationshipWithStudent: string;
    studentNickname: string;
    studentPhone: string;
    studentLineId: string;
    studentFacebook: string;
    travelDistance: string;
    travelTimeHours: string;
    travelTimeMinutes: string;
    travelMethod: string;
    housingType: string;
    housingCondition: string;
    housingCleanliness: string;
    utilitiesElectricity: string;
    utilitiesWater: string;
    utilitiesToilet: string;
    environmentNear: string;
    familyMaleCount: string;
    familyFemaleCount: string;
    familyTotalCount: string;
    siblingSameParentsMale: string;
    siblingSameParentsFemale: string;
    siblingDifferentParentsMale: string;
    siblingDifferentParentsFemale: string;
    specialNeedHelpCount: string;
    specialNeedDetail?: string;
    // Family statistics summary
    familyAtmosphere: string;
    relationships: {
        father: string;
        mother: string;
        brother: string;
        sister: string;
        grandparents: string;
        relatives: string;
        others: string;
    };
    hoursTogetherPerDay: string;
    studentResponsibility: string;
    studentHobby: string;
    caregiverWhenParentsAway: string;

    // Parent Status (Added for Summary Report)
    bothParentsDeceased?: boolean;
    oneParentDeceased?: boolean;
    parentsSeparated?: boolean;
    notLivingWithParents?: boolean;

    familyMonthlyIncome: string;
    expensePayer: string;
    studentWorkingExtra: string;
    extraJobDetail: string;
    extraIncome: string;
    studentAllowancePerDay: string;
    healthRisk: string[];
    welfareRisk: string[];
    studentResponsibilities: string[];
    studentHobbies: string[];
    drugRisk: string[];
    violenceRisk: string[];
    sexualRisk: string[];
    gameRisk: string[];
    computerAccess: string;
    electronicUsage: string;
    parentConcerns: string;
    schoolAssistanceNeeded: string[];
    schoolAssistanceNeededDetail: string;
    assistanceHistory: string;
    visitSummary: string;
    visitSummaryPromoteDetail: string;
    visitSummaryUrgentDetail: string;
    teacherComments: string;
    suggestionForUse: string;
    obstacles: string;
    overallSuggestions: string;
    photos: {
        internal: string[];
        external: string[];
        exterior: string;
        interior: string;
        schoolSign: string;
        sketchMap: string;
    };
    gps: { lat: number, lng: number } | null;
    housingTypeOther?: string;
    travelMethodDetail?: string;
    housingCleanlinessOther?: string;
}

export interface Student {
    id: string;
    studentId: string;
    title: string;
    firstName: string;
    lastName: string;
    classLevel: string;
    room: string;
    schoolId: string;
    profileImageUrl?: string;
    studentNumber?: string;
}

export interface Teacher {
    id: string;
    title: string;
    firstName: string;
    lastName: string;
    homeroomGrade: string;
    homeroomRoom?: string;
}

export interface HomeVisitPdfProps {
    student: Student;
    visit: HomeVisitData;
    familyMembers: FamilyMember[];
    teacherName: string;
    teachers?: Teacher[];
}

export interface HomeVisitSummaryStats {
    totalStudents: number;
    visitedMale: number;
    visitedFemale: number;
    visitedTotal: number;
    notVisitedTotal: number;
    notVisitedReason: string;
    familyWarm: number;
    familyBroken: number;
    bothParentsDeceased: number;
    oneParentDeceased: number;
    parentsSeparated: number;
    notLivingWithParents: number;
    learningRisk: number;
    healthRisk: number;
    behaviorRisk: {
        health: number;
        drug: number;
        violence: number;
        travel: number;
        sexual: number;
        game: number;
        others: number;
    };
    economicRisk: number;
    otherRisk: number;
    otherRiskDetail: string;
    urgentTotal: number;
    urgentDetail: string;
    agenciesJoined: string;
    dataUsage: string;
    parentConcernsSummary: string;
    obstaclesSummary: string;
    suggestionsSummary: string;
}

export interface HomeVisitSummaryPdfProps {
    schoolName: string;
    academicYear: string;
    semester: string;
    classLevel: string;
    room: string;
    visitStartDate: string;
    visitEndDate: string;
    stats: HomeVisitSummaryStats;
    teacherName: string;
    teachers?: Teacher[];
}
