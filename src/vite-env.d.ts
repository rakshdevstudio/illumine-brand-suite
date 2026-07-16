/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly R2_PUBLIC_URL?: string;
  readonly VITE_RAZORPAY_KEY_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  Razorpay?: new (options: Record<string, unknown>) => {
    open: () => void;
    on: (event: string, handler: (response: unknown) => void) => void;
  };
}
