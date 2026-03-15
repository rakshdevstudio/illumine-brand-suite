import { AnimatePresence, motion } from "framer-motion";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import StoreHeader from "./StoreHeader";
import StoreFooter from "./StoreFooter";
import StudentProfileModal from "./StudentProfileModal";
import { useStudentProfile, StudentProfile } from "@/lib/student-profile";

const PAGE_TRANSITION = {
  duration: 0.26,
  ease: [0.16, 1, 0.3, 1] as const,
};

const StoreLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const showModal = useStudentProfile((s) => s.showModal);
  const openModal = useStudentProfile((s) => s.openModal);
  const closeModal = useStudentProfile((s) => s.closeModal);

  const handleProfileSet = (p: StudentProfile) => {
    navigate(`/store/school/${p.schoolSlug}/class/${p.classSlug}/gender/${p.gender}`);
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <StoreHeader />
      <StudentProfileModal open={showModal} onOpenChange={(o) => o ? openModal() : closeModal()} onProfileSet={handleProfileSet} />
      <main className="flex-1 overflow-x-hidden">
        <AnimatePresence initial={false}>
          <motion.div
            key={`${location.pathname}${location.search}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 0 }}
            transition={PAGE_TRANSITION}
            className="min-h-full"
            style={{ willChange: "transform, opacity" }}
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>
      <StoreFooter />
    </div>
  );
};

export default StoreLayout;
