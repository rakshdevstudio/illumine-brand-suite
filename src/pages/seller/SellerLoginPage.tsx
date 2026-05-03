import PortalLoginPage from "@/components/auth/PortalLoginPage";

const SellerLoginPage = () => (
  <PortalLoginPage
    portalLabel="Seller Portal"
    allowedRoles={["vendor"]}
  />
);

export default SellerLoginPage;
