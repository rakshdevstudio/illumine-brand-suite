import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

const SchoolCodePage = () => {
  const navigate = useNavigate();
  useEffect(() => {
    navigate("/shop-by-school", { replace: true });
  }, [navigate]);
  return null;
};

export default SchoolCodePage;
