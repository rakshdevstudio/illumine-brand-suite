import { Outlet, useNavigate } from "react-router-dom";
import StoreHeader from "./StoreHeader";
import StoreFooter from "./StoreFooter";
import StudentProfileModal from "./StudentProfileModal";
import { useStudentProfile, StudentProfile } from "@/lib/student-profile";

const StoreLayout = () => {
  const navigate = useNavigate();
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
        <div className="min-h-full">
          <Outlet />
        </div>
      </main>
      <StoreFooter />
    </div>
  );
};

export default StoreLayout;
