import React from "react";
import { Navigate } from "react-router-dom";

const AcademicAdminPage: React.FC = () => {
  return <Navigate to="/academic/hub/registration" replace />;
};

export default AcademicAdminPage;