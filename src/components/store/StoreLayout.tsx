import { Outlet, useNavigate } from "react-router-dom";
import { useEffect } from "react";
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
    <div className="min-h-screen flex flex-col bg-background">
      <StoreHeader />
      <StudentProfileModal open={showModal} onOpenChange={(o) => o ? openModal() : closeModal()} onProfileSet={handleProfileSet} />
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="bg-surface-dark py-12">
        <div className="max-w-7xl mx-auto px-6">
          <p className="text-center text-xs tracking-[0.3em] text-surface-dark-muted uppercase">
            © 2026 Illume. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default StoreLayout;
