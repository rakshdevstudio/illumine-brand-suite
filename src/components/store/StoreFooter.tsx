const StoreFooter = () => {
  return (
    <footer className="bg-surface-dark py-12">
      <div className="max-w-7xl mx-auto px-6 text-center space-y-2">
        <p className="text-sm tracking-[0.2em] text-surface-dark-foreground uppercase">ILLUME</p>
        <p className="text-xs text-surface-dark-muted">Premium School Uniforms</p>
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
