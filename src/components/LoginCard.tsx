import { useState } from "react";
import {
  Button,
  Caption1,
  Divider,
  Field,
  Input,
  Title3,
  tokens,
} from "@fluentui/react-components";
import { PersonRegular } from "@fluentui/react-icons";
import { type StatusResponse, login, startPrismLogin } from "../api";
import AuthLayout from "./AuthLayout";

interface Props {
  onLogin: () => void;
  status: StatusResponse;
}

export default function LoginCard({ onLogin, status }: Props) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [prismLoading, setPrismLoading] = useState(false);

  const passwordAvailable = !!status.passwordSet && !status.prismBound;
  const prismAvailable = !!status.prismEnabled && !!status.prismBound;
  const canMigrate =
    !!status.prismEnabled && !!status.passwordSet && !status.prismBound;

  async function handleSubmit() {
    if (!password) return;
    setLoading(true);
    setError("");
    try {
      await login(password);
      onLogin();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  async function handlePrism() {
    setPrismLoading(true);
    setError("");
    try {
      const url = await startPrismLogin("login");
      window.location.href = url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Prism login failed");
      setPrismLoading(false);
    }
  }

  return (
    <AuthLayout>
      <div>
        <Title3>Sign in</Title3>
        <Caption1
          style={{
            display: "block",
            marginTop: tokens.spacingVerticalXS,
            color: tokens.colorNeutralForeground3,
          }}
        >
          {prismAvailable
            ? "Sign in with your Prism account."
            : passwordAvailable
              ? "Enter your admin password to continue."
              : "No sign-in method is available. Set PRISM_BASE_URL and PRISM_CLIENT_ID, then claim admin."}
        </Caption1>
      </div>

      {prismAvailable && (
        <Button
          appearance="primary"
          icon={<PersonRegular />}
          disabled={prismLoading}
          onClick={() => void handlePrism()}
        >
          {prismLoading ? "Redirecting…" : "Sign in with Prism"}
        </Button>
      )}

      {passwordAvailable && (
        <>
          {prismAvailable && (
            <Divider style={{ margin: `${tokens.spacingVerticalS} 0` }}>
              or
            </Divider>
          )}
          <Field
            validationState={error ? "error" : undefined}
            validationMessage={error || undefined}
          >
            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(_, d) => setPassword(d.value)}
              onKeyDown={(e) => e.key === "Enter" && void handleSubmit()}
            />
          </Field>
          <Button
            appearance={prismAvailable ? "secondary" : "primary"}
            disabled={loading || !password}
            onClick={() => void handleSubmit()}
          >
            {loading ? "Signing in…" : "Sign in with password"}
          </Button>
        </>
      )}

      {canMigrate && (
        <Caption1
          style={{
            color: tokens.colorNeutralForeground3,
            textAlign: "center",
          }}
        >
          Sign in with your password, then migrate to Prism from the admin
          panel.
        </Caption1>
      )}

      {!passwordAvailable && !prismAvailable && error && (
        <Caption1 style={{ color: tokens.colorPaletteRedForeground1 }}>
          {error}
        </Caption1>
      )}
    </AuthLayout>
  );
}
