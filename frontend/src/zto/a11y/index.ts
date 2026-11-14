// ZTO ekranlarının erişilebilirlik yardımcıları (12.1 §5.0 #12, MWG): form alanı ARIA durumu, hata
// duyurusu, uzun görev bölme.
export {
  ANNOUNCE_DELAY_MS,
  announcementText,
  createAnnouncementTracker,
  errorIdOf,
  fieldA11yProps,
  fieldStateOf,
  showsError,
  type FieldA11yProps,
  type FieldA11yState,
} from "./fieldA11y";
export { useFormErrorAnnouncer, type FormErrorAnnouncer } from "./useFormErrorAnnouncer";
export { mapInChunks, TASK_BUDGET_MS, yieldToMain } from "./yieldToMain";
