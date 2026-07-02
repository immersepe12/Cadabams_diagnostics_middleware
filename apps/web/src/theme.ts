import type { ThemeConfig } from "antd";

// Cadabams Diagnostics design system — single source of truth for both the ops
// dashboard and the patient portal (both render under this ConfigProvider).
// Brand: medical teal on soft neutrals, 10px geometry, Inter.

export const BRAND = {
  primary: "#0F766E",      // teal-700
  primaryHover: "#0D9488", // teal-600
  primarySoft: "#E6F4F2",  // selected pills / hovers
  bgLayout: "#F5F7F9",
  border: "#E5EAEE",
  textStrong: "#111827",
};

export const appTheme: ThemeConfig = {
  token: {
    colorPrimary: BRAND.primary,
    colorInfo: BRAND.primary,
    colorLink: BRAND.primary,
    borderRadius: 10,
    fontFamily:
      "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    colorBgLayout: BRAND.bgLayout,
    colorBorderSecondary: BRAND.border,
  },
  components: {
    Card: {
      borderRadiusLG: 14,
      boxShadowTertiary: "0 1px 2px rgba(16,24,40,.04), 0 1px 3px rgba(16,24,40,.06)",
    },
    Table: {
      headerBg: "#FAFBFC",
      headerColor: "#4B5563",
      rowHoverBg: "#F0FAF8",
      headerBorderRadius: 10,
    },
    Button: { controlHeight: 36, controlHeightSM: 28 },
    Input: { controlHeight: 36 },
    Select: { controlHeight: 36 },
    Layout: { headerBg: "#ffffff", siderBg: "#ffffff", bodyBg: BRAND.bgLayout },
    Menu: {
      itemBorderRadius: 8,
      itemHeight: 40,
      itemSelectedBg: BRAND.primarySoft,
      itemSelectedColor: BRAND.primary,
      itemMarginInline: 8,
      subMenuItemBg: "transparent",
    },
    Segmented: { itemSelectedBg: "#ffffff", trackBg: "#EDF1F4" },
    Tag: { borderRadiusSM: 6 },
    Drawer: { paddingLG: 16 },
  },
};
