import { useState } from "react";
import {
  Button,
  Caption1,
  Field,
  Input,
  Title3,
  tokens,
} from "@fluentui/react-components";
import { login } from "../api";
import AuthLayout from "./AuthLayout";

export default function LoginCard({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
          Enter your admin password to continue.
        </Caption1>
      </div>
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
        appearance="primary"
        disabled={loading || !password}
        onClick={() => void handleSubmit()}
      >
        {loading ? "Signing in…" : "Sign in"}
      </Button>
    </AuthLayout>
  );
}
