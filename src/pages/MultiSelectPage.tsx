import { useEffect, useState } from "react";
import {
  Button,
  Caption1,
  Divider,
  Text,
  Title3,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { OpenRegular } from "@fluentui/react-icons";
import { type ResolvedMultiLink } from "../api";
import AuthLayout from "../components/AuthLayout";

const useStyles = makeStyles({
  body: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalL,
  },
  groupSection: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalS,
  },
  groupHeader: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  },
  destCard: {
    cursor: "pointer",
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalM}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: tokens.spacingHorizontalM,
    backgroundColor: tokens.colorNeutralBackground3,
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    ":hover": {
      backgroundColor: tokens.colorNeutralBackground3Hover,
    },
    transitionProperty: "background-color, border-color",
    transitionDuration: "150ms",
  },
  destInfo: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    minWidth: 0,
    flex: "1",
  },
  destUrl: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontFamily: "'Cascadia Code', 'Cascadia Mono', Consolas, monospace",
  },
});

interface DestGroup {
  groupName?: string;
  groupTitle?: string;
  groupDescription?: string;
  items: ResolvedMultiLink["destinations"];
}

function groupDestinations(
  destinations: ResolvedMultiLink["destinations"],
): DestGroup[] {
  const grouped = new Map<string, DestGroup>();
  const ungrouped: DestGroup["items"] = [];

  for (const dest of destinations) {
    if (dest.groupName) {
      const existing = grouped.get(dest.groupName);
      if (existing) {
        existing.items.push(dest);
      } else {
        grouped.set(dest.groupName, {
          groupName: dest.groupName,
          groupTitle: dest.groupTitle,
          groupDescription: dest.groupDescription,
          items: [dest],
        });
      }
    } else {
      ungrouped.push(dest);
    }
  }

  const result: DestGroup[] = [];
  if (ungrouped.length > 0) {
    result.push({ items: ungrouped });
  }
  for (const group of grouped.values()) {
    result.push(group);
  }
  return result;
}

function rollAutoRedirect(
  destinations: ResolvedMultiLink["destinations"],
): string | null {
  // Roll a random number 0–100. Check each destination's chance.
  // Chances are independent percentages; we iterate and check each.
  const roll = Math.random() * 100;
  let cumulative = 0;
  for (const dest of destinations) {
    if (dest.autoRedirectChance > 0) {
      cumulative += dest.autoRedirectChance;
      if (roll < cumulative) return dest.url;
    }
  }
  return null;
}

export default function MultiSelectPage({ link }: { link: ResolvedMultiLink }) {
  const styles = useStyles();
  const [autoRedirected, setAutoRedirected] = useState(false);

  useEffect(() => {
    const target = rollAutoRedirect(link.destinations);
    if (target) {
      setAutoRedirected(true);
      window.location.href = target;
    }
  }, [link.destinations]);

  if (autoRedirected) {
    return (
      <AuthLayout>
        <div className={styles.body}>
          <Title3>Redirecting…</Title3>
        </div>
      </AuthLayout>
    );
  }

  const groups = groupDestinations(link.destinations);

  return (
    <AuthLayout>
      <div className={styles.body}>
        <div>
          <Title3>{link.title}</Title3>
          <Caption1
            style={{
              display: "block",
              marginTop: tokens.spacingVerticalXS,
              color: tokens.colorNeutralForeground3,
            }}
          >
            {link.description}
          </Caption1>
        </div>

        {groups.map((group, gi) => (
          <div
            key={group.groupName ?? `ungrouped-${gi}`}
            className={styles.groupSection}
          >
            {group.groupTitle && (
              <>
                {gi > 0 && <Divider />}
                <div className={styles.groupHeader}>
                  <Text weight="semibold" size={400}>
                    {group.groupTitle}
                  </Text>
                  {group.groupDescription && (
                    <Caption1 style={{ color: tokens.colorNeutralForeground3 }}>
                      {group.groupDescription}
                    </Caption1>
                  )}
                </div>
              </>
            )}
            {group.items.map((dest, di) => (
              <a
                key={di}
                href={dest.url}
                className={styles.destCard}
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <div className={styles.destInfo}>
                  <Text weight="semibold">{dest.title}</Text>
                  <span className={styles.destUrl}>{dest.url}</span>
                </div>
                <OpenRegular
                  style={{
                    flexShrink: 0,
                    fontSize: "18px",
                    color: tokens.colorNeutralForeground3,
                  }}
                />
              </a>
            ))}
          </div>
        ))}

        <Button
          appearance="subtle"
          onClick={() => history.back()}
          style={{ alignSelf: "flex-start" }}
        >
          Go back
        </Button>
      </div>
    </AuthLayout>
  );
}
