/** The org branding the owner picked (presentation only; shared by the BO5 and the UX-7 campaign). */
const BRAND_KEY = "mogzy.dynasty.ux3.brand";
export const readBrand = (): string | null => { try { return window.localStorage.getItem(BRAND_KEY); } catch { return null; } };
export const writeBrand = (id: string | null) => { try { if (id) window.localStorage.setItem(BRAND_KEY, id); else window.localStorage.removeItem(BRAND_KEY); } catch { /* ignore */ } };
