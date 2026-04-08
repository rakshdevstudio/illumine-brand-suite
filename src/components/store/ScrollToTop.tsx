import { useEffect, useLayoutEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

const ScrollToTop = () => {
  const location = useLocation();
  const scrollPositions = useRef<Record<string, number>>({});
  const isAdminRoute = location.pathname.startsWith("/admin");

  useEffect(() => {
    return () => {
      // Store current path scroll before navigating away.
      scrollPositions.current[location.pathname] = window.scrollY;
    };
  }, [location.pathname]);

  useLayoutEffect(() => {
    if (!isAdminRoute) {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      return;
    }

    const savedScroll = scrollPositions.current[location.pathname];
    if (typeof savedScroll === "number") {
      window.scrollTo({ top: savedScroll, left: 0, behavior: "auto" });
    }
  }, [isAdminRoute, location.pathname]);

  return null;
};

export default ScrollToTop;
