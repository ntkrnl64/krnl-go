import { useEffect, useState } from "react";
import {
  Body1,
  Button,
  Caption1,
  Divider,
  Field,
  Input,
  Title3,
  tokens,
} from "@fluentui/react-components";
import { PersonRegular } from "@fluentui/react-icons";
import {
  type StatusResponse,
  checkStatus,
  getPrismConfig,
  savePrismConfig,
  setup,
  startPrismLogin,
} from "../api";
import AuthLayout from "../components/AuthLayout";

interface Props {
  onComplete: () => void;
  status: StatusResponse;
}

export default function SetupPage({ onComplete, status }: Props) {
  const [s, setS] = useState<StatusResponse>(status);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [prismLoading, setPrismLoading] = useState(false);

  const [showPrismForm, setShowPrismForm] = useState(false);
  const [baseUrl, setBaseUrl] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [savingConfig, setSavingConfig] = useState(false);

  const callbackUrl = `${window.location.origin}/api/auth/prism/callback`;

  useEffect(() => {
    void getPrismConfig()
      .then((cfg) => {
        if (cfg.configured) {
          setBaseUrl(cfg.baseUrl ?? "");
          setClientId(cfg.clientId ?? "");
        }
      })
      .catch(() => {});
  }, []);

  async function handleCreate() {
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      await setup(password);
      onComplete();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Setup failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleClaimWithPrism() {
    setPrismLoading(true);
    setError("");
    try {
      const url = await startPrismLogin("claim");
      window.location.href = url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Prism claim failed");
      setPrismLoading(false);
    }
  }

  async function handleSaveConfig() {
    setSavingConfig(true);
    setError("");
    try {
      await savePrismConfig({
        baseUrl: baseUrl.trim(),
        clientId: clientId.trim(),
        clientSecret: clientSecret.trim(),
      });
      const next = await checkStatus();
      setS(next);
      setShowPrismForm(false);
      setClientSecret("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save Prism config");
    } finally {
      setSavingConfig(false);
    }
  }

  return (
    <AuthLayout>
      <div>
        <Title3>Welcome</Title3>
        <Caption1
          style={{
            display: "block",
            marginTop: tokens.spacingVerticalXS,
            color: tokens.colorNeutralForeground3,
          }}
        >
          Choose how to set up admin access. The first claim wins and locks out
          all other accounts.
        </Caption1>
      </div>

      {s.prismEnabled ? (
        <>
          <Button
            appearance="primary"
            icon={<PersonRegular />}
            disabled={prismLoading}
            onClick={() => void handleClaimWithPrism()}
          >
            {prismLoading ? "Redirecting…" : "Claim admin with Prism"}
          </Button>
          <Caption1
            style={{
              color: tokens.colorNeutralForeground3,
              textAlign: "center",
            }}
          >
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                setShowPrismForm((v) => !v);
              }}
              style={{ color: tokens.colorBrandForegroundLink }}
            >
              {showPrismForm ? "Hide" : "Reconfigure Prism"}
            </a>
          </Caption1>
        </>
      ) : (
        <>
          <Body1>
            Configure a{" "}
            <a
              href="https://github.com/siiway/prism"
              target="_blank"
              rel="noreferrer"
              style={{ color: tokens.colorBrandForegroundLink }}
            >
              Prism
            </a>{" "}
            instance to use OAuth, or skip ahead and set a password.
          </Body1>
          <Button
            appearance="primary"
            onClick={() => setShowPrismForm((v) => !v)}
          >
            {showPrismForm ? "Hide Prism config" : "Configure Prism"}
          </Button>
        </>
      )}

      {showPrismForm && (
        <>
          <Field label="Prism instance URL" hint="e.g. https://id.example.com">
            <Input
              value={baseUrl}
              onChange={(_, d) => setBaseUrl(d.value)}
              placeholder="https://id.example.com"
            />
          </Field>
          <Field label="Client ID">
            <Input value={clientId} onChange={(_, d) => setClientId(d.value)} />
          </Field>
          <Field
            label="Client secret"
            hint={
              s.prismEnabled
                ? "Leave blank to keep the current secret? No — re-enter to overwrite."
                : "Stored in your D1 database."
            }
          >
            <Input
              type="password"
              value={clientSecret}
              onChange={(_, d) => setClientSecret(d.value)}
            />
          </Field>
          <Caption1 style={{ color: tokens.colorNeutralForeground3 }}>
            In your Prism app, set the redirect URI to:
            <br />
            <code
              style={{
                fontFamily: tokens.fontFamilyMonospace,
                color: tokens.colorNeutralForeground2,
              }}
            >
              {callbackUrl}
            </code>
          </Caption1>
          <Button
            appearance="primary"
            disabled={savingConfig || !baseUrl || !clientId || !clientSecret}
            onClick={() => void handleSaveConfig()}
          >
            {savingConfig ? "Saving…" : "Save and continue"}
          </Button>
        </>
      )}

      <Divider style={{ margin: `${tokens.spacingVerticalS} 0` }}>
        or set a password
      </Divider>

      <Field label="Password" validationState={error ? "error" : undefined}>
        <Input
          type="password"
          placeholder="At least 8 characters"
          value={password}
          onChange={(_, d) => setPassword(d.value)}
        />
      </Field>
      <Field
        label="Confirm password"
        validationState={error ? "error" : undefined}
        validationMessage={error || undefined}
      >
        <Input
          type="password"
          placeholder="Repeat password"
          value={confirm}
          onChange={(_, d) => setConfirm(d.value)}
          onKeyDown={(e) => e.key === "Enter" && void handleCreate()}
        />
      </Field>
      <Button
        appearance="secondary"
        disabled={loading || !password || !confirm}
        onClick={() => void handleCreate()}
      >
        {loading ? "Creating…" : "Create password"}
      </Button>
    </AuthLayout>
  );
}
