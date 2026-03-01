import { Outlet } from "react-router-dom";
import StoreHeader from "./StoreHeader";

const StoreLayout = () => (
  <div className="min-h-screen flex flex-col">
    <StoreHeader />
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

export default StoreLayout;
