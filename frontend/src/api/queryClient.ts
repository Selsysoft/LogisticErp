import { QueryClient } from "@tanstack/react-query";

/**
 * Uygulamanın tek sorgu istemcisi (12.1a §6.13). main.tsx sağlayıcıya verir; authStore çıkışta ve
 * oturum düşünce önbelleği temizler: önceki kullanıcının listeleri ve iş yeri ağacı yeni oturuma taşınmaz.
 */
export const queryClient = new QueryClient();
