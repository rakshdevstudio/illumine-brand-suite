import { Link } from "react-router-dom";

const StoreFooter = () => {
  return (
    <footer className="bg-surface-dark py-12">
      <div className="max-w-7xl mx-auto px-6 text-center space-y-2">
        <p className="text-sm tracking-[0.2em] text-surface-dark-foreground uppercase">ILLUME</p>
        <p className="text-xs text-surface-dark-muted">Premium School Uniforms</p>
        <div className="flex items-center justify-center gap-5 pt-2 text-[11px] uppercase tracking-[0.18em] text-surface-dark-muted">
          <Link to="/" className="transition-colors hover:text-surface-dark-foreground">
            Home
          </Link>
          <Link to="/contact" className="transition-colors hover:text-surface-dark-foreground">
            Contact
          </Link>
        </div>
        <div className="text-sm space-y-1">
          <p>
            <a
              href="mailto:hello@illume.co.in"
              className="text-gray-500 hover:text-black transition-colors"
            >
              hello@illume.co.in
            </a>
          </p>
          <p>
            <a
              href="https://www.illumeonline.in"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-500 hover:text-black transition-colors"
            >
              www.illumeonline.in
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
};

export default StoreFooter;
