import { useState } from "react";
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
import { type InterstitialMode, type ShortLink, createLink } from "../../api";

const INTERSTITIAL_LABELS: Record<InterstitialMode, string> = {
  default: "Default (use global setting)",
  always: "Always show",
  never: "Never show",
};

const useStyles = makeStyles({
  form: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalM,
    paddingTop: tokens.spacingVerticalS,
  },
});

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (link: ShortLink) => void;
}

export default function NewLinkDialog({
  open,
  onOpenChange,
  onCreated,
}: Props) {
  const styles = useStyles();
  const [id, setId] = useState("");
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [interstitial, setInterstitial] = useState<InterstitialMode>("default");
  const [redirectDelay, setRedirectDelay] = useState("");
  const [idError, setIdError] = useState("");
  const [urlError, setUrlError] = useState("");
  const [loading, setLoading] = useState(false);

  function reset() {
    setId("");
    setUrl("");
    setTitle("");
    setDescription("");
    setInterstitial("default");
    setRedirectDelay("");
    setIdError("");
    setUrlError("");
  }

  async function handleCreate() {
    setIdError("");
    setUrlError("");
    if (!url) {
      setUrlError("URL is required");
      return;
    }
    setLoading(true);
    try {
      const link = await createLink({
        id: id || undefined,
        url,
        ...(title ? { title } : {}),
        ...(description ? { description } : {}),
        interstitial,
        redirectDelay:
          redirectDelay === "" ? null : Math.max(0, Number(redirectDelay) || 0),
      });
      onCreated(link);
      onOpenChange(false);
      reset();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to create";
      if (msg.toLowerCase().includes("id")) {
        setIdError(msg);
      } else {
        setUrlError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(_, d) => {
        if (!d.open) reset();
        onOpenChange(d.open);
      }}
    >
      <DialogSurface>
        <DialogBody>
          <DialogTitle>New short link</DialogTitle>
          <DialogContent>
            <div className={styles.form}>
              <Field
                label="Custom ID"
                hint="Optional — leave blank to auto-generate. Allowed: a–z, A–Z, 0–9, _ -"
                validationState={idError ? "error" : undefined}
                validationMessage={idError || undefined}
              >
                <Input
                  placeholder="e.g. my-link"
                  value={id}
                  onChange={(_, d) => setId(d.value)}
                />
              </Field>
              <Field
                label="Destination URL"
                required
                validationState={urlError ? "error" : undefined}
                validationMessage={urlError || undefined}
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
              onClick={() => void handleCreate()}
            >
              {loading ? "Creating…" : "Create"}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
