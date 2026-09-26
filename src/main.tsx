// Базовые стили — первыми, чтобы стили экранов могли их переопределять
import "@/styles/global.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { AuthProvider } from "@/lib/auth";
import { initTelegram } from "@/lib/telegram";
import { initViewport } from "@/lib/viewport";
import { ToastProvider } from "@/ui/Toast";
import { App } from "./App";

initTelegram();

// iOS включает :active-состояния только при наличии обработчика касаний
document.addEventListener("touchstart", () => {}, { passive: true });

initViewport();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
        <ToastProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ToastProvider>
      </MotionConfig>
    </QueryClientProvider>
  </StrictMode>,
);
