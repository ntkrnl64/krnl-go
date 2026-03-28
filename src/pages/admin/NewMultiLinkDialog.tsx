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
  Field,
  Input,
  Textarea,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import {
  type CreateLinkResult,
  type MultiDestination,
  createLink,
} from "../../api";
import DestinationsEditor from "./DestinationsEditor";

const useStyles = makeStyles({
  form: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalM,
    paddingTop: tokens.spacingVerticalS,
  },
  scrollBody: {
    maxHeight: "60vh",
    overflowY: "auto",
  },
});

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (link: CreateLinkResult) => void;
  backendJs?: boolean;
}

export default function NewMultiLinkDialog({
  open,
  onOpenChange,
  onCreated,
  backendJs: backendJsEnabled,
}: Props) {
  const styles = useStyles();
  const [id, setId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [destinations, setDestinations] = useState<MultiDestination[]>([
    { url: "", title: "", autoRedirectChance: 0, position: 0 },
    { url: "", title: "", autoRedirectChance: 0, position: 1 },
  ]);
  const [customJsFrontend, setCustomJsFrontend] = useState("");
  const [customJsBackend, setCustomJsBackend] = useState("");
  const [idError, setIdError] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function reset() {
    setId("");
    setTitle("");
    setDescription("");
    setDestinations([
      { url: "", title: "", autoRedirectChance: 0, position: 0 },
      { url: "", title: "", autoRedirectChance: 0, position: 1 },
    ]);
    setCustomJsFrontend("");
    setCustomJsBackend("");
    setIdError("");
    setError("");
  }

  const validDests = destinations.filter((d) => d.url && d.title);

  async function handleCreate() {
    setIdError("");
    setError("");
    if (validDests.length < 1) {
      setError("At least one destination with URL and title is required");
      return;
    }
    setLoading(true);
    try {
      const link = await createLink({
        id: id || undefined,
        url: validDests[0].url, // primary URL for the link record
        ...(title ? { title } : {}),
        ...(description ? { description } : {}),
        customJsFrontend: customJsFrontend || null,
        customJsBackend: customJsBackend || null,
        multi: true,
        destinations: validDests,
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

  return (
    <Dialog
      open={open}
      onOpenChange={(_, d) => {
        if (!d.open) reset();
        onOpenChange(d.open);
      }}
    >
      <DialogSurface style={{ maxWidth: "560px" }}>
        <DialogBody>
          <DialogTitle>New multi-select link</DialogTitle>
          <DialogContent className={styles.scrollBody}>
            <div className={styles.form}>
              <Field
                label="Custom ID"
                hint="Optional — leave blank to auto-generate"
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
                label="Page title"
                hint="Shown at the top of the selection page"
              >
                <Input
                  placeholder="e.g. Choose a destination"
                  value={title}
                  onChange={(_, d) => setTitle(d.value)}
                />
              </Field>
              <Field label="Page description" hint="Shown below the title">
                <Textarea
                  placeholder="e.g. Select one of the options below"
                  value={description}
                  onChange={(_, d) => setDescription(d.value)}
                  rows={2}
                />
              </Field>
              <Field
                label="Custom JS (frontend)"
                hint="Runs in the browser on multi-select page"
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
            </div>
          </DialogContent>
          <DialogActions>
            <DialogTrigger disableButtonEnhancement>
              <Button appearance="secondary">Cancel</Button>
            </DialogTrigger>
            <Button
              appearance="primary"
              disabled={loading || validDests.length < 1}
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
