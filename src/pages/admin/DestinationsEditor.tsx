import {
  Badge,
  Button,
  Field,
  Input,
  Text,
  Textarea,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import {
  AddRegular,
  ArrowDownRegular,
  ArrowUpRegular,
  DeleteRegular,
} from "@fluentui/react-icons";
import { type MultiDestination } from "../../api";

const useStyles = makeStyles({
  root: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalM,
  },
  destItem: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalS,
    padding: tokens.spacingVerticalM,
    backgroundColor: tokens.colorNeutralBackground3,
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  destHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: tokens.spacingHorizontalS,
  },
  destActions: {
    display: "flex",
    gap: "2px",
    flexShrink: 0,
  },
  row: {
    display: "flex",
    gap: tokens.spacingHorizontalS,
    alignItems: "flex-start",
  },
  groupFields: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalXS,
    paddingLeft: tokens.spacingHorizontalM,
    borderLeft: `2px solid ${tokens.colorBrandStroke1}`,
  },
});

interface Props {
  destinations: MultiDestination[];
  onChange: (destinations: MultiDestination[]) => void;
}

export default function DestinationsEditor({ destinations, onChange }: Props) {
  const styles = useStyles();

  function update(index: number, partial: Partial<MultiDestination>) {
    const next = destinations.map((d, i) =>
      i === index ? { ...d, ...partial } : d,
    );
    onChange(next);
  }

  function add() {
    onChange([
      ...destinations,
      {
        url: "",
        title: "",
        autoRedirectChance: 0,
        position: destinations.length,
      },
    ]);
  }

  function remove(index: number) {
    onChange(
      destinations
        .filter((_, i) => i !== index)
        .map((d, i) => ({ ...d, position: i })),
    );
  }

  function move(index: number, dir: -1 | 1) {
    const next = [...destinations];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next.map((d, i) => ({ ...d, position: i })));
  }

  return (
    <div className={styles.root}>
      {destinations.map((dest, i) => (
        <div key={i} className={styles.destItem}>
          <div className={styles.destHeader}>
            <Badge appearance="tint" color="informative">
              #{i + 1}
            </Badge>
            <div className={styles.destActions}>
              <Button
                size="small"
                appearance="transparent"
                icon={<ArrowUpRegular />}
                disabled={i === 0}
                onClick={() => move(i, -1)}
              />
              <Button
                size="small"
                appearance="transparent"
                icon={<ArrowDownRegular />}
                disabled={i === destinations.length - 1}
                onClick={() => move(i, 1)}
              />
              <Button
                size="small"
                appearance="transparent"
                icon={<DeleteRegular />}
                onClick={() => remove(i)}
              />
            </div>
          </div>
          <Field label="Destination URL" required>
            <Input
              placeholder="https://example.com"
              value={dest.url}
              onChange={(_, d) => update(i, { url: d.value })}
            />
          </Field>
          <Field label="Title" required>
            <Input
              placeholder="e.g. Option A"
              value={dest.title}
              onChange={(_, d) => update(i, { title: d.value })}
            />
          </Field>
          <div className={styles.row}>
            <Field
              label="Auto-redirect %"
              hint="0 = never auto-redirect"
              style={{ flex: "1" }}
            >
              <Input
                type="number"
                placeholder="0"
                value={String(dest.autoRedirectChance || "")}
                onChange={(_, d) =>
                  update(i, {
                    autoRedirectChance: Math.max(
                      0,
                      Math.min(100, Number(d.value) || 0),
                    ),
                  })
                }
                style={{ maxWidth: "100px" }}
              />
            </Field>
            <Field label="Group name" hint="Optional" style={{ flex: "1" }}>
              <Input
                placeholder="e.g. mirrors"
                value={dest.groupName ?? ""}
                onChange={(_, d) =>
                  update(i, { groupName: d.value || undefined })
                }
              />
            </Field>
          </div>
          {dest.groupName && (
            <div className={styles.groupFields}>
              <Text
                size={200}
                style={{ color: tokens.colorNeutralForeground3 }}
              >
                Group settings (shared with same group name)
              </Text>
              <Field label="Group title">
                <Input
                  placeholder="e.g. Mirror sites"
                  value={dest.groupTitle ?? ""}
                  onChange={(_, d) =>
                    update(i, { groupTitle: d.value || undefined })
                  }
                />
              </Field>
              <Field label="Group description">
                <Textarea
                  placeholder="e.g. Select a mirror closest to you"
                  value={dest.groupDescription ?? ""}
                  onChange={(_, d) =>
                    update(i, { groupDescription: d.value || undefined })
                  }
                  rows={2}
                />
              </Field>
            </div>
          )}
        </div>
      ))}
      <Button
        appearance="subtle"
        icon={<AddRegular />}
        onClick={add}
        style={{ alignSelf: "flex-start" }}
      >
        Add destination
      </Button>
    </div>
  );
}
