import type { ReactNode } from "react";
import { makeStyles, tokens } from "@fluentui/react-components";
import { CODE_FONT } from "./LinkSlug";

const useStyles = makeStyles({
  page: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    minHeight: "100vh",
    backgroundImage: `radial-gradient(ellipse at 50% -10%, ${tokens.colorNeutralBackground4} 0%, ${tokens.colorNeutralBackground1} 60%)`,
    padding: tokens.spacingHorizontalL,
  },
  wrapper: {
    width: "420px",
    maxWidth: "100%",
  },
  brandLabel: {
    fontFamily: CODE_FONT,
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorBrandForeground1,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    paddingLeft: "4px",
    marginBottom: tokens.spacingVerticalM,
    display: "block",
  },
  card: {
    backgroundColor: tokens.colorNeutralBackground2,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusXLarge,
    boxShadow: tokens.shadow28,
    padding: `${tokens.spacingVerticalXXL} ${tokens.spacingHorizontalXXL}`,
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalL,
  },
});

export default function AuthLayout({ children }: { children: ReactNode }) {
  const styles = useStyles();
  return (
    <div className={styles.page}>
      <div className={styles.wrapper}>
        <span className={styles.brandLabel}>krnl.go</span>
        <div className={styles.card}>{children}</div>
      </div>
    </div>
  );
}
