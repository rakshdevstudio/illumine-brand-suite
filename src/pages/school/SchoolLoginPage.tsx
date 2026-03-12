import PortalLoginPage from "@/components/auth/PortalLoginPage";

const SchoolLoginPage = () => (
  <PortalLoginPage
    portalLabel="School Portal"
    allowedRoles={["school_user"]}
  />
);

export default SchoolLoginPage;
