import { useState } from "react";
import {
  Body1,
  Button,
  Caption1,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  DialogTrigger,
  Text,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { CheckmarkRegular, ErrorCircleRegular } from "@fluentui/react-icons";
import { type MigrateResult, migrateFromKV } from "../../api";

const useStyles = makeStyles({
  description: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalS,
    paddingTop: tokens.spacingVerticalS,
  },
  result: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalXS,
    padding: tokens.spacingVerticalS,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground3,
    marginTop: tokens.spacingVerticalS,
  },
  resultRow: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
  },
  error: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
    padding: tokens.spacingVerticalS,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground3,
    marginTop: tokens.spacingVerticalS,
  },
});

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMigrated: () => void;
}

export default function MigrateKVDialog({
  open,
  onOpenChange,
  onMigrated,
}: Props) {
  const styles = useStyles();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<MigrateResult | null>(null);
  const [error, setError] = useState("");

  function handleClose() {
    if (result) onMigrated();
    setResult(null);
    setError("");
    onOpenChange(false);
  }

  async function handleMigrate() {
    setLoading(true);
    setError("");
    try {
      const res = await migrateFromKV();
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Migration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(_, d) => {
        if (!d.open) handleClose();
      }}
    >
      <DialogSurface>
        <DialogBody>
          <DialogTitle>Migrate from KV</DialogTitle>
          <DialogContent>
            <div className={styles.description}>
              <Body1>
                Imports all data from the legacy KV namespace into D1. This
                includes links, aliases, admin credentials, and global config.
              </Body1>
              <Caption1 style={{ color: tokens.colorNeutralForeground3 }}>
                This is safe to run multiple times — existing D1 data will be
                updated, not duplicated. The LEGACY_KV binding must be
                configured in wrangler.jsonc.
              </Caption1>
              {result && (
                <div className={styles.result}>
                  <div className={styles.resultRow}>
                    <CheckmarkRegular
                      style={{ color: tokens.colorPaletteGreenForeground1 }}
                    />
                    <Text weight="semibold">Migration complete</Text>
                  </div>
                  <Caption1 style={{ color: tokens.colorNeutralForeground3 }}>
                    {result.links} {result.links === 1 ? "link" : "links"},{" "}
                    {result.aliases}{" "}
                    {result.aliases === 1 ? "alias" : "aliases"}
                    {result.admin ? ", admin credentials" : ""}
                    {result.config ? ", global config" : ""}
                  </Caption1>
                </div>
              )}
              {error && (
                <div className={styles.error}>
                  <ErrorCircleRegular
                    style={{ color: tokens.colorStatusDangerForeground1 }}
                  />
                  <Text style={{ color: tokens.colorStatusDangerForeground1 }}>
                    {error}
                  </Text>
                </div>
              )}
            </div>
          </DialogContent>
          <DialogActions>
            <DialogTrigger disableButtonEnhancement>
              <Button appearance="secondary" onClick={handleClose}>
                {result ? "Close" : "Cancel"}
              </Button>
            </DialogTrigger>
            {!result && (
              <Button
                appearance="primary"
                disabled={loading}
                onClick={() => void handleMigrate()}
              >
                {loading ? "Migrating\u2026" : "Migrate"}
              </Button>
            )}
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
