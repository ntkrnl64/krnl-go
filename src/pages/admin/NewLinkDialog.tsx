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
import {
  type CreateLinkResult,
  type TriStateMode,
  createLink,
} from "../../api";

const INTERSTITIAL_LABELS: Record<TriStateMode, string> = {
  default: "Default (use global setting)",
  always: "Always show",
  never: "Never show",
};

const PROXY_LABELS: Record<TriStateMode, string> = {
  default: "Default (use global setting)",
  always: "Always proxy",
  never: "Never proxy",
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
  onCreated: (link: CreateLinkResult) => void;
  backendJs?: boolean;
}

export default function NewLinkDialog({
  open,
  onOpenChange,
  onCreated,
  backendJs: backendJsEnabled,
}: Props) {
  const styles = useStyles();
  const [id, setId] = useState("");
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [interstitial, setInterstitial] = useState<TriStateMode>("default");
  const [proxy, setProxy] = useState<TriStateMode>("default");
  const [redirectDelay, setRedirectDelay] = useState("");
  const [customJsFrontend, setCustomJsFrontend] = useState("");
  const [customJsBackend, setCustomJsBackend] = useState("");
  const [idError, setIdError] = useState("");
  const [urlError, setUrlError] = useState("");
  const [loading, setLoading] = useState(false);

  function reset() {
    setId("");
    setUrl("");
    setTitle("");
    setDescription("");
    setInterstitial("default");
    setProxy("default");
    setRedirectDelay("");
    setCustomJsFrontend("");
    setCustomJsBackend("");
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
        proxy,
        customJsFrontend: customJsFrontend || null,
        customJsBackend: customJsBackend || null,
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
              <Field
                label="Reverse proxy"
                hint="Serve destination content directly instead of redirecting"
              >
                <Dropdown
                  value={PROXY_LABELS[proxy]}
                  selectedOptions={[proxy]}
                  onOptionSelect={(_, d) =>
                    setProxy(d.optionValue as TriStateMode)
                  }
                >
                  <Option value="default">Default (use global setting)</Option>
                  <Option value="always">Always proxy</Option>
                  <Option value="never">Never proxy</Option>
                </Dropdown>
              </Field>
              <Field label="Interstitial page">
                <Dropdown
                  value={INTERSTITIAL_LABELS[interstitial]}
                  selectedOptions={[interstitial]}
                  onOptionSelect={(_, d) =>
                    setInterstitial(d.optionValue as TriStateMode)
                  }
                >
                  <Option value="default">Default (use global setting)</Option>
                  <Option value="always">Always show</Option>
                  <Option value="never">Never show</Option>
                </Dropdown>
              </Field>
              <Field
                label="Custom JS (frontend)"
                hint="Runs in the browser on interstitial / multi-select page"
              >
                <Textarea
                  placeholder="e.g. console.log('hello')"
                  value={customJsFrontend}
                  onChange={(_, d) => setCustomJsFrontend(d.value)}
                  rows={3}
                  style={{
                    fontFamily:
                      "'Cascadia Code', 'Cascadia Mono', Consolas, monospace",
                    fontSize: "13px",
                  }}
                />
              </Field>
              {backendJsEnabled && (
                <Field
                  label="Custom JS (backend)"
                  hint="Runs on the worker when the link is visited — has access to env, request, linkData"
                >
                  <Textarea
                    placeholder="e.g. await env.DB.prepare('...').run()"
                    value={customJsBackend}
                    onChange={(_, d) => setCustomJsBackend(d.value)}
                    rows={3}
                    style={{
                      fontFamily:
                        "'Cascadia Code', 'Cascadia Mono', Consolas, monospace",
                      fontSize: "13px",
                    }}
                  />
                </Field>
              )}
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
