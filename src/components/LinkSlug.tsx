import { makeStyles, mergeClasses, tokens } from "@fluentui/react-components";

export const CODE_FONT =
  "'Cascadia Code', 'Cascadia Mono', Consolas, 'Courier New', monospace";

const useStyles = makeStyles({
  base: {
    fontFamily: CODE_FONT,
    color: tokens.colorBrandForeground1,
    backgroundColor: tokens.colorBrandBackground2,
    borderRadius: tokens.borderRadiusMedium,
    letterSpacing: "0.03em",
    whiteSpace: "nowrap",
    display: "inline-block",
  },
  sm: {
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    padding: "1px 6px",
  },
  md: {
    fontSize: tokens.fontSizeBase300,
    fontWeight: tokens.fontWeightSemibold,
    padding: "2px 8px",
    borderRadius: tokens.borderRadiusLarge,
  },
  lg: {
    fontSize: tokens.fontSizeBase500,
    fontWeight: tokens.fontWeightSemibold,
    padding: "4px 12px",
    borderRadius: tokens.borderRadiusLarge,
  },
});

export default function LinkSlug({
  id,
  size = "sm",
}: {
  id: string;
  size?: "sm" | "md" | "lg";
}) {
  const styles = useStyles();
  return <code className={mergeClasses(styles.base, styles[size])}>/{id}</code>;
}
