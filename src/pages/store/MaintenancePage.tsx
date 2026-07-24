import { ShieldAlert } from "lucide-react";
import illumeLogo from "@/assets/logo.png";

const MaintenancePage = () => {
  return (
    <div className="min-h-screen bg-[#FDFCFB] flex flex-col items-center justify-center p-6 text-center">
      <div className="max-w-md w-full space-y-8 bg-white p-10 rounded-2xl shadow-sm border border-slate-100">
        <div className="flex justify-center">
          <img src={illumeLogo} alt="Illume" className="h-12 w-auto object-contain" />
        </div>

        <div className="space-y-4">
          <div className="mx-auto w-12 h-12 bg-amber-50 rounded-full flex items-center justify-center mb-6">
            <ShieldAlert className="w-6 h-6 text-amber-600" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Temporarily Paused
          </h1>
          <p className="text-slate-600 leading-relaxed text-sm">
            Illume online orders are currently paused until upcoming month.
          </p>
          <p className="text-slate-600 leading-relaxed text-sm font-medium">
            Please continue to place your uniform orders through Edufindz.
          </p>
        </div>

        <div className="pt-6 border-t border-slate-100">
          <p className="text-xs text-slate-400">
            We will reopen soon. Thank you for your patience.
          </p>
        </div>
      </div>
    </div>
  );
};

export default MaintenancePage;
