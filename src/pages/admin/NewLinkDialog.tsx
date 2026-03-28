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
  Switch,
  Textarea,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import {
  type CreateLinkResult,
  type MultiDestination,
  type TriStateMode,
  createLink,
} from "../../api";
import DestinationsEditor from "./DestinationsEditor";

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
  const [multi, setMulti] = useState(false);
  const [destinations, setDestinations] = useState<MultiDestination[]>([
    { url: "", title: "", autoRedirectChance: 0, position: 0 },
    { url: "", title: "", autoRedirectChance: 0, position: 1 },
  ]);
  const [idError, setIdError] = useState("");
  const [error, setError] = useState("");
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
    setMulti(false);
    setDestinations([
      { url: "", title: "", autoRedirectChance: 0, position: 0 },
      { url: "", title: "", autoRedirectChance: 0, position: 1 },
    ]);
    setIdError("");
    setError("");
  }

  const validDests = destinations.filter((d) => d.url && d.title);

  async function handleCreate() {
    setIdError("");
    setError("");
    if (multi && validDests.length < 1) {
      setError("At least one destination with URL and title is required");
      return;
    }
    if (!multi && !url) {
      setError("URL is required");
      return;
    }
    setLoading(true);
    try {
      const link = await createLink({
        id: id || undefined,
        url: multi ? validDests[0].url : url,
        ...(title ? { title } : {}),
        ...(description ? { description } : {}),
        interstitial,
        proxy,
        customJsFrontend: customJsFrontend || null,
        customJsBackend: customJsBackend || null,
        redirectDelay:
          redirectDelay === "" ? null : Math.max(0, Number(redirectDelay) || 0),
        multi,
        ...(multi ? { destinations: validDests } : {}),
      });
      onCreated(link);
      onOpenChange(false);
      reset();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to create";
      if (msg.toLowerCase().includes("id")) {
        setIdError(msg);
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  const canCreate = multi ? validDests.length >= 1 : !!url;

  return (
    <Dialog
      open={open}
      onOpenChange={(_, d) => {
        if (!d.open) reset();
        onOpenChange(d.open);
      }}
    >
      <DialogSurface style={multi ? { maxWidth: "560px" } : undefined}>
        <DialogBody>
          <DialogTitle>New short link</DialogTitle>
          <DialogContent
            style={multi ? { maxHeight: "60vh", overflowY: "auto" } : undefined}
          >
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
              {!multi && (
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
              )}
              <Field
                label="Title"
                hint={
                  multi
                    ? "Shown at the top of the selection page"
                    : "Optional — shown on the interstitial page"
                }
              >
                <Input
                  placeholder={
                    multi
                      ? "e.g. Choose a destination"
                      : "e.g. Visit our website"
                  }
                  value={title}
                  onChange={(_, d) => setTitle(d.value)}
                />
              </Field>
              <Field
                label="Description"
                hint={
                  multi
                    ? "Shown below the title"
                    : "Optional — shown on the interstitial page"
                }
              >
                <Textarea
                  placeholder={
                    multi
                      ? "e.g. Select one of the options below"
                      : "e.g. You're about to visit…"
                  }
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
              <Field label="Multi-select link">
                <Switch
                  checked={multi}
                  onChange={(_, d) => setMulti(d.checked)}
                  label={
                    multi
                      ? "Enabled — visitors choose a destination"
                      : "Disabled — single destination"
                  }
                />
              </Field>
              {multi && (
                <>
                  {error && (
                    <div
                      style={{
                        color: tokens.colorPaletteRedForeground1,
                        fontSize: tokens.fontSizeBase200,
                      }}
                    >
                      {error}
                    </div>
                  )}
                  <DestinationsEditor
                    destinations={destinations}
                    onChange={setDestinations}
                  />
                </>
              )}
            </div>
          </DialogContent>
          <DialogActions>
            <DialogTrigger disableButtonEnhancement>
              <Button appearance="secondary">Cancel</Button>
            </DialogTrigger>
            <Button
              appearance="primary"
              disabled={loading || !canCreate}
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
