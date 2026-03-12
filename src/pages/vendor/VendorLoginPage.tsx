import PortalLoginPage from "@/components/auth/PortalLoginPage";

const VendorLoginPage = () => (
  <PortalLoginPage
    portalLabel="Vendor Portal"
    allowedRoles={["vendor"]}
  />
);

export default VendorLoginPage;
