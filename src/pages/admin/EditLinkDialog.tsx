import { useEffect, useState } from "react";
import {
  Badge,
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
  Spinner,
  Switch,
  Textarea,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { AddRegular, DismissRegular } from "@fluentui/react-icons";
import {
  type MultiDestination,
  type TriStateMode,
  type ShortLink,
  addAlias,
  removeAlias,
  updateLink,
} from "../../api";
import LinkSlug from "../../components/LinkSlug";
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
  titleRow: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
    flexWrap: "wrap",
  },
  aliasChips: {
    display: "flex",
    gap: tokens.spacingHorizontalXS,
    flexWrap: "wrap",
    marginBottom: tokens.spacingVerticalXS,
  },
  aliasChip: {
    display: "flex",
    alignItems: "center",
    gap: "2px",
  },
  addAliasRow: {
    display: "flex",
    gap: tokens.spacingHorizontalXS,
    alignItems: "flex-start",
  },
});

function toMode(v: boolean | undefined): TriStateMode {
  if (v === true) return "always";
  if (v === false) return "never";
  return "default";
}

interface Props {
  link: ShortLink | null;
  onClose: () => void;
  onUpdated: (link: ShortLink) => void;
  backendJs?: boolean;
}

export default function EditLinkDialog({
  link,
  onClose,
  onUpdated,
  backendJs: backendJsEnabled,
}: Props) {
  const styles = useStyles();
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [interstitial, setInterstitial] = useState<TriStateMode>("default");
  const [proxy, setProxy] = useState<TriStateMode>("default");
  const [redirectDelay, setRedirectDelay] = useState("");
  const [aliases, setAliases] = useState<string[]>([]);
  const [customJsFrontend, setCustomJsFrontend] = useState("");
  const [customJsBackend, setCustomJsBackend] = useState("");
  const [multi, setMulti] = useState(false);
  const [destinations, setDestinations] = useState<MultiDestination[]>([]);
  const [newAlias, setNewAlias] = useState("");
  const [error, setError] = useState("");
  const [aliasError, setAliasError] = useState("");
  const [loading, setLoading] = useState(false);
  const [aliasLoading, setAliasLoading] = useState(false);

  useEffect(() => {
    if (link) {
      setUrl(link.url);
      setTitle(link.title ?? "");
      setDescription(link.description ?? "");
      setInterstitial(toMode(link.interstitial));
      setProxy(toMode(link.proxy));
      setRedirectDelay(
        link.redirectDelay !== undefined ? String(link.redirectDelay) : "",
      );
      setAliases(link.aliases ?? []);
      setCustomJsFrontend(link.customJsFrontend ?? "");
      setCustomJsBackend(link.customJsBackend ?? "");
      setMulti(!!link.multi);
      setDestinations(
        link.destinations?.length
          ? link.destinations
          : [
              { url: "", title: "", autoRedirectChance: 0, position: 0 },
              { url: "", title: "", autoRedirectChance: 0, position: 1 },
            ],
      );
      setError("");
      setAliasError("");
      setNewAlias("");
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
      const validDests = destinations.filter((d) => d.url && d.title);
      const updated = await updateLink(link.id, {
        url,
        ...(title ? { title } : {}),
        ...(description ? { description } : {}),
        interstitial,
        redirectDelay:
          redirectDelay === "" ? null : Math.max(0, Number(redirectDelay) || 0),
        proxy,
        customJsFrontend: customJsFrontend || null,
        customJsBackend: customJsBackend || null,
        multi,
        ...(multi ? { destinations: validDests } : {}),
      });
      onUpdated(updated);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setLoading(false);
    }
  }

  async function handleAddAlias() {
    if (!link || !newAlias.trim()) return;
    setAliasError("");
    setAliasLoading(true);
    try {
      const updated = await addAlias(link.id, newAlias.trim());
      setAliases(updated.aliases ?? []);
      setNewAlias("");
      onUpdated(updated);
    } catch (e) {
      setAliasError(e instanceof Error ? e.message : "Failed to add alias");
    } finally {
      setAliasLoading(false);
    }
  }

  async function handleRemoveAlias(aliasId: string) {
    if (!link) return;
    setAliasLoading(true);
    try {
      const updated = await removeAlias(link.id, aliasId);
      setAliases(updated.aliases ?? []);
      onUpdated(updated);
    } catch {
      // ignore
    } finally {
      setAliasLoading(false);
    }
  }

  return (
    <Dialog open={link !== null} onOpenChange={(_, d) => !d.open && onClose()}>
      <DialogSurface style={multi ? { maxWidth: "560px" } : undefined}>
        <DialogBody>
          <DialogTitle>
            <span className={styles.titleRow}>
              Edit {link && <LinkSlug id={link.id} size="md" />}
            </span>
          </DialogTitle>
          <DialogContent
            style={multi ? { maxHeight: "60vh", overflowY: "auto" } : undefined}
          >
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
                label="Redirect delay (seconds)"
                hint="Leave blank to use global setting"
              >
                <Input
                  type="number"
                  placeholder="e.g. 3"
                  value={redirectDelay}
                  onChange={(_, d) => setRedirectDelay(d.value)}
                  style={{ maxWidth: "120px" }}
                />
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
                <Field label="Destinations">
                  <DestinationsEditor
                    destinations={destinations}
                    onChange={setDestinations}
                  />
                </Field>
              )}
              <Field
                label="Aliases"
                hint="Alternative short IDs that redirect to the same destination"
                validationState={aliasError ? "error" : undefined}
                validationMessage={aliasError || undefined}
              >
                {aliases.length > 0 && (
                  <div className={styles.aliasChips}>
                    {aliases.map((a) => (
                      <div key={a} className={styles.aliasChip}>
                        <Badge appearance="tint" color="informative">
                          {a}
                        </Badge>
                        <Button
                          size="small"
                          appearance="transparent"
                          icon={<DismissRegular style={{ fontSize: "10px" }} />}
                          style={{ minWidth: 0, padding: "2px" }}
                          disabled={aliasLoading}
                          onClick={() => void handleRemoveAlias(a)}
                        />
                      </div>
                    ))}
                  </div>
                )}
                <div className={styles.addAliasRow}>
                  <Input
                    placeholder="e.g. sw"
                    value={newAlias}
                    onChange={(_, d) => setNewAlias(d.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void handleAddAlias();
                    }}
                  />
                  <Button
                    icon={
                      aliasLoading ? <Spinner size="tiny" /> : <AddRegular />
                    }
                    disabled={aliasLoading || !newAlias.trim()}
                    onClick={() => void handleAddAlias()}
                  >
                    Add
                  </Button>
                </div>
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
