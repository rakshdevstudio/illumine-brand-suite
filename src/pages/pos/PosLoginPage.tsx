import PortalLoginPage from "@/components/auth/PortalLoginPage";

const PosLoginPage = () => (
  <PortalLoginPage
    portalLabel="POS — Branch Login"
    allowedRoles={["branch_staff", "admin", "super_admin"]}
  />
);

export default PosLoginPage;
