import { useEffect, useState } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  DialogTrigger,
  Field,
  Input,
  Switch,
  Text,
  Textarea,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { type GlobalConfig, getConfig, saveConfig } from "../../api";

const useStyles = makeStyles({
  form: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalM,
    paddingTop: tokens.spacingVerticalS,
  },
  switchRow: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalXS,
  },
  switchLabel: {
    fontSize: tokens.fontSizeBase300,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground1,
  },
});

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function SettingsDialog({ open, onOpenChange }: Props) {
  const styles = useStyles();
  const [config, setConfig] = useState<GlobalConfig>({
    defaultInterstitial: false,
    interstitialTitle: "You are being redirected",
    interstitialDescription: "You are about to visit an external website.",
    redirectDelay: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setError("");
      void getConfig().then((c) => setConfig(c));
    }
  }, [open]);

  async function handleSave() {
    setLoading(true);
    setError("");
    try {
      await saveConfig(config);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save settings");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(_, d) => onOpenChange(d.open)}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>Settings</DialogTitle>
          <DialogContent>
            <div className={styles.form}>
              <div className={styles.switchRow}>
                <span className={styles.switchLabel}>Interstitial page</span>
                <Switch
                  label={
                    config.defaultInterstitial
                      ? "Enabled by default"
                      : "Disabled by default"
                  }
                  checked={config.defaultInterstitial}
                  onChange={(_, d) =>
                    setConfig((c) => ({ ...c, defaultInterstitial: d.checked }))
                  }
                />
              </div>
              <Field label="Default page title">
                <Input
                  value={config.interstitialTitle}
                  onChange={(_, d) =>
                    setConfig((c) => ({ ...c, interstitialTitle: d.value }))
                  }
                />
              </Field>
              <Field label="Default page description">
                <Textarea
                  value={config.interstitialDescription}
                  onChange={(_, d) =>
                    setConfig((c) => ({
                      ...c,
                      interstitialDescription: d.value,
                    }))
                  }
                  rows={3}
                />
              </Field>
              <Field
                label="Auto-redirect delay"
                hint="Seconds before auto-redirecting. 0 = disabled (user must click Continue)."
              >
                <Input
                  type="number"
                  min="0"
                  step="0.5"
                  value={String(config.redirectDelay)}
                  onChange={(_, d) =>
                    setConfig((c) => ({
                      ...c,
                      redirectDelay: Math.max(0, Number(d.value) || 0),
                    }))
                  }
                  contentAfter={
                    <span style={{ color: tokens.colorNeutralForeground3 }}>
                      s
                    </span>
                  }
                />
              </Field>
              {error && (
                <Text style={{ color: tokens.colorStatusDangerForeground1 }}>
                  {error}
                </Text>
              )}
            </div>
          </DialogContent>
          <DialogActions>
            <DialogTrigger disableButtonEnhancement>
              <Button appearance="secondary">Cancel</Button>
            </DialogTrigger>
            <Button
              appearance="primary"
              disabled={loading}
              onClick={() => void handleSave()}
            >
              {loading ? "Saving…" : "Save"}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
