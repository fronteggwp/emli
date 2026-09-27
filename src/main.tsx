// Базовые стили — первыми, чтобы стили экранов могли их переопределять
import "@/styles/global.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { AuthProvider } from "@/lib/auth";
import { initTelegram } from "@/lib/telegram";
import { initViewport } from "@/lib/viewport";
import { initTheme } from "@/lib/theme";
import { initSound } from "@/lib/sound";
import { ToastProvider } from "@/ui/Toast";
import { App } from "./App";

initTelegram();
initTheme();
initSound();

// iOS включает :active-состояния только при наличии обработчика касаний
document.addEventListener("touchstart", () => {}, { passive: true });

initViewport();

// Сетевые сбои (а не ошибки данных) повторяем автоматически
const isNetwork = (e: unknown) => /fetch|network|load failed|timeout/i.test(String((e as Error)?.message ?? e));

const queryClient = new QueryClient({
  // Любое несохранившееся действие — заметно пользователю, а не молча
  mutationCache: new MutationCache({
    onError: (e, _v, _c, m) => {
      if (m.meta?.silent) return;
      window.dispatchEvent(new CustomEvent("emli-error", { detail: isNetwork(e) ? "network" : "server" }));
    },
  }),
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
    mutations: { retry: (n, e) => n < 2 && isNetwork(e), retryDelay: (n) => 800 * 2 ** n },
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
