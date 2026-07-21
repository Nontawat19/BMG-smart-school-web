export interface FamilyMember {
    id: string;
    name: string;
    relationship?: string;
    age: string;
    education: string;
    occupation: string;
    income: string;
    disability?: string;
    wageIncome?: string;
    agricultureIncome?: string;
    businessIncome?: string;
    welfareIncome?: string;
    otherIncome?: string;
    totalIncome?: string;
}

export interface HomeVisitData {
    schoolName?: string;
    educationArea?: string;
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
    parentFirstName?: string;
    parentLastName?: string;
    parentPhone?: string;
    parentOccupation?: string;
    parentEducation?: string;
    parentCitizenId?: string;
    parentNoGuardian?: boolean;
    parentNoCitizenId?: boolean;
    parentWelfareRegistered?: boolean;
    householdDependency?: string[];
    vehiclePrivateCar?: string;
    vehiclePickup?: string;
    vehicleFarmMachine?: string;
    farmlandStatus?: string[];
    caregiverWhenParentsAwayOther?: string;
    householdIncomeAverage?: string;
    assistanceReceived?: string[];
    assistanceReceivedOther?: string;
    informantRelationship?: string;
    teacherPosition?: string;
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
    electronicUsage: string | string[];
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
    parentHousePhotoPermission?: string;
    gps: { lat: number, lng: number } | null;
    housingTypeOther?: string;
    travelMethodDetail?: string;
    housingCleanlinessOther?: string;
}

export interface Student {
    id: string;
    studentId: string;
    idCardNumber?: string;
    citizenId?: string;
    nationalId?: string;
    title: string;
    firstName: string;
    lastName: string;
    classLevel: string;
    room: string;
    schoolId: string;
    profileImageUrl?: string;
    studentNumber?: string;
    fatherIdNumber?: string;
    fatherTitle?: string;
    fatherFirstName?: string;
    fatherLastName?: string;
    fatherOccupation?: string;
    fatherMonthlyIncome?: string;
    fatherPhone?: string;
    motherIdNumber?: string;
    motherTitle?: string;
    motherFirstName?: string;
    motherLastName?: string;
    motherOccupation?: string;
    motherMonthlyIncome?: string;
    motherPhone?: string;
    guardianRelationship?: string;
    guardianIdNumber?: string;
    guardianTitle?: string;
    guardianFirstName?: string;
    guardianLastName?: string;
    guardianOccupation?: string;
    guardianMonthlyIncome?: string;
    guardianPhone?: string;
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
    teacherPosition?: string;
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
    riskTotal: number;
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
