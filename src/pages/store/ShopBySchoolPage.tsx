import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

const ShopBySchoolPage = () => {
  const navigate = useNavigate();

  return (
    <div className="max-w-4xl mx-auto px-6 py-14 md:py-18">
      <p className="text-xs tracking-[0.25em] uppercase text-muted-foreground mb-4">Secure Access</p>
      <h1 className="text-3xl md:text-4xl font-extralight tracking-[0.12em] uppercase mb-4">
        Shop by School
      </h1>
      <p className="text-sm md:text-base text-muted-foreground leading-relaxed max-w-2xl mb-8">
        Parents are requested to use the school-provided code to access their private store. This keeps pricing,
        inventory, and student-specific products isolated per school while the public site remains open for discovery.
      </p>

      <div className="flex items-center gap-3">
        <Button className="text-xs tracking-[0.2em] uppercase h-11 px-6" onClick={() => navigate('/store/enter-school')}>
          Proceed to Secure Login
        </Button>
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          Back to homepage
        </Link>
      </div>
    </div>
  );
};

export default ShopBySchoolPage;
