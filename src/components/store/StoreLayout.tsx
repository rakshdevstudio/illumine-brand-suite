import { Outlet, useNavigate } from "react-router-dom";
import StoreHeader from "./StoreHeader";
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
    <div className="min-h-screen flex flex-col">
      <StoreHeader />
      <StudentProfileModal open={showModal} onOpenChange={(o) => o ? openModal() : closeModal()} onProfileSet={handleProfileSet} />
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-border py-8">
        <p className="text-center text-xs tracking-[0.2em] text-muted-foreground uppercase">
          © 2026 Illume. All rights reserved.
        </p>
      </footer>
    </div>
  );
};

export default StoreLayout;
