import { useEffect, useState } from "react";
import {
  Badge,
  Button,
  Caption1,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  DialogTrigger,
  Field,
  Input,
  Text,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import {
  type PrismConfigInfo,
  clearPrismConfig,
  getPrismConfig,
  savePrismConfig,
} from "../../api";

const useStyles = makeStyles({
  form: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalM,
    paddingTop: tokens.spacingVerticalS,
  },
  status: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
  },
  callback: {
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
    wordBreak: "break-all",
  },
});

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prismBound: boolean;
  onChanged?: () => void;
}

export default function PrismSettingsDialog({
  open,
  onOpenChange,
  prismBound,
  onChanged,
}: Props) {
  const styles = useStyles();
  const [info, setInfo] = useState<PrismConfigInfo>({ configured: false });
  const [baseUrl, setBaseUrl] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [clearing, setClearing] = useState(false);

  const callbackUrl = `${window.location.origin}/api/auth/prism/callback`;

  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => {
      setError("");
      setClientSecret("");
    });
    void getPrismConfig()
      .then((cfg) => {
        setInfo(cfg);
        setBaseUrl(cfg.baseUrl ?? "");
        setClientId(cfg.clientId ?? "");
      })
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Failed to load"),
      );
  }, [open]);

  async function handleSave() {
    setLoading(true);
    setError("");
    try {
      await savePrismConfig({
        baseUrl: baseUrl.trim(),
        clientId: clientId.trim(),
        clientSecret: clientSecret.trim(),
      });
      onChanged?.();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setLoading(false);
    }
  }

  async function handleClear() {
    if (
      !confirm(
        "Clear the Prism config stored in D1? Env vars (if any) will be used as fallback.",
      )
    )
      return;
    setClearing(true);
    setError("");
    try {
      await clearPrismConfig();
      onChanged?.();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to clear");
    } finally {
      setClearing(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(_, d) => onOpenChange(d.open)}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>Prism authentication</DialogTitle>
          <DialogContent>
            <div className={styles.form}>
              <div className={styles.status}>
                {info.configured ? (
                  <>
                    <Badge appearance="filled" color="success">
                      Configured
                    </Badge>
                    <Caption1 style={{ color: tokens.colorNeutralForeground3 }}>
                      Source:{" "}
                      {info.source === "db" ? "D1 database" : "env vars"}
                    </Caption1>
                  </>
                ) : (
                  <Badge appearance="outline" color="subtle">
                    Not configured
                  </Badge>
                )}
              </div>

              <Field label="Prism instance URL">
                <Input
                  value={baseUrl}
                  onChange={(_, d) => setBaseUrl(d.value)}
                  placeholder="https://id.example.com"
                />
              </Field>
              <Field label="Client ID">
                <Input
                  value={clientId}
                  onChange={(_, d) => setClientId(d.value)}
                />
              </Field>
              <Field
                label="Client secret"
                hint="Re-enter to overwrite. Stored in D1."
              >
                <Input
                  type="password"
                  value={clientSecret}
                  onChange={(_, d) => setClientSecret(d.value)}
                  placeholder="••••••••"
                />
              </Field>
              <Caption1 style={{ color: tokens.colorNeutralForeground3 }}>
                In your Prism app, set the redirect URI to:
                <br />
                <span className={styles.callback}>{callbackUrl}</span>
              </Caption1>

              {error && (
                <Text style={{ color: tokens.colorStatusDangerForeground1 }}>
                  {error}
                </Text>
              )}
            </div>
          </DialogContent>
          <DialogActions fluid>
            {info.configured && info.source === "db" && (
              <Button
                appearance="subtle"
                disabled={clearing || prismBound}
                title={
                  prismBound
                    ? "Cannot clear while admin is bound to a Prism account"
                    : undefined
                }
                onClick={() => void handleClear()}
              >
                {clearing ? "Clearing…" : "Clear DB config"}
              </Button>
            )}
            <DialogTrigger disableButtonEnhancement>
              <Button appearance="secondary">Cancel</Button>
            </DialogTrigger>
            <Button
              appearance="primary"
              disabled={loading || !baseUrl || !clientId || !clientSecret}
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
