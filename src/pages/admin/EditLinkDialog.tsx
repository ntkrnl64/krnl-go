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
  Dropdown,
  Field,
  Input,
  Option,
  Textarea,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { type InterstitialMode, type ShortLink, updateLink } from "../../api";

const INTERSTITIAL_LABELS: Record<InterstitialMode, string> = {
  default: "Default (use global setting)",
  always: "Always show",
  never: "Never show",
};
import LinkSlug from "../../components/LinkSlug";

const useStyles = makeStyles({
  form: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalM,
    paddingTop: tokens.spacingVerticalS,
  },
  titleRow: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
    flexWrap: "wrap",
  },
});

function toMode(v: boolean | undefined): InterstitialMode {
  if (v === true) return "always";
  if (v === false) return "never";
  return "default";
}

interface Props {
  link: ShortLink | null;
  onClose: () => void;
  onUpdated: (link: ShortLink) => void;
}

export default function EditLinkDialog({ link, onClose, onUpdated }: Props) {
  const styles = useStyles();
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [interstitial, setInterstitial] = useState<InterstitialMode>("default");
  const [redirectDelay, setRedirectDelay] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (link) {
      setUrl(link.url);
      setTitle(link.title ?? "");
      setDescription(link.description ?? "");
      setInterstitial(toMode(link.interstitial));
      setRedirectDelay(
        link.redirectDelay !== undefined ? String(link.redirectDelay) : "",
      );
      setError("");
    }
  }, [link]);

  async function handleSave() {
    if (!link) return;
    setError("");
    if (!url) {
      setError("URL is required");
      return;
    }
    setLoading(true);
    try {
      const updated = await updateLink(link.id, {
        url,
        ...(title ? { title } : {}),
        ...(description ? { description } : {}),
        interstitial,
        redirectDelay:
          redirectDelay === "" ? null : Math.max(0, Number(redirectDelay) || 0),
      });
      onUpdated(updated);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={link !== null} onOpenChange={(_, d) => !d.open && onClose()}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>
            <span className={styles.titleRow}>
              Edit {link && <LinkSlug id={link.id} size="md" />}
            </span>
          </DialogTitle>
          <DialogContent>
            <div className={styles.form}>
              <Field
                label="Destination URL"
                required
                validationState={error ? "error" : undefined}
                validationMessage={error || undefined}
              >
                <Input
                  placeholder="https://example.com"
                  value={url}
                  onChange={(_, d) => setUrl(d.value)}
                />
              </Field>
              <Field
                label="Title"
                hint="Optional — shown on the interstitial page"
              >
                <Input
                  placeholder="e.g. Visit our website"
                  value={title}
                  onChange={(_, d) => setTitle(d.value)}
                />
              </Field>
              <Field
                label="Description"
                hint="Optional — shown on the interstitial page"
              >
                <Textarea
                  placeholder="e.g. You're about to visit…"
                  value={description}
                  onChange={(_, d) => setDescription(d.value)}
                  rows={2}
                />
              </Field>
              <Field label="Interstitial page">
                <Dropdown
                  value={INTERSTITIAL_LABELS[interstitial]}
                  selectedOptions={[interstitial]}
                  onOptionSelect={(_, d) =>
                    setInterstitial(d.optionValue as InterstitialMode)
                  }
                >
                  <Option value="default">Default (use global setting)</Option>
                  <Option value="always">Always show</Option>
                  <Option value="never">Never show</Option>
                </Dropdown>
              </Field>
            </div>
          </DialogContent>
          <DialogActions>
            <DialogTrigger disableButtonEnhancement>
              <Button appearance="secondary">Cancel</Button>
            </DialogTrigger>
            <Button
              appearance="primary"
              disabled={loading || !url}
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
